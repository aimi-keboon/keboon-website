import express from 'express';
import rateLimit from 'express-rate-limit';
import Stripe from 'stripe';
import {createHmac} from 'node:crypto';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

const stripeKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
if (!stripeKey || !/^sk_(test|live)_/.test(stripeKey)) {
  throw new Error('Set STRIPE_SECRET_KEY in the server environment');
}
if (!webhookSecret || !webhookSecret.startsWith('whsec_')) {
  throw new Error('Set STRIPE_WEBHOOK_SECRET in the server environment');
}
const stripe = new Stripe(stripeKey);
const port = Number(process.env.PORT || 3000);
const shopUrl = process.env.PUBLIC_SHOP_URL || 'https://keboon.net/shop/';
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://keboon.net,https://www.keboon.net')
  .split(',').map(x => x.trim()).filter(Boolean);
const checkoutEnabled = process.env.CHECKOUT_ENABLED === 'true';
const appsScriptUrl = process.env.SHOP_APPS_SCRIPT_URL || '';
const appsScriptSecret = process.env.SHOP_APPS_SCRIPT_SECRET || '';
if (appsScriptUrl && !/^https:\/\/script\.google\.com\/macros\/s\/[^/?#]+\/exec$/.test(appsScriptUrl)) {
  throw new Error('SHOP_APPS_SCRIPT_URL must be the deployed /exec HTTPS URL');
}
if (appsScriptUrl && appsScriptSecret.length < 32) {
  throw new Error('SHOP_APPS_SCRIPT_SECRET must be 32 or more characters when Apps Script is configured');
}
if (checkoutEnabled && !appsScriptUrl) {
  throw new Error('Configure SHOP_APPS_SCRIPT_URL before enabling checkout');
}

const safeText = value => String(value || '').slice(0, 3800);
function postalAddress(address) {
  if (!address) return '';
  return [
    address.line1, address.line2, address.city,
    address.state, address.postal_code, address.country
  ].filter(Boolean).map(safeText).join(', ');
}

async function syncPaidOrderToAppsScript(session, eventId) {
  if (!appsScriptUrl) return;

  // Stripe is the source of truth; never trust payment-status fields from the browser.
  const [lineItems, customer, invoice] = await Promise.all([
    stripe.checkout.sessions.listLineItems(session.id, {limit:100}),
    session.customer ? stripe.customers.retrieve(session.customer) : null,
    session.invoice ? stripe.invoices.retrieve(session.invoice) : null
  ]);
  const details = session.customer_details || {};
  const shipping = session.collected_information?.shipping_details || session.shipping_details || {};
  const shippingCents = session.total_details?.amount_shipping ??
    session.shipping_cost?.amount_total ?? 0;
  const subtotalCents = session.amount_subtotal ??
    Math.max(0,(session.amount_total || 0)-shippingCents);

  const message = JSON.stringify({
    sessionId:session.id,
    eventId,
    sentAt:Date.now(),
    paymentStatus:session.payment_status,
    paidAt:new Date().toISOString(),
    currency:session.currency,
    email:details.email || (customer && !customer.deleted ? customer.email : '') || '',
    phone:details.phone || (customer && !customer.deleted ? customer.phone : '') || '',
    customerName:details.name || shipping.name || '',
    shippingAddress:postalAddress(shipping.address || details.address),
    customerId:typeof session.customer === 'string' ? session.customer : session.customer?.id || '',
    invoiceUrl:invoice?.hosted_invoice_url || '',
    amountSubtotal:subtotalCents,
    amountShipping:shippingCents,
    amountTotal:session.amount_total,
    items:lineItems.data.map(item => ({name:safeText(item.description),quantity:item.quantity}))
  });
  const signature = createHmac('sha256', appsScriptSecret).update(message,'utf8').digest('hex');
  const response = await fetch(appsScriptUrl, {
    method:'POST',
    headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify({message,signature}),
    redirect:'follow',
    signal:AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error('Apps Script returned HTTP ' + response.status);
  const result = await response.json();
  if (!result.ok || result.sessionId !== session.id) {
    throw new Error('Apps Script did not confirm order entry');
  }
}
const feeRaw = process.env.SHIPPING_FEE_MYR;
const shippingFee = feeRaw === undefined || !/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(feeRaw)
  ? null : Math.round(Number(feeRaw) * 100);
if (!/^https:\/\//.test(shopUrl) || !allowedOrigins.every(x => /^https:\/\//.test(x))) {
  throw new Error('Use HTTPS for PUBLIC_SHOP_URL and ALLOWED_ORIGINS');
}

// Server-controlled price list. Never use cart prices received from a browser.
const catalog = Object.freeze({
  imuno: {name:'KEBOON GROW Imuno+ (250 mL)', unit_amount:7500},
  zinc:  {name:'KEBOON GROW Zinc+ (250 mL)', unit_amount:7500},
  soil:  {name:'KEBOON GROW Soil+ 4-in-1 (1 Litre)', unit_amount:12000},
  vital: {name:'KEBOON GROW Vital+ (1 Litre)', unit_amount:12000}
});

app.get('/health', (_req, res) => res.json({ok:true, checkoutEnabled}));

// Stripe needs the *raw* body for signature verification. Register before JSON middleware.
app.post('/webhook', express.raw({type:'application/json', limit:'256kb'}), async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], webhookSecret);
  } catch (err) {
    console.warn('Rejected Stripe webhook signature:', err.message);
    return res.status(400).send('Invalid webhook signature');
  }

  try {
    if (event.type === 'checkout.session.completed' ||
        event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object;
      if (session.payment_status === 'paid') {
        // Stripe creates the paid invoice; customer emails depend on Stripe settings.
        // Retry delivery of verified orders to the dedicated Google Sheet if needed.
        await syncPaidOrderToAppsScript(session, event.id);
        console.info('Paid order verified and synced', {session:session.id, amount:session.amount_total});
      }
    } else if (event.type === 'checkout.session.async_payment_failed') {
      console.info('Payment failed', {session:event.data.object.id});
    }
    res.sendStatus(200);
  } catch (err) {
    console.error('Webhook processing failed', err);
    res.sendStatus(500); // Stripe may retry.
  }
});

// Allow the published shop to call this separate HTTPS backend.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary','Origin');
    res.header('Access-Control-Allow-Methods','GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers','Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(origin && allowedOrigins.includes(origin) ? 204 : 403);
  if (origin && !allowedOrigins.includes(origin)) return res.status(403).json({error:'Origin not allowed'});
  next();
});
app.use(express.json({limit:'16kb'}));

const checkoutLimit = rateLimit({
  windowMs:15*60*1000,
  limit:15,
  standardHeaders:'draft-7',
  legacyHeaders:false
});
app.post('/api/checkout', checkoutLimit, async (req, res) => {
  if (!checkoutEnabled) return res.status(503).json({error:'Checkout is not open yet.'});
  if (shippingFee === null) return res.status(503).json({error:'Shipping is not configured.'});

  const {items, email, phone} = req.body || {};
  if (typeof email !== 'string' || email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({error:'A valid email is required.'});
  }
  if (typeof phone !== 'string' || !/^\+?[0-9 ()-]{7,24}$/.test(phone.trim())) {
    return res.status(400).json({error:'A valid phone number is required.'});
  }
  if (!Array.isArray(items) || items.length < 1 || items.length > 4) {
    return res.status(400).json({error:'Your cart is invalid.'});
  }
  const used = new Set(), line_items = [];
  for (const item of items) {
    if (!item || typeof item.id !== 'string' || !Object.hasOwn(catalog,item.id) ||
        used.has(item.id) || !Number.isInteger(item.quantity) ||
        item.quantity < 1 || item.quantity > 20) {
      return res.status(400).json({error:'Your cart contains invalid products or quantities.'});
    }
    used.add(item.id);
    const product = catalog[item.id];
    line_items.push({
      price_data:{
        currency:'myr',
        unit_amount:product.unit_amount,
        product_data:{name:product.name}
      },
      quantity:item.quantity
    });
  }

  try {
    // Customer is created first so its required email/phone are retained for
    // the paid invoice and order records in the Stripe Dashboard.
    const customer = await stripe.customers.create({
      email:email.trim(),
      phone:phone.trim(),
      metadata:{source:'keboon-grow-shop'}
    });
    const session = await stripe.checkout.sessions.create({
      mode:'payment',
      customer:customer.id,
      line_items,
      billing_address_collection:'required',
      shipping_address_collection:{allowed_countries:['MY']},
      shipping_options:[{
        shipping_rate_data:{
          type:'fixed_amount',
          fixed_amount:{amount:shippingFee,currency:'myr'},
          display_name:shippingFee === 0 ? 'Standard delivery (included)' : 'Standard delivery'
        }
      }],
      invoice_creation:{enabled:true},
      success_url:new URL('?checkout=success&session_id={CHECKOUT_SESSION_ID}',shopUrl).toString(),
      cancel_url:new URL('?checkout=cancel',shopUrl).toString(),
      metadata:{source:'keboon-grow-shop'},
    });
    return res.json({url:session.url});
  } catch (err) {
    console.error('Stripe Checkout failed', {type:err.type, code:err.code});
    return res.status(502).json({error:'Unable to start payment. Please try again.'});
  }
});

app.get('/api/session-status', async (req, res) => {
  const id = req.query.session_id;
  if (typeof id !== 'string' || !/^cs_(test_)?[A-Za-z0-9_]+$/.test(id)) {
    return res.status(400).json({error:'Invalid session.'});
  }
  try {
    const session = await stripe.checkout.sessions.retrieve(id);
    return res.json({payment_status:session.payment_status});
  } catch {
    return res.status(404).json({error:'Session not found.'});
  }
});

app.listen(port, () => console.info('Keboon payment server listening', {port,checkoutEnabled}));
