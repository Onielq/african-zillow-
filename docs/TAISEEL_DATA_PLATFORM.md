# Taiseel unified data platform

## Four connected products

- **Land Intelligence:** administrative geography, cadastral parcels, provenance, planning overlays and price references.
- **Development Intelligence:** developers, projects, project sites, buildings and units.
- **Real Estate Exchange:** organization-managed sale and rental listings, with evidence of authority, publication control and moderation.
- **Market Intelligence:** sourced transactions, contradictory evidence, listing observations and verified metrics.

The canonical relational and spatial foundation is PostgreSQL/PostGIS in the existing \`reja\` schema. The standalone REJA database model is adopted as the starting point, not operated as a second production platform.

## Model boundaries

\`reja.geographic_areas\` stores the administrative hierarchy: district > sector > cell > village. Its \`geo_areas\` view preserves the current application health contract. These geometries are not cadastral parcels.

\`reja.parcels\` stores cadastral identity, source feature key, UPI where supplied, geometry, area basis, source observation date and independent legal/availability states. A mapped parcel does not establish ownership, title, encumbrance, access, current availability or market value.

\`reja.development_projects\`, \`reja.development_buildings\` and \`reja.development_units\` form the developer-first project catalogue. Projects can link to verified organizations or legacy REJA developer records. A separate join table links the project to its parcel footprint.

\`reja.market_properties\` can link to a parcel, development project and unit. It remains a property identity for market reporting, not a title record.

\`reja.market_transactions\` and \`reja.market_transaction_evidence\` retain transaction and evidence history. Existing verified-only views remain the source for market statistics. Asking listings are separate from completed transactions.

\`reja.organizations\` and \`reja.organization_memberships\` establish organization and role records. \`reja.user_identities\` links external authentication subjects; the database does not store passwords or identity-provider secrets.

## Exchange publication controls

New and imported listings default to \`publication_state = 'research_only'\`. The migration does not promote any existing research record.

A listing can become publicly visible only when it has an organization, a publication timestamp, a current verified authorization record for that exact listing and organization, and the organization itself is active and verified. The database trigger blocks invalid publication. \`reja.public_market_listings\` is the public read model and excludes inactive, expired, unverified or unauthorized listings. The \`exchange_listings\` view preserves the application's schema-readiness contract; it is not the public-facing read model.

These controls are database safeguards, not a replacement for application authentication, server-side organization permission checks, CSRF protection, rate limits or moderation. Those workflows must be implemented before seller write endpoints are exposed. Row-level security policies are not enabled until the product's identity/session provider and access model are selected.

## Immutable migrations

SQL migrations are versioned in \`database/migrations/\`:

- \`001_reja_core.sql\` — adopted source-aware REJA asset, source, developer and evidence model.
- \`002_reja_market_intelligence.sql\` — adopted transaction, transaction-evidence, listing and observation model.
- \`003_unified_platform.sql\` — PostGIS, geography, parcels, identity, organizations, projects/buildings/units and exchange authority.

Apply with \`npm run db:migrate\`. The runner uses a PostgreSQL advisory lock, SHA-256 checksums, immutable migration names and one transaction per migration. Use a **direct** PostgreSQL connection (\`DATABASE_URL_UNPOOLED\`); it deliberately refuses a \`-pooler\` hostname. Application requests use the existing Neon serverless driver and pooled \`DATABASE_URL\`. Never expose database variables using a \`NEXT_PUBLIC_\` prefix.

## Rollout

The Neon project \`taiseel-platform\` is provisioned in \`aws-eu-central-1\`. The child branch \`foundation-20261108\` is the isolated migration-test target. Keep application production traffic disconnected until migration, readiness and end-to-end tests pass; do not promote the test branch as production without review.

No developer, project, transaction, parcel, property or listing rows are fabricated by this migration. Existing research directories and candidates stay unverified unless evidence and a review explicitly change their status.

Remaining product integration includes managed sign-in/session lifecycle, enforced organization roles, CRUD workflows, GIS ingestion with permission checks, reviewed historical data import, public MLS search/enquiries, and moderation/audit screens. GIS endpoint accessibility does not itself grant commercial redistribution rights.
