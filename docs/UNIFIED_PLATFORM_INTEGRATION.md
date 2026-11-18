# Neon database runtime integration

## What is wired

The active Land Intelligence app depends on `@neondatabase/serverless`. It uses the HTTPS transport for a server-side schema-readiness check and a separate, read-only public listing API. This driver is compatible with the Node.js runtime used on Vercel and the Cloudflare Worker runtime used by the second deployment.

`GET /api/data-sources/health` reports one of:
- `not-configured`: neither `APP_DATABASE_URL` nor `DATABASE_URL` is present.
- `invalid-credentials`: the URL is not a valid PostgreSQL connection string.
- `unavailable`: the connection or readiness query failed or timed out.
- `needs-setup`: PostgreSQL responds, but one or more canonical REJA schema objects are missing.
- `reachable`: core four-pillar tables plus listing observations, source-reuse permissions, seller authorizations and exchange event history are present.

The check does not read property records, seed data, create database objects or change records. It does not verify actual data quality, ownership, user authentication or seller authorization.

## Environment setup once a Neon project exists

Set `APP_DATABASE_URL` using the Neon pooled connection string for the least-privilege `reja_app` role on:
- Vercel project `rwanda-land-intelligence` (Production and Preview as appropriate).
- Cloudflare Worker `rwanda-land-intelligence` as a secret.

Use the pooled hostname for request-time runtime queries. `APP_DATABASE_URL` must use the SELECT-only `reja_app` role and must not bypass row-level security. `DATABASE_URL` is only a legacy readiness-check fallback in the web app; use a separate direct PostgreSQL connection for migrations and administrative tasks. Never expose either URL to the browser or commit it to Git.

The production Vercel project currently has no production database URL. A preview-only `DATABASE_URL` exists for an older schema-readiness branch; do not reuse it for production. The external listing API requires `APP_DATABASE_URL` and uses it only for read queries. It intentionally returns a configuration error until the canonical migrations, read-only role and source-permission records are ready.

## Schema source of truth

The canonical schema and migrations are maintained in `Onielq/Taiseel-reja-database/REJA-SQL-World-Class/database`:
- `001_initial_schema.sql`
- `002_market_intelligence.sql`
- `003_unified_platform.sql`

Apply migrations from that repository. Do not create parallel copies in this app repository.

## What remains disabled

The new market routes are read-only adapters for external source listings and public first-party exchange inventory. They return a configuration error until `APP_DATABASE_URL` points at the canonical schema. The current GIS APIs and map UI still use the existing live GIS providers and static research/benchmark inputs; they are not yet reading canonical projects, parcel records or units from PostgreSQL.

First-party listing submission, seller workspaces, moderation and private listing history remain disabled. Do not enable exchange writes until an identity provider is selected and the backend verifies signed sessions. For user-scoped database operations, trusted server code must set `reja.current_user_id` inside each transaction after verifying the identity. Never accept a user ID from an untrusted client. Public exchange reads rely on PostgreSQL row-level security and recheck the verified seller authorization at request time.
