/**
 * KEBOON Shop — dedicated paid-order register
 *
 * This is a standalone Google Apps Script, separate from other Keboon scripts.
 * It NEVER receives raw Stripe webhooks. The Node payment server first verifies
 * Stripe-Signature, then forwards an HMAC-authenticated paid-order summary here.
 *
 * Before deploying:
 *   1. In Project Settings > Script properties, set:
 *      SHOP_SPREADSHEET_ID = ID of your existing private KEBOON Shop spreadsheet
 *      SHOP_SHARED_SECRET = a random independent secret (32+ characters)
 *   2. Run setupShopOrders() to add a dedicated "Paid Orders" tab, preserving
 *      all existing spreadsheet tabs and their data.
 *   3. Deploy > New deployment > Web app; execute as Me; access Anyone.
 *   4. Put deployment URL and the same secret in your payment server's private env.
 * Never put the shared secret in GitHub, web pages, or a Sheet cell.
 */
const SHOP_TAB = 'Paid Orders';
const SHOP_HEADERS = [
  'Stripe Session ID', 'Paid At (UTC)', 'Email', 'Phone / WhatsApp',
  'Products', 'Quantity', 'Subtotal (RM)', 'Shipping (RM)', 'Total (RM)',
  'Customer Name', 'Delivery Address', 'Stripe Invoice URL',
  'Stripe Customer ID', 'Order Status', 'Latest Stripe Event ID'
];

function setupShopOrders() {
  const properties = PropertiesService.getScriptProperties();
  // Keep the user's spreadsheet ID in private Apps Script properties, not GitHub.
  const spreadsheetId = (properties.getProperty('SHOP_SPREADSHEET_ID') || '').trim();
  if (!/^[A-Za-z0-9_-]{20,}$/.test(spreadsheetId)) {
    throw new Error('First set SHOP_SPREADSHEET_ID to the existing Google Sheet ID in Script properties.');
  }
  const book = SpreadsheetApp.openById(spreadsheetId);

  // Create a *new tab* without replacing or renaming any existing tabs.
  let sheet = book.getSheetByName(SHOP_TAB);
  if (!sheet) sheet = book.insertSheet(SHOP_TAB);
  if (sheet.getMaxColumns() < SHOP_HEADERS.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), SHOP_HEADERS.length - sheet.getMaxColumns());
  }

  if (sheet.getLastRow() > 0) {
    // Never overwrite a pre-existing tab that happens to have the same name.
    const currentHeaders = sheet.getRange(1, 1, 1, SHOP_HEADERS.length).getValues()[0];
    if (currentHeaders.some((v, i) => String(v) !== SHOP_HEADERS[i])) {
      throw new Error('Existing Paid Orders tab has different columns. Nothing was overwritten.');
    }
  } else {
    sheet.getRange(1, 1, 1, SHOP_HEADERS.length).setValues([SHOP_HEADERS]);
    sheet.getRange(1, 1, 1, SHOP_HEADERS.length)
      .setBackground('#14563d').setFontColor('#ffffff').setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setRowHeight(1, 36);
    sheet.getRange(1, 1, 1, SHOP_HEADERS.length).createFilter();
    sheet.setColumnWidths(1, SHOP_HEADERS.length, 145);
    sheet.setColumnWidth(1, 235);
    sheet.setColumnWidth(3, 215);
    sheet.setColumnWidth(4, 165);
    sheet.setColumnWidth(5, 340);
    sheet.setColumnWidth(10, 190);
    sheet.setColumnWidth(11, 350);
    sheet.setColumnWidth(12, 325);
    sheet.getRange('G:I').setNumberFormat('"RM" #,##0.00');
    sheet.getRange('N2:N').setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(['New', 'Packing', 'Shipped', 'Completed', 'On Hold'], true)
        .setAllowInvalid(false).build());
  }

  console.log('KEBOON Shop Paid Orders tab: ' + book.getUrl());
  return book.getUrl();
}
function doPost(e) {
  try {
    const input = e && e.postData && e.postData.contents;
    if (typeof input !== 'string' || input.length > 30000) {
      return result_({ok:false, error:'bad_request'});
    }
    const envelope = JSON.parse(input);
    const message = envelope.message;
    const signature = envelope.signature;
    if (typeof message !== 'string' || message.length > 18000 ||
        typeof signature !== 'string' || !/^[0-9a-f]{64}$/.test(signature)) {
      return result_({ok:false, error:'bad_request'});
    }
    const props = PropertiesService.getScriptProperties();
    const secret = props.getProperty('SHOP_SHARED_SECRET');
    const spreadsheetId = props.getProperty('SHOP_SPREADSHEET_ID');
    if (!secret || secret.length < 32 || !spreadsheetId) {
      return result_({ok:false, error:'not_configured'});
    }

    const computed = Utilities.computeHmacSha256Signature(
      message, secret, Utilities.Charset.UTF_8)
      .map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
    if (!sameSignature_(computed, signature)) {
      return result_({ok:false, error:'unauthorized'});
    }

    const order = JSON.parse(message);
    const sessionId = String(order.sessionId || '');
    if (!/^cs_(test_)?[A-Za-z0-9_]+$/.test(sessionId) ||
        order.paymentStatus !== 'paid' ||
        !Number.isFinite(order.sentAt) ||
        Math.abs(Date.now() - order.sentAt) > 10 * 60 * 1000 ||
        !Array.isArray(order.items) || !order.items.length ||
        !validCents_(order.amountSubtotal) ||
        !validCents_(order.amountShipping) ||
        !validCents_(order.amountTotal) ||
        order.currency !== 'myr') {
      return result_({ok:false, error:'invalid_order'});
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(25000);
    try {
      const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(SHOP_TAB);
      if (!sheet) return result_({ok:false, error:'sheet_not_found'});

      // One row per Stripe Checkout Session, even when Stripe retries or
      // delivers both immediate and asynchronous payment success events.
      const lastRow = sheet.getLastRow();
      const found = lastRow > 1
        ? sheet.getRange(2, 1, lastRow - 1, 1)
            .createTextFinder(sessionId).matchEntireCell(true).findNext()
        : null;
      if (found) {
        const row = found.getRow();
        // Update invoice link if Stripe supplied it after the initial event.
        if (order.invoiceUrl && /^https:\/\//.test(order.invoiceUrl)) {
          sheet.getRange(row, 12).setValue(safeCell_(order.invoiceUrl));
        }
        sheet.getRange(row, 15).setValue(safeCell_(order.eventId));
        return result_({ok:true, sessionId:sessionId, duplicate:true});
      }

      const itemText = order.items
        .slice(0, 40)
        .map(x => String(x.quantity || 0) + ' × ' + String(x.name || 'Product'))
        .join(' | ');
      const quantity = order.items.reduce((n, x) => n + Number(x.quantity || 0), 0);
      const row = [
        safeCell_(sessionId), safeCell_(order.paidAt),
        safeCell_(order.email), safeCell_(order.phone),
        safeCell_(itemText), quantity,
        order.amountSubtotal / 100, order.amountShipping / 100,
        order.amountTotal / 100,
        safeCell_(order.customerName), safeCell_(order.shippingAddress),
        safeCell_(order.invoiceUrl), safeCell_(order.customerId),
        'New', safeCell_(order.eventId)
      ];
      sheet.appendRow(row);
      SpreadsheetApp.flush();
      return result_({ok:true, sessionId:sessionId, duplicate:false});
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    // Don't log incoming customer email or phone in error reports.
    console.error('KEBOON paid-order sync failed: ' + err.name);
    return result_({ok:false, error:'processing_failed'});
  }
}

function validCents_(value) {
  return Number.isSafeInteger(value) && value >= 0 && value < 100000000;
}

function safeCell_(value) {
  const text = String(value == null ? '' : value).slice(0, 4000);
  // Prevent spreadsheet formula injection from customer-controlled fields.
  return /^[\s]*[=+@-]/.test(text) ? "'" + text : text;
}

function sameSignature_(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return difference === 0;
}

function result_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
