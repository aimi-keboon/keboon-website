# KEBOON GROW Stripe Checkout server

The existing website is hosted as static HTML. **GitHub Pages cannot receive Stripe webhooks or keep API keys secret**, so deploy this Node.js server to an HTTPS service such as Render, Railway or Fly.io.

## Purchase flow

1. Customer adds products to the cart and enters **required email and phone**.
2. Your backend validates the fields and cart, sets the official MYR unit prices, and creates a Stripe-hosted Checkout Session.
3. Stripe collects a **Malaysia shipping address** and payment, creates a paid invoice when payment succeeds (`invoice_creation.enabled`), and can email it to the customer's email.
4. Once your dedicated Apps Script is deployed, the verified payment server forwards the paid order to its own Google Sheet using a server-only HMAC shared secret. Stripe sends a signed `checkout.session.completed` or `checkout.session.async_payment_succeeded` webhook to your backend. The handler checks the signature and only records **paid** events. Orders are visible in Stripe; no shipping fulfillment is automated.
5. Customer returns to the shop and sees payment status retrieved from Stripe.

**Invoice emails are sent by Stripe, not by the webhook.** In the Stripe Dashboard, activate customer emails for **Successful payments** (Settings → Customer emails). Confirm invoice receipt behavior in your live account. Stripe does not send automatic customer emails in sandbox by default. Post-payment invoices can incur additional Stripe fees.

## Deploy and test before making shop live

1. Deploy this directory as a **Node web service**. Build: `npm install` or `npm ci` if you create a lockfile. Start: `npm start`. Use Node.js 20+.
2. Copy `.env.example` **values**, not the file itself, into the hosting provider's **secret environment settings**. Use **test keys** for staging. Never place secret keys or webhook signing secrets in the public GitHub repository or frontend.
3. Configure Stripe webhook endpoint `https://YOUR-SECURE-BACKEND/webhook`; subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and `checkout.session.async_payment_failed`. Obtain its `whsec_...` signing secret.
4. Set `PUBLIC_SHOP_URL=https://keboon.net/shop/`, `ALLOWED_ORIGINS=https://keboon.net,https://www.keboon.net`, and an explicitly agreed `SHIPPING_FEE_MYR` (0 only if delivery truly is included).
5. Update `SHOP_CONFIG.checkoutEndpoint` in `shop/index.html` with your deployed backend's **public HTTPS** `/api/checkout` URL. Do this before enabling checkout.
6. Keep `CHECKOUT_ENABLED=false` and `shopComingSoon:true` until you verify a **test** order with real form validations, redirect, webhook deliveries, Stripe payment status and generated paid invoice. Invoice emails are not normally sent in sandbox.
7. When ready, switch to the **live** Stripe keys and live webhook signing secret, set `CHECKOUT_ENABLED=true` in the hosting environment and `shopComingSoon:false` in the frontend. Confirm your Stripe account can accept live charges, receipt/invoice email settings, and shipping/tax/legal policies first.

## Important safeguards

- Product amounts and quantity limits are defined on the server and cannot be overridden by the browser.
- The Stripe webhook signature uses the unmodified raw request body and its unique Stripe endpoint secret.
- HTTPS origins are restricted; checkout is rate-limited.
- A verified webhook is the source of truth for payment/fulfillment; a browser success redirect is not.
- The sample webhook **logs paid sessions only**. To implement shipping, order storage and deduplication, add durable, idempotent order records before using events for fulfillment; Stripe may resend or reorder webhook events.
- This checkout currently serves Malaysia-only delivery addresses. Collect shipping costs and tax requirements before activating live sales. The catalog lists SRP amounts, not delivery/tax policy.
- Do not store customer payment-card details. Stripe hosts the payment form.

Reference: https://docs.stripe.com/checkout/quickstart , https://docs.stripe.com/webhooks , https://docs.stripe.com/receipts

## Dedicated Google Apps Script for paid shop orders

The standalone Apps Script source is at `shop/apps-script/Code.gs`. It creates a **separate, private KEBOON Shop — Paid Orders spreadsheet**, with one row per verified paid Stripe Checkout Session. This is not connected to any existing Apps Script project or spreadsheet.

1. Go to https://script.google.com/ and create a **new standalone project** called `KEBOON Shop — Order Register`.
2. Replace `Code.gs` with the code in `shop/apps-script/Code.gs`.
3. Open Project Settings → Script properties. Add `SHOP_SHARED_SECRET` with a securely generated, random 32+ character secret. Do **not** commit it anywhere.
4. Run `setupShopOrders()` once and authorize Sheets access. The execution log shows a new spreadsheet URL; keep that sheet private. The function is idempotent and will reuse its own Sheet on later runs.
5. Deploy → New deployment → **Web app**, execute as **Me**, access **Anyone** (needed for your trusted payment server to post). Copy its `https://script.google.com/macros/s/.../exec` URL.
6. Set the following **private** environment variables on your deployed Node payment server:
   - `SHOP_APPS_SCRIPT_URL` = the deployed Apps Script Web App `/exec` URL
   - `SHOP_APPS_SCRIPT_SECRET` = the **same secret** as the Apps Script `SHOP_SHARED_SECRET`
7. Send a Stripe **test** payment and verify that the sheet records exactly one paid row, with email, phone, amounts and items. Re-send the webhook test event and verify no duplicate row is created.
8. Keep both backend `CHECKOUT_ENABLED=false` and frontend `shopComingSoon:true` until the full payment and email flow is tested.

### Security and operational behavior

Google Apps Script does **not** serve as the public Stripe webhook receiver. Stripe signs event requests to the Node backend, which verifies them first and sends only the minimum order details to Apps Script with an HMAC SHA-256 signature. The script verifies the signature and the short-lived timestamp before changing the Sheet. Because the Apps Script Web App is accessible over the internet, protect the shared secret and rotate it if compromised.

Google Apps Script serializes writes with `LockService`, and deduplicates on Stripe Checkout Session ID. The app replies with `ok:false` on errors; the Node server checks this and returns a retryable HTTP 500 to Stripe, rather than falsely acknowledging a failed Sheets write. Note that Script executions and redirects can still fail or time out; monitor Stripe webhook deliveries and compare paid sessions against Sheet rows regularly.

The Google Sheet is for fulfillment operations, while Stripe remains the system of record for actual payment status and invoices. Editing the Sheet never changes a Stripe payment. Customers' names, emails, phone numbers and shipping addresses are personal information; keep access limited to trusted KEBOON staff. A real customer email invoice is configured in Stripe (successful-payment customer emails), not sent by Apps Script.

**Status: setup code provided, but no standalone Apps Script project, live Sheet, script deployment or live payment webhook has been created.**
