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

Until products have their own package weight and dimensions, rates use one configurable default parcel and multiply the default weight by cart quantity.
