import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import Stripe from 'stripe';
import { PRODUCT_IDS, validateCart } from './cart.js';

const app = express();
app.disable('x-powered-by');

// The website is on static GitHub Pages. This API must run on a Node.js host.
const shopUrl = new URL(process.env.SHOP_URL || 'http://localhost:5500/shop/');
const allowedOrigins = (process.env.ALLOWED_ORIGINS || shopUrl.origin)
  .split(',').map(origin => origin.trim()).filter(Boolean);
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const priceIds = {
  zinc: process.env.STRIPE_PRICE_ZINC,
  amino: process.env.STRIPE_PRICE_AMINO,
  chito: process.env.STRIPE_PRICE_CHITO,
  soil: process.env.STRIPE_PRICE_SOIL,
  crop: process.env.STRIPE_PRICE_CROP,
};

// The webhook MUST receive a raw body, before express.json() is installed.
app.post('/api/webhook', express.raw({ type: 'application/json', limit: '100kb' }), (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: 'Payment webhook is not configured.' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return res.status(400).json({ error: 'Invalid webhook signature.' });
  }

  // Stripe Dashboard remains the source of truth for paid orders. Never fulfill
  // based on the browser redirect; use verified events or the dashboard instead.
  if (event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object;
    if (session.metadata?.store === 'keboon-grow' && session.payment_status === 'paid') {
      console.info('KEBOON order paid:', session.id);
    }
  } else if (event.type === 'checkout.session.async_payment_failed') {
    console.warn('KEBOON payment failed:', event.data.object.id);
  }
  return res.json({ received: true });
});

app.use(cors({
  origin(origin, callback) {
    // Requests from browsers are restricted to the configured storefront.
    callback(null, !origin || allowedOrigins.includes(origin));
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));
app.use(express.json({ limit: '10kb' }));

const configured = () => Boolean(
  stripe && process.env.STRIPE_WEBHOOK_SECRET &&
  process.env.STRIPE_SHIPPING_RATE_ID?.startsWith('shr_') &&
  PRODUCT_IDS.every(id => priceIds[id]?.startsWith('price_')) &&
  (process.env.NODE_ENV !== 'production' ||
    (process.env.SHOP_URL && shopUrl.protocol === 'https:'))
);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, paymentsEnabled: process.env.ACCEPT_ORDERS === 'true' && configured() });
});

app.post('/api/checkout', async (req, res) => {
  if (process.env.ACCEPT_ORDERS !== 'true' || !configured()) {
    return res.status(503).json({ error: 'Checkout is not open yet.' });
  }

  let items;
  try {
    items = validateCart(req.body?.items);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  // Prices and shipping are owned by Stripe, never by customer-side JavaScript.
  try {
    const returnUrl = `${shopUrl.origin}${shopUrl.pathname}`;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: items.map(({ id, quantity }) => ({ price: priceIds[id], quantity })),
      shipping_address_collection: { allowed_countries: ['MY'] },
      shipping_options: [{ shipping_rate: process.env.STRIPE_SHIPPING_RATE_ID }],
      phone_number_collection: { enabled: true },
      success_url: `${returnUrl}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnUrl}?checkout=cancel`,
      metadata: {
        store: 'keboon-grow',
        items: items.map(({ id, quantity }) => `${id}:${quantity}`).join(','),
      },
    });
    if (!session.url) throw new Error('Stripe did not provide a Checkout URL.');
    return res.json({ url: session.url });
  } catch (err) {
    console.error('Unable to create Stripe Checkout Session:', err.type || err.name || 'Error');
    return res.status(502).json({ error: 'Unable to start payment. Please try again.' });
  }
});

app.get('/api/session-status', async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Payments are not configured.' });
  const id = req.query.session_id;
  if (typeof id !== 'string' || !/^cs_(test_)?[A-Za-z0-9_]+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid checkout session.' });
  }
  try {
    const session = await stripe.checkout.sessions.retrieve(id);
    if (session.metadata?.store !== 'keboon-grow') {
      return res.status(404).json({ error: 'Checkout session not found.' });
    }
    return res.json({ payment_status: session.payment_status, status: session.status });
  } catch {
    return res.status(404).json({ error: 'Checkout session not found.' });
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.info(`KEBOON shop payment API listening on port ${port}`));
