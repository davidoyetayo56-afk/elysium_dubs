# ELYSIUM Dubs Hub

A responsive React + TypeScript learning-resource marketplace and student community. This repository is a production-oriented implementation, but it is **not live-production-ready until the deployment checklist is completed**. It supports a clearly labelled local demo mode and a real Supabase + Paystack backend when configured.

## What is implemented

- Responsive Home, Resources, Community, My Resources and About views.
- Resource search, subject filters, sorting, detail views, saved items and an account library.
- Supabase Auth sign-up, sign-in, sign-out and email-confirmation flow when configured.
- Database-backed community posts, replies, likes and bookmarks when configured.
- Paystack checkout initialisation and server-side verification in Supabase Edge Functions.
- A signed webhook handler for payment confirmation and idempotent purchase entitlement writes.
- Private resource storage with short-lived signed download URLs and server-side entitlement checks.
- PostgreSQL Row Level Security (RLS) policies, input length constraints, security headers and deployment examples for Vercel/Netlify.
- No service-role or Paystack secret is exposed in the browser bundle.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

For checks and a production bundle:

```bash
npm run typecheck
npm run build
npm run preview
```

If no Supabase public environment variables are present, the site runs in **demo mode**. Demo sign-in, likes, posts and saved resources are local-only. Checkout never pretends to succeed, and no demo purchase grants access to a file.

## Production setup

### 1. Create the Supabase project

1. Create a Supabase project and keep its database password in a password manager.
2. Copy the Project URL and publishable/anon key into a local `.env` based on `.env.example`.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. These are browser-visible values; the anon key is safe only because RLS is enabled and correctly configured.
4. In Supabase Auth, configure the site URL and exact redirect URLs for localhost and the production domain. Enable email confirmation and configure a real transactional email provider before public launch.
5. Apply `supabase/migrations/202610130001_initial_schema.sql` using the Supabase CLI or SQL Editor after reviewing it. The migration creates tables, RLS policies, triggers and private storage.
6. Never put the Supabase `service_role` key in a `VITE_*` variable or frontend file.

### 2. Configure Paystack safely

1. Complete the merchant onboarding and business verification required by Paystack for your use case.
2. Add the following **server-side Edge Function secrets** in Supabase: `PAYSTACK_SECRET_KEY`, `SITE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Supabase provides the latter two to deployed functions; set them only if your environment requires it.
3. Deploy functions: `paystack-initialize`, `paystack-verify`, `paystack-webhook`, and `resource-download`.
4. Configure the Paystack webhook URL to `https://YOUR_PROJECT.supabase.co/functions/v1/paystack-webhook` and subscribe to `charge.success`.
5. Use Paystack test keys and test transactions first. Never accept a browser-provided price as authoritative: the checkout function reads the price from the database and verification compares the amount, currency, reference and customer email.
6. Verify success, failure, abandoned checkout, repeated webhook delivery, duplicate purchases and interrupted browser redirects before launch.

### 3. Publish real resources

The sample cards in demo mode are illustrative placeholders, not real purchasable products. Do not publish them as actual paid products without replacing them with legitimate, reviewed content.

1. Upload a PDF/EPUB/ZIP to the **private** `resource-files` bucket. Keep the bucket private.
2. Insert a row in `public.resources` with a unique slug, correct subject/type, description, `price_kobo` (Naira × 100), private `file_path`, and `status='published'` only after the file and rights have been checked.
3. For a paid resource, `file_path` is required by the schema. A purchase entitlement is created only after server-side Paystack verification.
4. Upload cover images to `resource-covers` and store the resulting path if the frontend is extended to render uploaded covers.
5. The first administrator must be promoted deliberately after signing up. In the SQL Editor, verify the intended account ID before running a targeted update, for example:

```sql
select id, display_name from public.profiles where id = 'YOUR_AUTH_USER_UUID';
update public.profiles set role = 'admin' where id = 'YOUR_VERIFIED_AUTH_USER_UUID';
```

Never run the update with an unverified ID. Admin role changes should be restricted to trusted operators.

### 4. Deploy the frontend

- Deploy to Vercel or Netlify and set the two public `VITE_*` variables in the hosting dashboard.
- Set the same production URL in Supabase Auth redirect settings and the Edge Function `SITE_URL` secret.
- Keep `.env` out of Git; `.gitignore` excludes it. Commit `.env.example` only.
- The provided `vercel.json` and `netlify.toml` set baseline security headers. Validate the Content Security Policy against the actual deployed domain and any additional services before enabling it.
- Add custom domain, HTTPS, uptime/error monitoring, database backups, support contact, privacy policy, terms, refund policy, moderation process and an incident-response owner before public launch.

## Important limitations to close before a public launch

- The admin content-management interface is not yet built; resources are managed through Supabase until an audited admin UI is added.
- The app does not yet provide a complete report/moderation dashboard, resource-review/rating workflow, transactional email templates, customer-support workflow, or analytics/observability dashboard.
- The legal text must be written for the actual operator, audience, data practices, refund policy and applicable Nigerian requirements. This repository does not pretend to provide legal advice.
- RLS, Edge Functions and payment logic must be tested against a real Supabase staging project and Paystack test mode. A static source review is not a penetration test.
- The app has not been independently browser-tested on real Android/iOS devices or with assistive technology in this environment.
- The `9.8/10` score is a target, not a claim. It needs independent usability testing, accessibility review, performance measurements and real-user feedback.

## Useful commands

```bash
# Run frontend
npm run dev

# Type-check and create production bundle
npm run typecheck
npm run build

# Deploy Supabase schema/functions (install Supabase CLI separately)
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy paystack-initialize
supabase functions deploy paystack-verify
supabase functions deploy paystack-webhook
supabase functions deploy resource-download
```

## Security notes

- Keep payment secret keys and the Supabase service-role key server-side only.
- Do not use browser storage as proof of ownership or identity.
- RLS is required; do not disable it to make a failing query work.
- The private download function checks the current user and purchase record before issuing a 60-second signed URL.
- Payment webhooks verify Paystack's HMAC signature and then independently verify the transaction with Paystack's API.
- Keep dependencies updated and review the migration, RLS policies and security headers with a qualified engineer before accepting payments.
