# Shipping Setup

The cart calls `/api/shipping-rates`, which talks to Shippo from a Vercel serverless function. Keep the Shippo token in Vercel environment variables only; do not expose it in browser JavaScript.

Required Vercel environment variables:

- `SHIPPO_API_TOKEN`
- `SHIP_FROM_STREET1`
- `SHIP_FROM_CITY`
- `SHIP_FROM_STATE`
- `SHIP_FROM_ZIP`

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
