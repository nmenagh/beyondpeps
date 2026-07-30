# PayBito Payment Setup

PayBito is integrated as a hosted checkout provider. The browser never receives the PayBito API key.

## Workflow

1. Customer selects PayBito at checkout.
2. The site creates a Beyond Peps order in Supabase with `payment_provider = paybito`.
3. `/api/paybito-checkout` creates a PayBito payment session server-side.
4. Customer is redirected to the PayBito checkout URL returned by PayBito.
5. PayBito calls `/api/paybito-webhook` when payment status changes.
6. The webhook marks the Beyond Peps order `paid` when PayBito sends a paid/completed/success status.

## Required Vercel Environment Variables

- `PAYBITO_API_KEY`: PayBito public/test API key. The test docs show this as a `pk_...` key.
- `PAYBITO_MERCHANT_ID`: PayBito merchant ID.
- `SUPABASE_SERVICE_ROLE_KEY`: required so serverless endpoints can update orders/payment attempts.

## Optional Vercel Environment Variables

- `PAYBITO_WEBHOOK_SECRET`: shared secret for webhook protection.
- `PAYBITO_BROKER_ID`: sent in the checkout payload and as `X-Broker-ID` when present.
- `PAYBITO_BASE_URL`: defaults to `https://trade.paybito.com`.
- `PAYBITO_ORIGIN`: defaults to `SITE_URL`; use `https://beyondpeps.com` for the domain whitelist origin.
- `PAYBITO_CATALOG_ID`: defaults to `0`.
- `PAYBITO_CHECKOUT_BASE_URL`: defaults to `https://portal.paybito.com/payments/merchant/checkout/`.
- `SITE_URL`: canonical public site URL, for example `https://beyondpeps.com`.

## Webhook URL

If `PAYBITO_WEBHOOK_SECRET` is set, use:

```text
https://beyondpeps.com/api/paybito-webhook?token=PAYBITO_WEBHOOK_SECRET_VALUE
```

Do not store the real secret value in this repository.

## Admin Toggle

PayBito is disabled by default. In the admin panel:

1. Open `Payments`.
2. Click `PayBito`.
3. Enable PayBito checkout.
4. Set the customer-facing payment label and checkout note.
5. Save changes.

## Notes

The PayBito test-mode OpenAPI file documents a three-step cart flow:

1. `GET /TestPayments-Apikey-V2/api/v1/validate`
   - Headers: `publicKey`, `Origin`
   - Returns a temporary `secretHash` / `clientSecret`.
2. `POST /TestPayments-Apikey-V2/shopping/products/register`
   - Headers: `X-MBX-PUBLIC-KEY`, `CLIENT-SECRET-KEY`, `Origin`
   - Registers cart products and returns `cartToken` and `catalogId`.
3. `POST /TestPayments-Apikey-V2/shopping/payment/create`
   - Headers: `X-MBX-PUBLIC-KEY`, `CLIENT-SECRET-KEY`, `Origin`
   - Returns `id` / PCN and `brokerId`.

The checkout URL is built as:

```text
https://portal.paybito.com/payments/merchant/checkout/?data=BASE64URL({"paymentId":"PCN...","merchantId":"...","brokerId":"..."})
```

If PayBito returns `401 Unauthorized`, check:

- The API key is active for the selected live/test environment and starts with `pk_` for this cart flow.
- The Beyond Peps domain is whitelisted in PayBito if required.
- `PAYBITO_ORIGIN` exactly matches the whitelisted domain format PayBito expects.
