# Rwanda Land Intelligence Map

A map-first land intelligence platform for Rwanda, initially focused on Kigali City and Bugesera District.

## Current stage

The application includes an interactive MapLibre base map, a fallback basemap style, and viewport-based administrative polygons for four pilot districts: Gasabo, Kicukiro, Nyarugenge, and Bugesera.

**The ordinary road map remains visible.** As users zoom in, the map switches from district boundaries to sectors, cells, and villages. Area fills use 20% opacity by default, with stronger highlighting on hover and selection. Clicking a polygon identifies the area and fits the map to its extent.

**The basemap and administrative polygons are not a land registry.** Official cadastral parcel boundaries, listing counts, ownership records, verified zoning overlays, and market metrics are not yet connected. The app must not draw or infer individual plots from roads, satellite imagery, or administrative borders.

The current administrative API uses the Rwanda Environment Ministry GIS FeatureServer. Its district, sector, cell, and village layer descriptions reference boundaries based on the 2022 census. The service is publicly queryable, but access, version, and reuse terms must be confirmed before production.

## Local development

Requirements: Node.js 20.9 or newer and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000.

If an older `.env.local` still points to a style that will not load, the map will try the Liberty style as a fallback. You can also update `NEXT_PUBLIC_MAP_STYLE_URL` in `.env.local` to:

```text
https://tiles.openfreemap.org/styles/liberty
```

## Troubleshooting

- **MapLibre: "Worker failed to load."** The install hook and predev/prebuild hooks copy `maplibre-gl-worker.mjs` and its sibling `maplibre-gl-shared.mjs` into a versioned directory under `public/vendor/maplibre-gl/`. `MapView` registers that same-origin URL via `setWorkerUrl()` before creating a map. If you just pulled this fix, stop the dev server and restart it. If assets are still absent, run `npm run predev` and confirm that `public/vendor/maplibre-gl/<installed-version>/` contains both files. Do not copy one file without the shared module.
- **Hydration warning containing `data-new-gr-c-s-check-loaded` or `data-gr-ext-installed`.** These attributes are commonly injected by Grammarly before React hydrates. The body uses `suppressHydrationWarning` for this known extension-injected attribute mismatch. To verify the page without the extension, disable Grammarly on localhost or test in a clean browser profile.
- A `devtools://devtools/...` URL is a Chrome debugging URL, not a map-data endpoint. Diagnose the actual error message associated with it before changing app code.
- If the basemap fails after the worker is available, check the browser Network tab for style and tile requests. A working worker is necessary but does not guarantee that a third-party style or tile service is reachable.

## Geographic hierarchy and source plan

The visible navigation hierarchy is:

`District → Sector → Cell → Village → Land parcel`

The first four levels are administrative polygons. They come from the current pilot API and are revealed by zoom level. The last level is different: an individual land parcel is a cadastral record, not an administrative unit. Parcel outlines and identifiers must come from an authorized, current Rwanda Land Authority (RLA/LAIS) cadastral source.

Potential data references to validate before production:

- [Rwanda Environment Ministry GIS — 2022 census-based administrative boundaries](https://moegis.environment.gov.rw/server/rest/services/Hosted/Administrative_boundaries/FeatureServer)
- [geodata.rw — district boundaries](https://geodata.rw/server/rest/services/basemap/District_boundary/FeatureServer/0)
- [geodata.rw — sector boundaries](https://geodata.rw/server/rest/services/basemap/Sector_Boundary/FeatureServer)
- [geodata.rw — 2022 village boundaries](https://geodata.rw/server/rest/services/village_boundary/MapServer)

Important: some geodata.rw National Geodatabase metadata describes older 2006/2012 boundary vintages and says the dataset must not be transferred to third parties without RLA permission. Confirm the latest official version and written reuse rights before replacing the currently used boundary service or republishing its geometry. The app currently does not serve geodata.rw cadastral parcel records.

## Valhalla's role

Valhalla is a routing and map-matching engine. It can support driving/walking routes, snap a user-supplied GPS trace to mapped roads, calculate route distances, and produce travel-time isochrones around a plot or landmark. It does **not** derive legally meaningful cadastral parcel boundaries or administrative polygons. Use geographic boundary data for the district/sector/cell/village edges and RLA-approved cadastral data for plot edges.

## Data integrity rules

- Never invent parcel boundaries, listings, prices, ownership, or verification status.
- Keep parcels, advertisements, proposed subdivisions, zoning, and administrative boundaries separate.
- Show source, date, and confidence where available.
- Do not publish private documents or seller information without authorization.
- Never treat a listing or planning layer as proof of legal ownership.

## Validation

```bash
npm run lint
npm run typecheck
npm test
npm run build
```
