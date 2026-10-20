# Rwanda Land Intelligence Map

A map-first land intelligence platform for Rwanda, initially focused on Kigali City and Bugesera District.

## Current stage

The application now includes a live, interactive MapLibre basemap focused on Kigali City and Bugesera, with pan/zoom, metric scale, navigation controls, and quick camera focus buttons.

**The base map is not a land registry.** Parcel boundaries, listing counts, official zoning overlays, owner records, and market metrics are not yet connected. The interface states this explicitly.

The initial public basemap is OpenFreeMap Positron using OpenStreetMap-derived data. Review the provider's current terms and capacity before production launch. Set `NEXT_PUBLIC_MAP_STYLE_URL` to another approved MapLibre style URL when necessary.

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
npm test
npm run build
```

## Data integrity rules

- Never invent parcel boundaries, listings, prices, ownership, or verification status.
- Keep parcels, advertisements, proposed subdivisions, zoning, and administrative boundaries separate.
- Show source, date, and confidence where available.
- Do not publish private documents or seller information without authorization.
- Never treat a listing or planning layer as proof of legal ownership.
- Administrative boundary data must not be redistributed until the appropriate source permissions have been confirmed.

## Planned sequence

1. Live basemap and camera navigation. (Initial implementation)
2. Confirm terms/permissions and integrate administrative boundaries from approved sources.
3. Source registry, spatial data model, and viewport-based map API.
4. Listing records, parcel identity, subdivision relationships, hover/selection states, and details panel.
5. Planning/zoning and contextual layers.
6. Evidence-based price intelligence and area comparison.
7. Verification, security, QA, and release readiness.
