# KEBOON GROW — Stripe Checkout API

The storefront at https://keboon.net/shop/ is a static site. Deploy this Node.js API separately (Render, Railway, or another Node host), and configure the storefront API URLs.

## Required private backend environment variables
Copy .env.example for local testing only. Never commit a real .env file or paste API keys into chat.

- STRIPE_SECRET_KEY: test-mode first; live key only after testing.
- STRIPE_WEBHOOK_SECRET: Stripe webhook signing secret for POST /api/webhook.
- STRIPE_PRICE_ZINC, STRIPE_PRICE_AMINO, STRIPE_PRICE_CHITO, STRIPE_PRICE_SOIL, STRIPE_PRICE_CROP: MYR one-time Stripe Price IDs for each 1L product. Stripe prices are authoritative, not frontend display prices.
- STRIPE_SHIPPING_RATE_ID: Stripe Shipping Rate ID (shr_...) in MYR; a free shipping rate works if intended.
- SHOP_URL: https://keboon.net/shop/
- ALLOWED_ORIGINS: https://keboon.net (add https://www.keboon.net if it hosts the shop too).
- ACCEPT_ORDERS: false until ready.

## Setup
1. Create test-mode Stripe products, prices and shipping rate.
2. Run Node.js 20+: npm install, npm test, npm start.
3. Deploy to an HTTPS Node host and set environment variables in its secret manager.
4. Configure a Stripe webhook pointing to https://YOUR-API-HOST/api/webhook; subscribe to checkout.session.completed, checkout.session.async_payment_succeeded and checkout.session.async_payment_failed.
5. Set SHOP_CONFIG.checkoutEndpoint and SHOP_CONFIG.sessionStatusEndpoint in shop/index.html to the deployed HTTPS endpoints.
6. On a staging storefront, enable pricesConfirmed and disable shopComingSoon; set backend ACCEPT_ORDERS=true in test mode and test successful/cancelled payments, shipping, and webhook handling.
7. After confirmation of product amounts, shipping rules, tax requirements, and fulfillment procedures, switch to matching live Price IDs and live credentials and enable the live storefront.

## Notes
This MVP allows shipping to Malaysia only, with **one** Stripe Shipping Rate nationwide. Region-dependent shipping will need separate logic before launch.

The signed webhook logs paid Checkout Session IDs; it does not yet automate fulfillment, email dispatch or external order databases. Process paid orders in the Stripe Dashboard until fulfillment storage is implemented. Do not fulfill from browser redirects alone.

POST /api/checkout takes only product IDs and quantities and uses server-side Price IDs. GET /api/session-status returns minimal payment status. GET /api/health reports readiness without revealing credentials.

Before public launch, configure production availability monitoring and rate limiting.
