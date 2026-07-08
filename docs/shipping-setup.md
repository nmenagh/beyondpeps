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
- `SHIP_DEFAULT_WEIGHT_OZ`
- `SHIP_DEFAULT_LENGTH_IN`
- `SHIP_DEFAULT_WIDTH_IN`
- `SHIP_DEFAULT_HEIGHT_IN`

Products can be marked `Must Ship Separately` in the admin product editor. When that is checked, enter package length, width, height, and weight using inches and ounces. Checkout calculates that product as its own Shippo package and combines matching service-level prices with the rest of the cart. Products without separate package data continue to use the configurable default parcel, with default weight multiplied by cart quantity.

Shipping methods shown to customers are controlled in the admin panel under Site Content. The selected Shippo service-level tokens are sent to `/api/shipping-rates`, and the endpoint filters Shippo's returned rates before sending them back to the browser.
