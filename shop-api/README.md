# KEBOON GROW — dynamic Stripe Checkout

The storefront at https://keboon.net/shop/ uses **shop/catalog.json** as the editable product catalogue. Add, remove or edit product entries in that file: no Stripe product or Price ID setup is needed. All prices are in integer sen (`unitAmount: 3800` means RM38.00). The displayed price is derived from the catalogue; at checkout, the API **re-reads that same trusted server-side file** and builds Stripe Checkout `price_data` for the selected product IDs and quantities.

Do not accept a client-supplied total or unit amount. Customers can edit browser JavaScript, and Stripe will charge exactly what your server requests, not what you intended.

## Hosting and credentials
GitHub Pages cannot run server-side Stripe code. Deploy the Node service on a separate HTTPS host. Deploy the same Git commit of `shop/catalog.json` with that service and the storefront to keep product prices synchronized. The production backend should be rebuilt/redeployed whenever the catalogue changes.

Copy `.env.example` for local testing. Never commit actual secrets. Set on your backend hosting provider:
- `STRIPE_SECRET_KEY`: Stripe test key initially.
- `STRIPE_WEBHOOK_SECRET`: Stripe signing secret for POST /api/webhook.
- `STRIPE_SHIPPING_RATE_ID`: existing Stripe Shipping Rate (shr_...). The shop currently requires a single Malaysia-wide shipping rate; ask before activating if shipping varies by region.
- `SHOP_URL=https://keboon.net/shop/`
- `ALLOWED_ORIGINS=https://keboon.net`
- `ACCEPT_ORDERS=false` until test mode is ready.

Run Node.js 20+ in `shop-api` via `npm install`, `npm test`, `npm start`. Set the browser's `SHOP_CONFIG.checkoutEndpoint` and `SHOP_CONFIG.sessionStatusEndpoint` to the deployed HTTPS API URLs.

Register the Stripe webhook for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and `checkout.session.async_payment_failed`. The signed webhook logs paid session IDs; use Stripe Dashboard to manage fulfillment until a durable order database/notifications are implemented. **Do not fulfill from browser redirects.**

After payment and shipping testing in Stripe test mode, confirm real product prices and shipping/tax requirements, update credentials and webhooks to live mode, and only then set `shopComingSoon: false`, `pricesConfirmed: true`, and backend `ACCEPT_ORDERS=true`.

## Limitations before production launch
- One fixed Stripe Shipping Rate for Malaysia, no regional shipping logic yet.
- No automated fulfillment or persistent order database.
- Add rate limits and hosting uptime monitoring before public launch.
- The product catalogue must be deployed consistently to both frontend and backend.
