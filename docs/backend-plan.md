# Beyond Peps Backend Plan

## Direction

- Backend: Supabase for auth, database, admin-managed content, products, orders, and payment records.
- Product positioning: Research supplies.
- Payments: Provider-neutral order model so Stripe, PayPal, crypto, or other options can be added without redesigning orders.

## Supabase Tables

- `admin_users`: controls who can manage content and catalog data.
- `site_settings`: editable homepage/footer/admin copy as JSON.
- `products`: catalog items, status, pricing, tags, inventory, featured flag.
- `references`: educational guide/checklist/reference content.
- `blog_posts`: draft/published editorial content.
- `calculator_settings`: editable defaults for calculators.
- `orders`, `order_items`: checkout/order records.
- `payment_attempts`: provider-specific payment events and raw references.

## Next Build Step

1. Add the Supabase anon key to `scripts/supabase-env.js`.
2. Add the first admin user to `admin_users`.
3. Sign in from `/admin/index.html`.
4. Save content from the admin panel to write through Supabase.
5. Add payment provider adapters behind the shared `orders` and `payment_attempts` tables.

## Current Project

- Supabase project: `Beyondpeps`
- Project ref: `zcxwrgnlqfgdkeqysctg`
- URL: `https://zcxwrgnlqfgdkeqysctg.supabase.co`
- Migration applied: `202607050001_initial_backend.sql`

To fetch the anon key with the CLI, log in with a Supabase access token:

```bash
supabase login --token YOUR_SUPABASE_ACCESS_TOKEN
supabase projects api-keys --project-ref zcxwrgnlqfgdkeqysctg -o env
```

Then set the anon/public key in `scripts/supabase-env.js`.

## Payment Providers

The schema stores `payment_provider` and `payment_reference` on orders, with detailed attempts in `payment_attempts`. That keeps the storefront open to multiple payment options later without locking the catalog/admin work to a single processor.
