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

- `PAYBITO_CREATE_PAYMENT_URL`: the full PayBito merchant API URL for creating a hosted checkout/payment.
- `PAYBITO_API_KEY`: PayBito merchant API key.
- `SUPABASE_SERVICE_ROLE_KEY`: required so serverless endpoints can update orders/payment attempts.

## Optional Vercel Environment Variables

- `PAYBITO_API_SECRET`: sent as `X-API-Secret` when present.
- `PAYBITO_WEBHOOK_SECRET`: shared secret for webhook protection.
- `PAYBITO_MERCHANT_ID`: sent in the checkout payload and as `X-Merchant-ID` when present.
- `PAYBITO_BROKER_ID`: sent in the checkout payload and as `X-Broker-ID` when present.
- `PAYBITO_CHECKOUT_BASE_URL`: base hosted checkout URL if PayBito returns a `paymentId`, `brokerId`, or PCN instead of a complete checkout URL.
- `PAYBITO_USE_BEARER_AUTH`: set to `true` only if PayBito confirms the create-payment endpoint expects `Authorization: Bearer`.
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

The PayBito public documentation is less explicit than Shippo or Resend about exact hosted-checkout response fields. The integration accepts several common checkout URL fields, including `checkout_url`, `payment_url`, `redirect_url`, and `url`, either at the top level or inside `data`. It also supports PCN or `paymentId`/`brokerId` responses when `PAYBITO_CHECKOUT_BASE_URL` is set.

If PayBito returns `401 Unauthorized`, check:

- The API key is active for the selected live/test environment.
- The create-payment URL matches the key environment.
- The Beyond Peps domain is whitelisted in PayBito if required.
- The Vercel serverless outbound IP is allowed if PayBito requires IP whitelisting.
- `PAYBITO_USE_BEARER_AUTH` is only enabled if PayBito explicitly requires bearer auth.
