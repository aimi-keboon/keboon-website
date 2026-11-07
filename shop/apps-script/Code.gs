/**
 * KEBOON GROW — GitHub Pages + Google Apps Script + Stripe Checkout.
 * No Node server, external hosting or Stripe webhook is required.
 *
 * PRIVATE Script Properties (Project Settings > Script properties):
 *   SHOP_SPREADSHEET_ID  = your existing Google Sheets document ID
 *   STRIPE_SECRET_KEY    = sk_test_... initially; use sk_live_... only after testing
 *   SHOP_SHIPPING_FEE_MYR = confirmed MYR shipping amount (e.g. 0 only for free delivery)
 *   SHOP_CHECKOUT_ENABLED = false until you deliberately begin test checkout
 *
 * Run setupShopOrders() manually once (then authorize), deploy this script
 * as a Web App: execute as Me, access Anyone. Paste its /exec URL in the
 * KEBOON website SHOP_CONFIG.appsScriptUrl.
 *
 * SECURITY: The public web form can request a Checkout Session but cannot
 * confirm an order is paid. Only server-side Stripe API polling can set Paid.
 * Do not put Stripe keys in HTML, GitHub, or spreadsheet cells.
 */
const SHOP_TAB = 'Shop Orders';
const SHOP_URL = 'https://keboon.net/shop/';
const SHOP_HEADERS = [
  'Order ID', 'Created At (UTC)', 'Stripe Session ID',
  'Email', 'Phone / WhatsApp', 'Products', 'Quantity',
  'Subtotal (RM)', 'Shipping (RM)', 'Total (RM)',
  'Customer Name', 'Delivery Address', 'Payment Status',
  'Fulfillment Status', 'Payment Confirmed At (UTC)',
  'Stripe Invoice URL', 'Stripe Customer ID', 'Last Checked (UTC)'
];
const SHOP_PRODUCTS = Object.freeze({
  imuno: {name:'KEBOON GROW Imuno+ (250 mL)', cents:7500},
  zinc:  {name:'KEBOON GROW Zinc+ (250 mL)', cents:7500},
  soil:  {name:'KEBOON GROW Soil+ 4-in-1 (1 Litre)', cents:12000},
  vital: {name:'KEBOON GROW Vital+ (1 Litre)', cents:12000}
});

function shopProps_() {
  return PropertiesService.getScriptProperties();
}

function shopSheet_() {
  const id = (shopProps_().getProperty('SHOP_SPREADSHEET_ID') || '').trim();
  if (!/^[A-Za-z0-9_-]{20,}$/.test(id)) {
    throw new Error('Set SHOP_SPREADSHEET_ID in Script properties first.');
  }
  const sheet = SpreadsheetApp.openById(id).getSheetByName(SHOP_TAB);
  if (!sheet) throw new Error('Run setupShopOrders() first.');
  return sheet;
}

function setupShopOrders() {
  const props = shopProps_();
  const id = (props.getProperty('SHOP_SPREADSHEET_ID') || '').trim();
  if (!/^[A-Za-z0-9_-]{20,}$/.test(id)) {
    throw new Error('Add SHOP_SPREADSHEET_ID in Script properties before setup.');
  }
  const book = SpreadsheetApp.openById(id);
  let sheet = book.getSheetByName(SHOP_TAB);
  if (!sheet) sheet = book.insertSheet(SHOP_TAB); // preserve every existing tab
  if (sheet.getMaxColumns() < SHOP_HEADERS.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), SHOP_HEADERS.length - sheet.getMaxColumns());
  }

  if (sheet.getLastRow() > 0) {
    const current = sheet.getRange(1, 1, 1, SHOP_HEADERS.length).getValues()[0];
    if (current.some((v,i) => String(v) !== SHOP_HEADERS[i])) {
      throw new Error('Existing Shop Orders tab has different headers. No rows were replaced.');
    }
  } else {
    sheet.getRange(1, 1, 1, SHOP_HEADERS.length).setValues([SHOP_HEADERS]);
    sheet.getRange(1, 1, 1, SHOP_HEADERS.length)
      .setBackground('#14563d').setFontColor('#ffffff').setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setRowHeight(1, 38);
    sheet.setColumnWidths(1, SHOP_HEADERS.length, 155);
    sheet.setColumnWidth(4, 225);
    sheet.setColumnWidth(5, 180);
    sheet.setColumnWidth(6, 330);
    sheet.setColumnWidth(12, 340);
    sheet.setColumnWidth(16, 330);
    sheet.getRange('H:J').setNumberFormat('"RM" #,##0.00');
    sheet.getRange('M2:M').setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(['Pending','Processing','Paid','Expired','Review'], true)
        .setAllowInvalid(false).build());
    sheet.getRange('N2:N').setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(['Not Ready','New','Packing','Shipped','Completed','On Hold'], true)
        .setAllowInvalid(false).build());
    sheet.getRange(1, 1, 1, SHOP_HEADERS.length).createFilter();
  }

  // Install one 5-minute trigger; repeated setup does not duplicate triggers.
  if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'syncShopOrders')) {
    ScriptApp.newTrigger('syncShopOrders').timeBased().everyMinutes(5).create();
  }
  console.log('KEBOON Shop order register: ' + book.getUrl());
  return book.getUrl();
}

// A normal cross-site HTML form POST works without CORS or a separate server.
// After submission, Apps Script shows a user-clickable Stripe Checkout link.
function doPost(e) {
  try {
    const props = shopProps_();
    if (props.getProperty('SHOP_CHECKOUT_ENABLED') !== 'true') {
      return shopPage_('Checkout is currently closed.', null);
    }
    const params = e && e.parameter || {};
    const email = String(params.email || '').trim();
    const phone = String(params.phone || '').trim();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        !/^\+?[0-9 ()-]{7,24}$/.test(phone)) {
      return shopPage_('Please enter a valid email and phone number.', null);
    }

    const rawItems = String(params.items || '');
    if (rawItems.length > 2000) {
      return shopPage_('The order is too large.', null);
    }
    const parsed = JSON.parse(rawItems);
    if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 4) {
      return shopPage_('The shopping cart is invalid.', null);
    }
    const used = {};
    const items = [];
    let subtotal = 0;
    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i];
      if (!item || typeof item.id !== 'string' ||
          !Object.prototype.hasOwnProperty.call(SHOP_PRODUCTS, item.id) ||
          used[item.id] || !Number.isInteger(item.quantity) ||
          item.quantity < 1 || item.quantity > 20) {
        return shopPage_('The shopping cart contains an invalid product or quantity.', null);
      }
      used[item.id] = true;
      const product = SHOP_PRODUCTS[item.id];
      subtotal += product.cents * item.quantity;
      items.push({id:item.id,name:product.name,cents:product.cents,quantity:item.quantity});
    }

    const shipping = shippingCents_();
    checkShopRateLimit_(email,phone);
    const orderId = Utilities.getUuid().replace(/-/g, '');
    const fields = {
      'mode': 'payment',
      'customer_email': email,
      'customer_creation': 'always',
      'phone_number_collection[enabled]': 'true',
      'billing_address_collection': 'required',
      'shipping_address_collection[allowed_countries][0]': 'MY',
      'invoice_creation[enabled]': 'true',
      'success_url': SHOP_URL + '?checkout=success&session_id={CHECKOUT_SESSION_ID}',
      'cancel_url': SHOP_URL + '?checkout=cancel',
      'client_reference_id': orderId,
      'metadata[order_id]': orderId,
      'shipping_options[0][shipping_rate_data][type]': 'fixed_amount',
      'shipping_options[0][shipping_rate_data][fixed_amount][currency]': 'myr',
      'shipping_options[0][shipping_rate_data][fixed_amount][amount]': String(shipping),
      'shipping_options[0][shipping_rate_data][display_name]':
        shipping === 0 ? 'Standard delivery (included)' : 'Standard delivery'
    };
    items.forEach((item,i) => {
      fields['line_items['+i+'][quantity]'] = String(item.quantity);
      fields['line_items['+i+'][price_data][currency]'] = 'myr';
      fields['line_items['+i+'][price_data][unit_amount]'] = String(item.cents);
      fields['line_items['+i+'][price_data][product_data][name]'] = item.name;
    });

    const session = stripeApi_('post','/checkout/sessions',fields);
    if (!session || !/^cs_(test_)?[A-Za-z0-9_]+$/.test(String(session.id || '')) ||
        !/^https:\/\/checkout\.stripe\.com\//.test(String(session.url || ''))) {
      throw new Error('Stripe did not provide a valid Checkout Session.');
    }

    try {
      const lock = LockService.getScriptLock();
      lock.waitLock(25000);
      try {
        const sheet = shopSheet_();
        sheet.appendRow([
          orderId, new Date().toISOString(), safeCell_(session.id),
          safeCell_(email), safeCell_(phone),
          safeCell_(items.map(item => item.quantity+' × '+item.name).join(' | ')),
          items.reduce((n,item) => n+item.quantity,0),
          subtotal/100, shipping/100, (subtotal+shipping)/100,
          '', '', 'Pending', 'Not Ready', '', '', '', ''
        ]);
        SpreadsheetApp.flush();
      } finally {
        lock.releaseLock();
      }
    } catch (error) {
      // Do not send shoppers to an untracked payment if the Sheet write fails.
      try { stripeApi_('post','/checkout/sessions/'+encodeURIComponent(session.id)+'/expire',{}); }
      catch (ignore) { console.error('Could not expire untracked session '+session.id); }
      throw new Error('Could not save the order. Please try again.');
    }
    return shopPage_('Your order is ready. Continue to Stripe to pay securely.', session.url);
  } catch (error) {
    console.error('Checkout request failed: ' + error.message); // no email, phone or secret key
    return shopPage_('Unable to start checkout. Please try again or contact KEBOON.', null);
  }
}

// A direct GET does not reveal customer details or payment information.
function doGet() {
  return shopPage_('Start your order from the KEBOON Shop.', null);
}

// Scheduled Stripe API polling, NOT a publicly exposed Stripe webhook.
// A browser success redirect cannot mark an order Paid.
function syncShopOrders() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    const sheet = shopSheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    const rows = sheet.getRange(2, 1, lastRow - 1, SHOP_HEADERS.length).getValues();
    let checked = 0;
    for (let i = 0; i < rows.length && checked < 25; i++) {
      const row = rows[i], rowNum = i+2;
      const sessionId = String(row[2] || '');
      const paymentStatus = String(row[12] || '');
      const invoiceUrl = String(row[15] || '');
      if (!/^cs_(test_)?[A-Za-z0-9_]+$/.test(sessionId) ||
          paymentStatus === 'Expired' || paymentStatus === 'Review' ||
          (paymentStatus === 'Paid' && invoiceUrl)) continue;
      checked++;
      try {
        const session = stripeApi_('get','/checkout/sessions/'+encodeURIComponent(sessionId));
        const orderId = String(row[0]);
        const totalExpected = Math.round(Number(row[9]) * 100);
        if (session.client_reference_id !== orderId ||
            session.currency !== 'myr' ||
            session.amount_total !== totalExpected) {
          sheet.getRange(rowNum,13).setValue('Review');
          console.warn('Stripe session mismatch; review order '+orderId);
          continue;
        }

        const shipping = session.collected_information &&
          session.collected_information.shipping_details ||
          session.shipping_details || {};
        const details = session.customer_details || {};
        const address = shipping.address || details.address;
        const addressText = address
          ? [address.line1,address.line2,address.city,address.state,address.postal_code,address.country]
              .filter(Boolean).join(', ') : '';
        if (details.email) sheet.getRange(rowNum,4).setValue(safeCell_(details.email));
        if (details.phone) sheet.getRange(rowNum,5).setValue(safeCell_(details.phone));
        if (details.name || shipping.name) {
          sheet.getRange(rowNum,11).setValue(safeCell_(details.name || shipping.name));
        }
        if (addressText) sheet.getRange(rowNum,12).setValue(safeCell_(addressText));
        if (session.customer) {
          sheet.getRange(rowNum,17).setValue(safeCell_(
            typeof session.customer === 'string' ? session.customer : session.customer.id));
        }

        let nextStatus = 'Pending';
        if (session.payment_status === 'paid' && session.status === 'complete') {
          nextStatus = 'Paid';
          if (paymentStatus !== 'Paid') {
            sheet.getRange(rowNum,14).setValue('New');
            sheet.getRange(rowNum,15).setValue(new Date().toISOString());
          }
          if (session.invoice && !invoiceUrl) {
            try {
              const invoiceId = typeof session.invoice === 'string'
                ? session.invoice : session.invoice.id;
              const invoice = stripeApi_('get','/invoices/'+encodeURIComponent(invoiceId));
              if (invoice.hosted_invoice_url) {
                sheet.getRange(rowNum,16).setValue(safeCell_(invoice.hosted_invoice_url));
              }
            } catch (invoiceError) {
              console.warn('Paid order invoice not ready '+orderId);
            }
          }
        } else if (session.status === 'expired') {
          nextStatus = 'Expired';
        } else if (session.status === 'complete') {
          nextStatus = 'Processing'; // delayed/async payment, not yet paid
        }
        sheet.getRange(rowNum,13).setValue(nextStatus);
        sheet.getRange(rowNum,18).setValue(new Date().toISOString());
      } catch (error) {
        // Do not acknowledge payment until Stripe responds successfully.
        console.warn('Could not sync Stripe session '+sessionId+': '+error.message);
      }
    }
  } finally {
    lock.releaseLock();
  }
}

function stripeApi_(method, path, fields) {
  const secret = String(shopProps_().getProperty('STRIPE_SECRET_KEY') || '');
  if (!/^sk_(test|live)_/.test(secret)) {
    throw new Error('STRIPE_SECRET_KEY not configured.');
  }
  const options = {
    method: method,
    headers: {'Authorization':'Bearer '+secret},
    muteHttpExceptions: true
  };
  if (method === 'post') {
    options.contentType = 'application/x-www-form-urlencoded';
    options.payload = Object.keys(fields || {}).map(k =>
      encodeURIComponent(k)+'='+encodeURIComponent(fields[k])).join('&');
  }
  const response = UrlFetchApp.fetch('https://api.stripe.com/v1'+path,options);
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    console.warn('Stripe API rejected request: HTTP '+status);
    throw new Error('Stripe API request unsuccessful.');
  }
  return JSON.parse(response.getContentText());
}

function shippingCents_() {
  const fee = shopProps_().getProperty('SHOP_SHIPPING_FEE_MYR');
  if (fee === null || !/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(fee)) {
    throw new Error('Set SHOP_SHIPPING_FEE_MYR to your confirmed shipping charge.');
  }
  const amount = Math.round(Number(fee)*100);
  if (!Number.isSafeInteger(amount) || amount > 999999) {
    throw new Error('Shipping amount is invalid.');
  }
  return amount;
}

function checkShopRateLimit_(email,phone) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,email+'|'+phone);
  const hash = digest.map(b => ('0'+(b & 255).toString(16)).slice(-2)).join('');
  const key = 'checkout_'+hash.substring(0,40);
  const cache = CacheService.getScriptCache();
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const count = Number(cache.get(key) || '0');
    if (count >= 8) throw new Error('Too many checkout requests for this contact.');
    cache.put(key,String(count+1),900); // 15-minute anti-spam limit
  } finally {lock.releaseLock();}
}

function safeCell_(value) {
  const string = String(value == null ? '' : value).slice(0,3800);
  return /^\s*[=+@-]/.test(string) ? "'"+string : string;
}

function htmlEscape_(value) {
  return String(value).replace(/[&<>"']/g, ch =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

function shopPage_(message,checkoutUrl) {
  const safeUrl = checkoutUrl && /^https:\/\/checkout\.stripe\.com\//.test(checkoutUrl)
    ? checkoutUrl : null;
  const button = safeUrl
    ? '<a class="primary" href="'+htmlEscape_(safeUrl)+'" target="_top">Continue to secure Stripe payment</a>'
    : '<a class="primary" href="'+SHOP_URL+'" target="_top">Back to KEBOON Shop</a>';
  const output = '<!doctype html><html><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width, initial-scale=1">'+
    '<style>body{font-family:Arial,sans-serif;background:#f4f8f1;color:#153e2b;'+
    'margin:0;display:grid;place-items:center;min-height:90vh;padding:24px}'+
    '.panel{background:#fff;border:1px solid #dce8d9;border-radius:18px;'+
    'padding:32px;max-width:420px;width:100%;text-align:center}h1{font-size:24px}'+
    'p{line-height:1.7}.primary{display:inline-block;padding:14px 20px;'+
    'background:#155438;border-radius:40px;color:white;text-decoration:none;'+
    'font-weight:bold;margin-top:14px}</style></head><body><main class="panel">'+
    '<h1>KEBOON GROW</h1><p>'+htmlEscape_(message)+'</p>'+button+
    '<p style="font-size:12px;color:#667c6d">Payment is processed by Stripe. '+ 
    'Never share your card details with KEBOON staff.</p></main></body></html>';
  // A user click is used for navigation because Apps Script web apps run in
  // sandboxed frames and automatic top-level redirects are unreliable.
  return HtmlService.createHtmlOutput(output).setTitle('KEBOON Shop — Checkout');
}
