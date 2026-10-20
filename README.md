# Rwanda Land Intelligence Map

A map-first land intelligence platform for Rwanda, initially focused on Kigali City and Bugesera District.

## Current stage

The application includes an interactive MapLibre base map, a Map/Satellite switcher, a fallback basemap style, and viewport-based administrative polygons for four pilot districts: Gasabo, Kicukiro, Nyarugenge, and Bugesera. Satellite mode uses Esri World Imagery raster tiles; administrative overlays are rebuilt above the imagery when the style changes.

**The ordinary road map remains visible.** As users zoom in, the map switches from district boundaries to sectors, cells, and villages. Area fills use 35% opacity by default, 50% for selected areas, and 62% on hover. The map's zoom-out floor is calculated from the current viewport so the full padded Rwanda extent fits on screen. Panning is constrained to Rwanda's geographic envelope. Clicking a polygon identifies the area and fits the map to its extent.

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

## Investment intelligence workspace

The map workspace includes a six-metric selector, property-type and analysis-period filters, an Areas / Projects mode switch, a data-source register, and a comparison shortlist for up to four areas.

### Metric source readiness

- **Average land price / m²:** an initial district-level snapshot from the [Rwanda Land Dashboard prices page](https://rwandalanddashboard.lands.rw/prices) is mapped for Gasabo, Kicukiro, Nyarugenge, and Bugesera. The source page does not expose the observation date in its displayed table. The snapshot is not a live feed, is only shown at district level, and must not be treated as the price of a built house. Sector, cell, and village price values are not populated in this map layer.
- **Transaction volume:** the Rwanda Data Sharing Platform lists National Land Authority / Rwanda Land Dashboard aggregate land-transaction datasets. The data feed and geographic join are not connected yet.
- **Capital appreciation:** the Land Dashboard shows a land-price trend, but that time series has not been imported, quality-checked, or joined to map areas. It is not a house-price index.
- **Market supply:** registered parcel summaries can describe registered parcel stock, but they are not the same as properties actively listed for sale or rent.
- **Rental yield:** requires consistent, verified rental observations and comparable purchase-price data.
- **Upcoming supply and project pages:** require verified developer records, construction milestones, unit availability, and payment-plan data.

Useful public starting points are the [Rwanda Land Dashboard](https://rwandalanddashboard.lands.rw/) and the [Rwanda Data Sharing Platform](https://data.gov.rw/datasets). The platform describes some land datasets as aggregated summaries derived from the Land Administration Information System (LAIS), not individual parcel-title records. Follow each dataset's citation and reuse rules; its published terms may restrict redistribution.

The comparison panel can shortlist area names and levels. It shows the sourced district land-price snapshot where available and marks the other metric rows as pending. Projects mode does not fabricate project markers, prices, payment plans, or construction percentages.

## Rwanda viewport limits and boundary opacity

- Administrative polygon opacity: 35% by default, 50% when selected, and 62% on hover.
- Zooming out stops at a minimum zoom derived from the current map size so Rwanda's full geographic extent fits in view on desktop and mobile.
- Map panning is constrained to a padded longitude/latitude envelope around Rwanda.
- This is a camera constraint using a geographic envelope, not a polygon mask that removes every pixel outside Rwanda's exact international border.

## Satellite imagery source and licensing

The prototype's Satellite view uses the Esri World Imagery tile service and includes imagery attribution in MapLibre's attribution control. See [Esri's World Imagery attribution guidance](https://support.esri.com/en-us/knowledge-base/what-is-the-correct-way-to-cite-an-arcgis-online-basema-000012040) and [Esri's terms for websites and services](https://www.esri.com/en-us/legal/terms/web-site-service).

Before public or commercial production, confirm that this access method and the service's imagery licenses permit the app's intended use. The imagery may contain third-party data with additional terms, and Esri can change service availability. For production, use a provider and plan whose terms explicitly cover the expected commercial usage, traffic, caching, and attribution.

Satellite imagery helps people visually understand the ground. It does not prove legal ownership and must not be used to infer cadastral plot boundaries.

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
