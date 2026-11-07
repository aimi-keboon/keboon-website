/**
 * KEBOON Shop — dedicated paid-order register
 *
 * This is a standalone Google Apps Script, separate from other Keboon scripts.
 * It NEVER receives raw Stripe webhooks. The Node payment server first verifies
 * Stripe-Signature, then forwards an HMAC-authenticated paid-order summary here.
 *
 * Before deploying:
 *   1. Run setupShopOrders() once to create a separate Google Sheet.
 *   2. Project Settings > Script properties:
 *      SHOP_SHARED_SECRET = an independently generated random secret (32+ chars).
 *   3. Deploy > New deployment > Web app; execute as Me; access Anyone.
 *   4. Put deployment URL and same secret in your payment server's private env.
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
  let spreadsheetId = properties.getProperty('SHOP_SPREADSHEET_ID');
  let book;

  if (spreadsheetId) {
    book = SpreadsheetApp.openById(spreadsheetId);
  } else {
    book = SpreadsheetApp.create('KEBOON Shop — Paid Orders');
    spreadsheetId = book.getId();
    properties.setProperty('SHOP_SPREADSHEET_ID', spreadsheetId);
  }

  let sheet = book.getSheetByName(SHOP_TAB);
  if (!sheet) {
    const initial = book.getSheets();
    sheet = (initial.length === 1 && initial[0].getLastRow() === 0)
      ? initial[0].setName(SHOP_TAB)
      : book.insertSheet(SHOP_TAB);
  }
  if (sheet.getLastRow() === 0) {
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

  // The sheet is private to your Google account by default.
  console.log('KEBOON Shop orders spreadsheet: ' + book.getUrl());
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
