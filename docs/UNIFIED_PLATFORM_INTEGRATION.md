# Neon database runtime integration

## What is wired

The active Land Intelligence app now depends on `@neondatabase/serverless` and uses its HTTPS query transport for a server-side readiness check. This driver is compatible with the Node.js runtime used on Vercel and the Cloudflare Worker runtime used by the second deployment.

`GET /api/data-sources/health` reports one of:
- `not-configured`: no `DATABASE_URL` secret is present.
- `invalid-credentials`: the URL is not a valid PostgreSQL connection string.
- `unavailable`: the connection or readiness query failed or timed out.
- `needs-setup`: PostgreSQL responds, but one or more canonical REJA schema objects are missing.
- `reachable`: the expected four-pillar schema objects are present.

The check does not read property records, seed data, create database objects or change records. It does not verify actual data quality, ownership, user authentication or seller authorization.

## Environment setup once a Neon project exists

Set `DATABASE_URL` using the Neon pooled connection string on:
- Vercel project `rwanda-land-intelligence` (Production and Preview as appropriate).
- Cloudflare Worker `rwanda-land-intelligence` as a secret.

Use the pooled hostname for request-time runtime queries. Use a separate direct PostgreSQL connection for migrations and administrative tasks; never expose either URL to the browser or commit it to Git.

The live app currently has no Neon project to connect to. No credential is configured by this change.

## Schema source of truth

The canonical schema and migrations are maintained in `Onielq/Taiseel-reja-database/REJA-SQL-World-Class/database`:
- `001_initial_schema.sql`
- `002_market_intelligence.sql`
- `003_unified_platform.sql`

Apply migrations from that repository. Do not create parallel copies in this app repository.

## What remains disabled

This PR wires connectivity and health reporting only. The current GIS APIs and map UI still use the existing live GIS providers and static research/benchmark inputs. They are not yet reading canonical projects, parcel records, units, first-party listings or market observations from PostgreSQL.

Do not enable exchange writes until an identity provider is selected and the backend verifies signed sessions. For user-scoped database operations, trusted server code must set `reja.current_user_id` inside each transaction after verifying the identity. Never accept a user ID from an untrusted client.
