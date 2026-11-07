# KEBOON Shop: GitHub Pages + Google Apps Script + Stripe

**No Render, Node.js server, or external webhook host needed.** This implementation uses:
- GitHub Pages for the public storefront: `https://keboon.net/shop/`
- One standalone Google Apps Script web app for creating Stripe Checkout Sessions and checking order payments
- Your existing Google Sheet for order records, in its new **Shop Orders** tab
- Stripe Checkout to take card/available payments, collect a Malaysia delivery address, and generate a **paid invoice** for successful one-time payments

## Current state: not enabled

The public shop has `shopComingSoon: true` and an empty `appsScriptUrl`. The Apps Script has `SHOP_CHECKOUT_ENABLED` off unless you explicitly set it to `true`. No secret keys are stored in GitHub. No real or test payments have been taken by these changes.

## 1. Create a standalone Apps Script

1. Open https://script.google.com/ and create a new standalone project named **KEBOON Shop — Stripe Checkout**. You can instead open **Extensions > Apps Script** from your existing Sheet, but do not overwrite code in other projects.
2. Copy the entire code in [Code.gs](Code.gs) into its Code.gs and Save.
3. Open **Project Settings > Script Properties** and add:

| Property | Value |
| --- | --- |
| `SHOP_SPREADSHEET_ID` | `1InMg53GIhbM3cLIZVH8U-NS-OyvWAA_WlByqoGo5cw0` |
| `STRIPE_SECRET_KEY` | Your Stripe **test** secret key (`sk_test_...`), from the Stripe Dashboard |
| `SHOP_SHIPPING_FEE_MYR` | Your actual shipping fee in ringgit, for example `0` only if delivery really is included |
| `SHOP_CHECKOUT_ENABLED` | `false` initially |

**Never paste secret API keys into `shop/index.html`, GitHub, or a Sheet cell.** Only store them in private Script Properties.

4. In the Apps Script editor, select `setupShopOrders` and click **Run**. Google will request permission to edit the spreadsheet and make outgoing requests. This creates a **Shop Orders** tab (without modifying other tabs) and one scheduled trigger to check pending Stripe payments about every 5 minutes. If an existing tab has the same name and different columns, the setup stops rather than overwrite it.
5. Deploy > **New deployment** > Select type **Web app**. Choose **Execute as: Me** and **Who has access: Anyone**. Copy the final URL ending in `/exec` (not `/dev`). The deployed web app is publicly callable; keep its ability to create payment sessions protected with server-side price validation and request limits. It cannot read your Stripe secret key through its HTML response.
6. When changing code later, **Deploy > Manage deployments > Edit > New version** so the deployed web app runs the new code.

## 2. Configure the GitHub storefront

In `shop/index.html`, find `SHOP_CONFIG`:

```js
const SHOP_CONFIG = {
  currency: 'MYR',
  pricesConfirmed: true,
  shopComingSoon: true,
  appsScriptUrl: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec',
  contactEmail: 'keboon@keboon.net',
  whatsappUrl: ''
};
```

The email and phone fields are required. Clicking checkout submits a **normal HTML form POST** to Apps Script. It displays a **Continue to secure Stripe payment** link that the customer clicks. This extra click avoids Google Apps Script iframe navigation limitations.

The browser **does not call Stripe APIs directly** and cannot alter prices: the Apps Script recalculates all four current catalog prices (RM75, RM75, RM120, RM120) from hardcoded server-side values. Up to 20 of each item can be ordered. Total and shipping are charged in MYR. Delivery is limited to Malaysian addresses.

## 3. Test in Stripe's test/sandbox environment

1. Verify Stripe account setup. Open https://dashboard.stripe.com/test/apikeys (or select the appropriate sandbox in your Dashboard) and use the **test** secret key in Script Properties. Do not use your live secret for testing.
2. Confirm the Shopify/Apps Script `SHOP_SHIPPING_FEE_MYR` value and tax requirements. This example does **not** calculate taxes automatically.
3. Change Script Property `SHOP_CHECKOUT_ENABLED` to `true` so the Apps Script can create **test** sessions. Keep the GitHub shop in coming-soon mode while you conduct an isolated test, then toggle `shopComingSoon:false` temporarily on a test branch/page if desired. **Never allow a live customer to use a test Stripe key thinking they are paying for an order.**
4. With a properly configured test storefront, add a product and enter a valid email and phone. Submit; a Google Apps Script page should show a **Continue to secure Stripe payment** button. Click it, then pay with a Stripe test card.
5. Return to the website. The return page intentionally does not mark the order paid just because you were redirected. Check the **Shop Orders** tab; within roughly 5 minutes (plus trigger timing), Apps Script should query Stripe directly and change `Payment Status` from `Pending` to `Paid`. It records the Stripe customer and invoice link when available, and only then changes fulfillment status to `New`.
6. Test an abandoned checkout (should remain `Pending` or `Expired`) and a payment that has not yet completed (should be `Processing`, not Paid).
7. Test repeat submissions with the same email/phone (limited per contact for 15 minutes). Monitor **Apps Script > Executions** for errors and the Stripe payments log for mismatches.
8. Stripe typically does **not automatically send customer receipt/invoice emails from test environments**. Verify invoice creation via the Stripe test Dashboard and the URL in the Google Sheet. Live invoice email delivery depends on Stripe's customer-email settings.

## 4. Turn on Stripe paid-invoice emails

Stripe Checkout Sessions are created with `invoice_creation[enabled]=true` so a **paid invoice** can be generated after a successful one-time payment. Visit https://dashboard.stripe.com/settings/emails and enable **Successful payments** under customer emails. Ensure your business and invoice information, branding, and tax settings are correct. Review Stripe's post-payment invoice fees: https://docs.stripe.com/receipts

**The Apps Script does not send Stripe invoices itself.** Stripe is responsible for the email; Apps Script only tracks invoice URLs and verified payment status.

## 5. Go live only after a successful test

1. Confirm any tax, shipping, refund policy, privacy notice and local business requirements.
2. Replace `STRIPE_SECRET_KEY` in **Script Properties** with the live key `sk_live_...`. Avoid mixing live and test accounts/orders on the same tracking sheet; prefer archiving test rows or a separate test Sheet before switching.
3. Confirm Stripe's live payment acceptance and paid-invoice customer-email settings.
4. With Apps Script `SHOP_CHECKOUT_ENABLED=true`, set `shopComingSoon:false` in `shop/index.html` and publish the code to the live GitHub Pages site.

## Why no Stripe webhook here?

Standard Stripe webhooks require verifying the `Stripe-Signature` HTTP header. Google Apps Script web app requests don't expose arbitrary incoming headers reliably. Instead, a **time-based Apps Script trigger polls Stripe's API** for outstanding Checkout Sessions and marks orders paid only when Stripe reports `payment_status=paid` **and** `status=complete`, and the amount, currency and order ID all match. This is not instantaneous, but no extra server is needed.

**Security / operational limits:** Apps Script publicly accepts checkout requests, with a per-contact throttling rule that does not replace IP-level protection. Apps Script and Stripe have quotas and API limitations. This is suitable for a modest-volume shop, not a high-volume platform. Keep the Sheet private: it contains customer contact information and delivery addresses. The Stripe Dashboard is the source of truth if the sheet sync is delayed. Invoice emails and actual fulfillment should be checked before shipping. You can increase robustness later if the shop grows.
