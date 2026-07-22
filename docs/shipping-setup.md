# Shipping Setup

The cart calls `/api/shipping-rates`, which talks to Shippo from a Vercel serverless function. Keep the Shippo token in Vercel environment variables only; do not expose it in browser JavaScript.

Required Vercel environment variables:

- `SHIPPO_API_TOKEN`
- `SHIP_FROM_STREET1`
- `SHIP_FROM_CITY`
- `SHIP_FROM_STATE`
- `SHIP_FROM_ZIP`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SHIPPO_WEBHOOK_SECRET`

Recommended Vercel environment variables:

- `SHIP_FROM_NAME`
- `SHIP_FROM_COMPANY`
- `SHIP_FROM_STREET2`
- `SHIP_FROM_PHONE`
- `SHIP_FROM_EMAIL`
- `SHIP_DEFAULT_ITEM_WEIGHT_OZ`

Standard products ship in one 8 x 4 x 3 inch box. Checkout adds each product's `Product weight (oz)` from the admin panel, then rounds the package weight up to the next ounce for Shippo. If a product has no weight yet, the fallback is `SHIP_DEFAULT_ITEM_WEIGHT_OZ`, or 1 oz when unset.

Products can also be marked `Must Ship Separately` in the admin product editor. When that is checked, enter package length, width, height, and weight using inches and ounces. Checkout calculates that product as its own Shippo package and combines matching service-level prices with the standard box package.

Shipping methods shown to customers are controlled in the admin panel under Site Content. The selected Shippo service-level tokens are sent to `/api/shipping-rates`, and the endpoint filters Shippo's returned rates before sending them back to the browser.

## Live shipment tracking

Beyond Peps stores each purchased label in `order_shipments`. Shippo tracking updates are received at:

`https://YOUR_PRODUCTION_DOMAIN/api/shippo-webhook?token=YOUR_SHIPPO_WEBHOOK_SECRET`

In the Shippo API Portal, create a production webhook with event type `Track Updated` and use that URL. Generate `SHIPPO_WEBHOOK_SECRET` as a long random value, store it in Vercel, and use the same value in the webhook URL. Do not put the secret in browser JavaScript or commit it to the repository.

Labels purchased through the Beyond Peps admin automatically create their shipment record with `PRE_TRANSIT` status. Shippo then sends normalized carrier updates to the webhook. The customer Orders page displays the current status, estimated delivery, delivery time, exception details, latest location, and recent tracking events.

The webhook requires `SUPABASE_SERVICE_ROLE_KEY` so it can update tracking records without a customer or admin browser session. The key must remain server-side in Vercel.

After deploying:

1. Apply the Supabase migration that creates `order_shipments`.
2. add `SHIPPO_WEBHOOK_SECRET` and confirm `SUPABASE_SERVICE_ROLE_KEY` in Vercel Production environment variables.
3. Deploy the site.
4. Create and test the `Track Updated` webhook in Shippo's API Portal.
5. Confirm a test event returns HTTP 200 or 202, then purchase a test label and verify its package appears in the customer order detail.
