# AquaLC

**AquaLC** is a web platform for the swimming pool industry. It lets pool installers and businesses generate quotes and technical specification documents (CPS), manage a shared product catalogue, and run pool-sizing calculators — while individual pool owners get self-service tools for maintenance, heating, water treatment and hydraulics.

Built for an international market: currency is configurable per business/quote (defaults to USD, but any currency can be set), and the platform is not tied to a single country's market.

A single-page app (vanilla JS, no build step) backed by Supabase (auth, Postgres, Edge Functions) for data, and Paddle for subscription billing. Deployed as a static site on Cloudflare Workers.

## Who it's for

| Role | What they do |
|---|---|
| **Business** (`business`, `installateur` plans) | Manage clients, issue quotes (*devis*) and CPS documents, maintain a product catalogue, run calculators for jobs |
| **Particulier** (`proprietaire`, `cps` plans) | Manage their own pool, request quotes, run maintenance/heating/treatment calculators |
| **Admin** | Manage all businesses, particuliers, plans and the central product catalogue |

## Features

- **Quotes & CPS generation** — itemized quotes (*devis*) and *Cahier des Prescriptions Spéciales* documents, built from a line-item catalogue, with configurable VAT, discounts, validity period and a branded template (logo, header/footer, payment terms) per business.
- **Product catalogue** — shared central catalogue plus business-specific additions, organized by category (filtration, éclairage, stérilisation, etc.).
- **Calculators** — sizing/dosing tools for pool study (*étude*), maintenance (*entretien*), heating (*chauffage*), regulation (*régulateur*) and electrolysis/chlorination (*électrolyseur*), plus hydraulics.
- **Reference standards** — built-in pool safety and construction norms (currently NF/French standards; extendable to other regions' norms).
- **Multi-tenant accounts** — role-based access (admin / business / particulier) with Postgres Row Level Security, so each account only sees its own data.
- **Subscription plans & quotas** — four plans (CPS, Propriétaire, Installateur, Business) with monthly quotas per document/calculator type, billed through Paddle in any configured currency.
- **Auto-revoking manual access** — a scheduled Edge Function revokes manually-granted access once it expires.

## Tech stack

- **Frontend:** single `index.html` (vanilla JS/CSS), deployed as static assets on **Cloudflare Workers** (via Wrangler)
- **Backend:** **Supabase** — Postgres with RLS, Auth, and Edge Functions (Deno/TypeScript)
- **Billing:** **Paddle** (subscriptions, checkout, webhooks) — migrated from an earlier Stripe integration
- **Local state:** browser `localStorage` cache of the signed-in account's data

## Project structure

```
index.html                     # the entire frontend app
config.example.js              # copy to config.js — Supabase URL/anon key, Paddle client token
.env.example                   # copy to .env — server secrets (Paddle API key, Supabase service role, etc.)
supabase_schema.sql            # full production schema: tables, plans, RLS policies, triggers
supabase_migration_phase4.sql  # incremental migration
supabase/
  functions/
    paddle-webhook/            # handles Paddle subscription events
    create-portal/             # customer billing portal link
    admin-create-account/      # admin-only account creation
    revoke-expired-access/     # scheduled: revokes expired manual access
  migrations/                  # SQL migrations (Stripe→Paddle move, cron job, etc.)
stripe/setup-products.mjs      # legacy Stripe product setup script
catalogue_import_598_produits.txt  # bulk product catalogue import (598 products)
wrangler.jsonc                 # Cloudflare Workers deployment config
```

## Setup

1. **Clone and install**
   ```bash
   npm install
   ```
2. **Configure the frontend** — copy `config.example.js` to `config.js` and fill in your Supabase project URL, anon key, and Paddle client token (sandbox or live).
3. **Configure the backend** — copy `.env.example` to `.env` and fill in your Paddle API key, Paddle webhook secret, and Supabase service role key. Push these as Supabase secrets:
   ```bash
   supabase secrets set --env-file .env
   ```
4. **Set up the database** — run `supabase_schema.sql` in the Supabase SQL editor (idempotent, safe to re-run), then apply any files in `supabase/migrations/`.
5. **Deploy Edge Functions**
   ```bash
   supabase functions deploy paddle-webhook
   supabase functions deploy create-portal
   supabase functions deploy admin-create-account
   supabase functions deploy revoke-expired-access
   ```
6. **Run locally / deploy the frontend**
   ```bash
   npm run preview   # wrangler dev — local preview
   npm run deploy    # wrangler deploy — publish to Cloudflare Workers
   ```

## Security notes

- Never commit `config.js` or `.env` — both are gitignored.
- Only the Supabase **anon** key goes in `config.js`; the **service role** key is a backend secret used only by the webhook.
- All Paddle webhook payloads are signature-verified before being acted on.
- Data access is enforced at the database level via Postgres RLS, not just in the frontend.

## Status

Active development — see `FINAL_AUDIT_REPORT.md`, `FINAL_DEPLOYMENT_REPORT.md` and `DEPLOYMENT_CHECKLIST.md` for the current audit and deployment status.
