# Rwanda Land Intelligence Map

A map-first land intelligence platform for Rwanda, starting with Kigali City and Bugesera District.

## Project status

This repository is being initialised in phases. The current commit establishes the application foundation only; it does not yet contain live parcel data, cadastral boundaries, zoning overlays, or market metrics.

## Product rules

- MapLibre owns map rendering, feature hit-testing, pan and zoom.
- GSAP is reserved for interface transitions.
- Never invent parcel boundaries, listings, prices, ownership, or verification status.
- Separate parcels, advertisements, proposed subdivisions, zoning, and administrative boundaries.
- Show source, date, and confidence where data supports them.
- Do not expose private documents or seller information without authorization.
- Never treat a listing or a planning layer as proof of legal ownership.

## Local development

Requirements: Node.js 20.9 or newer and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000.

## Validation

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## Configuration

See `.env.example`. The setup shell intentionally does not connect to a live basemap, land registry, GIS service, or database until the data-access and provider decisions are approved.

## Planned sequence

1. Application foundation and design tokens.
2. Map engine proof of concept using an approved basemap and permitted administrative boundary data.
3. Source registry, spatial data model, and viewport-based map API.
4. Listings, parcel identity, subdivision relationships, and detail panel.
5. Planning/zoning and contextual layers.
6. Evidence-based price intelligence and area comparison.
7. Verification, security, QA, and release readiness.

The approved product/design/architecture/data/API specifications and coding rules must remain the source of truth for subsequent work.
