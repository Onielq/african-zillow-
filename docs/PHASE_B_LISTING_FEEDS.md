# Phase B — listing feeds and listing history

## Delivered in this phase branch

- A read-only API for source-observed active listings: `GET /api/market/listings`.
- Filters for sale/rent, property type, currency, district and sector, with bounded pagination.
- A source listing history endpoint: `GET /api/market/listings/:id/history`.
- A separate public Taiseel exchange endpoint: `GET /api/market/exchange/listings`.
- A public exchange event and price-history endpoint: `GET /api/market/exchange/listings/:id/history`.
- A timeline derived only from recorded source observations. It can identify a source-reported asking-price change, terms change, status change, or a transition from withdrawn/expired back to active.
- A public source-permission gate. A listing is returned only when its source is current and explicitly permits commercial use, redistribution and caching.
- No seller write endpoint, no fake inventory, and no new migration.

## Two listing systems stay separate

### External market listings

`reja.market_listings` stores advertisements observed from outside sources. `reja.market_listing_observations` stores dated snapshots of asking price, currency, rental period, area and source-reported status.

These records are not Taiseel-authorized inventory. The API labels the status as source-reported and includes source attribution and the last-observed timestamp. It does not turn a missing advert into a withdrawn or sold record.

### First-party Taiseel exchange inventory

`reja.exchange_listings`, `reja.exchange_listing_observations` and `reja.exchange_listing_events` are the separate first-party workflow from canonical migration `003_unified_platform.sql`.

The migration supports events such as created, submitted, approved, published, revised, withdrawn, expired, sold, leased and reopened. A listing needs verified seller authority for the exact property before it can be published. Public reads and seller/moderator access are protected by PostgreSQL row-level security.

The external-feed endpoints do not read or write first-party exchange tables. The public exchange endpoints read only currently published, unexpired listings. PostgreSQL row-level security must remain enabled; the API does not return seller IDs, authorization evidence, free-text moderation notes or private event payloads. First-party submission, moderation and private seller history remain disabled until a signed-session identity provider and trusted transaction-local user context are implemented. History for a listing that is no longer publicly published remains private to authorized parties.

## Status rules

| Source observation | Public wording / handling |
|---|---|
| `active` | Active — source reported |
| `withdrawn` | Withdrawn — source reported |
| `expired` | Expired — source reported |
| `sold_or_leased` | Sold or leased — source reported; exact outcome unspecified |
| `unknown` | Status unknown |
| `withdrawn/expired → active` | Relisted by source — only when both dated observations exist |

A property disappearing from a later feed is not proof of sale. A source's `sold_or_leased` value is not enough to say whether it sold or was leased. The system must not create a registered sale, title transfer, legal completion or ownership claim from a listing observation.

Asking prices remain separate from completed transaction records. Currency and rental period must remain visible and unlike amounts must never be combined.

## Runtime connection

The APIs require server-only `APP_DATABASE_URL`. Set it to a pooled connection for the dedicated, least-privilege `reja_app` role after the canonical migrations have been applied. That role must have read permissions only and must not bypass row-level security. The listing routes never use `DATABASE_URL` as a fallback and contain no write operations.

The general integration-health probe may use `APP_DATABASE_URL` first and `DATABASE_URL` as a legacy readiness fallback. Do not set an owner/migration credential as `APP_DATABASE_URL`.

## Current connection and data status

The production Vercel project currently has no production database URL. The only discovered database URL is scoped to an old preview branch used for schema-readiness validation; it must not be reused for production.

The Neon default branch is empty. A separate foundation branch contains an earlier partial schema, but its listing tables, listing observations, properties and source register have zero rows and do not match all of the latest canonical migration. The API therefore remains unconfigured until a development database is created from migrations `001`, `002` and `003`, the read-only role is provisioned, and a permitted listing source is imported.

The no-connection response is intentional. It prevents the UI or API from suggesting that no eligible records means there are no properties for sale.

## Import gate before the first live listing appears

1. Identify a maintainable source feed and stable listing identifier.
2. Confirm commercial display, caching and redistribution rights in writing. Record source metadata and the permission review on `reja.sources`.
3. Map and normalize location, type, currency, rent period and area without inventing missing values.
4. Import current listing rows and dated observations through the controlled ingestion workflow. Keep original source keys and observation dates.
5. Reconcile changed IDs, repeated adverts and stale records before retiring a current listing.
6. Verify price/status history against the source before treating a change as evidence.
7. Test the listing endpoint and its source-permission filters on a migrated development database before configuring production.

## Verification

The phase tests cover event derivation for price changes, terms changes, source-reported relisting, the deliberately ambiguous sold-or-leased status, and the public/private API boundaries. Database-backed API tests remain pending until the canonical development schema and an authorized feed are connected.
