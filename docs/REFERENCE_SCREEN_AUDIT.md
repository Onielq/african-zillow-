# Screen-by-screen reference audit

**Reference repository:** [Onielq/african-zillow-development-](https://github.com/Onielq/african-zillow-development-)  
**Reference product shown:** DXB Interact Beta (Dubai)  
**Application:** Rwanda Land Intelligence Map  
**Audit date:** 24 October 2026  
**Scope:** All 18 screenshots in the reference repository. This is a behaviour and product-pattern audit, not a proposal to copy Dubai's underlying data or to present Dubai metrics as Rwanda facts.

## 1. What the reference interface is doing

The reference is a map-first market-intelligence workspace. Most of the product is one interactive map with layered actions rather than separate dashboard pages. The screenshots cover six feature families:

1. **Area map and metric exploration** — area polygons, metric labels, historical period selection.
2. **Metric menu and definitions** — selected metric, property scope, 1Y/6M/3M periods, and explanations of how each measure is calculated.
3. **Context overlays** — toggles for landmarks, medicals, metros and schools; an enabled metro overlay has coloured lines, stop markers and a legend.
4. **Area inspector** — a selected-area drawer with a six-card metric grid and a project summary list.
5. **Area comparison** — centred modal, area search, chips, up to four columns, and a comparison matrix.
6. **Project/developer discovery** — mode controls for Areas/Projects and toolbar controls for Developers/Projects.

### Visual and interaction patterns to preserve

- Keep the map as the primary canvas. Boundaries and metric labels sit directly over geographic polygons.
- Keep high-frequency controls in a compact floating toolbar; use distinct menus/popovers for secondary choices.
- Use a centred modal and a dimmed/blurred map backdrop for compare, rather than a small inline card.
- Allow comparison of up to four areas, with clear selected chips, removal, and a clear-all action.
- Use a side drawer for the selected area. Group the main indicators in a consistent card grid, then show the area-specific project records.
- Use black metric labels on the map with a consistent number format. Use a historical slider only when the dataset really contains values for the selected years.
- Explain every metric, including its unit, period, and measurement method. An information icon should open the explanation without requiring the user to guess.
- Show source freshness, attribution, missing-data states, and loading/error states. The reference's filled Dubai figures are examples of a product pattern, not figures to reuse for Rwanda.

## 2. Audit of all 18 reference screenshots

| # | Screenshot | Observed screen/state | Required Rwanda behaviour |
|---:|---|---|---|
| 1 | `Screenshot 2026-10-19 234441.jpg` | Default Areas map. Map fills the page; toolbar has Developers, Projects, Metrics, info and Show. Compare is centred in the header; Areas/Projects is at top-right. Area polygons have labels/count markers. | Keep map-first Kigali/Bugesera exploration; use Rwanda administrative areas and RWF/m² units. Separate supported data from unconnected metrics. |
| 2 | `Screenshot 2026-10-19 234557.jpg` | Metrics menu open. Property scope tabs show All, Apartment, Villa; periods are 1Y, 6M, 3M. The list includes average price/sqft, sales volume, capital appreciation, rental yield, market supply and upcoming supply. | Preserve one metric selector and a scope/period model, but use suitable Rwanda property categories and units. Disable filters that a particular source cannot support. Do not show Apartment/Villa stats for a land-only feed. |
| 3 | `Screenshot 2026-10-19 234644.jpg` | Show menu with toggles for Landmarks, Medicals, Metros and Schools. | Add POI/context layers only after the Rwanda dataset, date, attribution and usage terms are checked. Rename Dubai-specific concepts where needed; do not imply that Rwanda has a metro network. |
| 4 | `Screenshot 2026-10-19 234723.jpg` | Metric help popover explains units and time windows. It defines average price, transaction count, appreciation, rental yield, market supply, upcoming supply and projects. | Every metric needs a plain-English formula, unit, observation window, source and caveat. Distinguish registered land transactions from property sales/listings and land value from built-property value. |
| 5 | `Screenshot 2026-10-19 234803.jpg` | Transit overlay enabled. Coloured metro lines, station symbols and a map legend are visible together with area polygons. | Map an appropriate Rwanda transport layer (for example, verified transport routes/stops) if a permitted source is found. Keep it separate from cadastral and administrative geometry. |
| 6 | `Screenshot 2026-10-19 234916.jpg` | Selected area detail drawer for Al Jaddaf. Six cards show price, sales volume, rental yield, new projects, appreciation and upcoming supply; below is a project card with developer, starting price, sales and completion progress. | Build a consistent area-inspector card grid. Populate only metrics with a validated Rwanda source; show explicit “not connected” states for the rest. Only render project cards when a real project record, provenance and freshness are available. |
| 7 | `Screenshot 2026-10-19 235025.jpg` | Compare modal in its empty state with a search field and instructions; background map is blurred/dimmed. | Modal opens with a clear empty state, search input and a maximum of four area selections. |
| 8 | `Screenshot 2026-10-19 235205.jpg` | User types “dubai”; a scrollable list of matching area names appears. | Search only names/IDs from the connected Rwanda geography index. Include the area level and district to avoid ambiguous same-name results. Do not source suggestions from free-form listing text. |
| 9 | `Screenshot 2026-10-19 235225.jpg` | One selected area chip and one-column comparison matrix. The matrix displays seven metric rows. | Keep the matrix stable at one selected area. Use current, source-backed values when available and transparent pending cells otherwise. |
| 10 | `Screenshot 2026-10-19 235342.jpg` | Two area chips/columns. Trophies identify row leaders for sales volume, appreciation and rental yield. | Add row-leading indicators only when comparable numeric values exist for all relevant areas and periods. A missing value must never win by being treated as zero. |
| 11 | `Screenshot 2026-10-19 235513.jpg` | Three areas selected. Three comparison columns are shown; one column is highlighted and row leaders remain visible. | Support up to four columns, keep the currently focused area distinct, and allow removing a chip or clearing all selections. |
| 12 | `Screenshot 2026-10-19 235617.jpg` | Average price/sqft map with numeric labels on areas and a historical slider from 2012–2026. 2026 is selected. | A timeline must be backed by a verified time series with stable definitions and dates. The currently mapped Rwanda price data is a district snapshot without an observation date, so the historical slider is not yet valid for that metric. |
| 13 | `Screenshot 2026-10-19 235647.jpg` | Historical slider moved to 2019; price labels change with the selected year. | When a licensed Rwanda time series is available, selecting a year must change the actual queried observation and display its period/source. Do not animate or extrapolate missing years. |
| 14 | `Screenshot 2026-10-19 235727.jpg` | Sales volume metric selected; numeric transaction counts replace price labels. | Connect approved transaction aggregates, define the count period, join using official administrative IDs and show the actual source update period. Don't substitute parcel counts for transaction volume. |
| 15 | `Screenshot 2026-10-19 235807.jpg` | Capital appreciation selected; area labels are percentages. | Compute only from comparable, source-backed observations with a stated methodology. Do not convert district land prices into a built-property appreciation index. |
| 16 | `Screenshot 2026-10-19 235842.jpg` | Market supply selected; area labels show counts. | “Supply” must be active units available for sale/rent from a current listing source. Registered parcel stock is not market supply. |
| 17 | `Screenshot 2026-10-19 235909.jpg` | Upcoming supply selected; area labels show expected delivery counts. | Requires documented projects under construction and validated unit counts/delivery stages. Planning/zoning land or unverified announcements cannot stand in for upcoming supply. |
| 18 | `Screenshot 2026-10-19 235932.jpg` | Rental yield selected; area labels show percentages. | Requires comparable, time-stamped rental and sale/purchase-value records, a stated gross/net formula, and enough observations to defend the result. Otherwise, mark unavailable. |

## 3. Current implementation versus the reference

This comparison is based on the live application code on `main`, not assumptions based on filenames.

| Capability | Current Rwanda application | Gap to close |
|---|---|---|
| Main map | MapLibre workspace; map/satellite control; Kigali and Bugesera administrative polygons; parcel geometry at high zoom. | Add reference-style context overlay controls only as validated sources are connected. Preserve current source/legal warnings. |
| Administrative drill-down | District → sector → cell → village → parcel inspection. | Preserve this as the Rwanda-specific advantage rather than replacing it with non-authoritative neighbourhood polygons. |
| Metric selector | Six metric choices. Only the district land-price snapshot is currently numeric; other metrics are clearly marked pending. | Improve metric menu and help popover, but keep unsupported metrics unpopulated until data is approved and verified. |
| Scope and period | Scope is All property/Residential/Land; period selector is 3/6/12 months and is disabled for the undated land-price snapshot. | The reference has 1Y/6M/3M and All/Apartment/Villa. Adapt controls to Rwanda datasets instead of copying categories uncritically. |
| Context overlays | No verified landmarks/medical/school/public-transport overlay menu is connected. | Find permitted, maintained geographic sources; present source and freshness. |
| Selected-area drawer | Shows parcel attributes, source/level, an available district price, and comparison action. It doesn't yet provide the six-card investment summary or verified project list. | Re-layout as consistent metric cards with data statuses; no fabricated project cards. |
| Comparison | Up to four clicked-map areas and a table; missing metrics are pending. | Match the centred modal/search/chips interaction and support row leaders only for fully comparable metrics. |
| Historical data | No mapped year-by-year metric series. | No timeline until the source supports a real, queryable time series. |
| Projects mode and directory | The map's Projects mode explains that inventory is not connected. The dedicated `/projects` route now gives a source-gated empty state and explains the evidence required for a project record. | Connect an authorised, maintained project feed before showing project markers, prices, payments, stages or units. |
| Developers | The dedicated `/developers` route states that no verified directory is connected and sets identity, authority, project linkage, contact-permission and freshness requirements. No developer profiles are fabricated. | Connect an authorised source or partner feed and verify record-level evidence before publishing profiles. |
| Data governance | Dedicated `/data-sources` page and `docs/DATA_SOURCE_REGISTER.md` added; cadastral reuse issues are visible. | Record the permission decision and audit trail at each source integration. |

### Implementation checkpoint (24 October 2026)

The audit, comparison modal/search, selected-area chips, evidence-aware area cards, metric-definition popover and GIS metadata health check were merged to `main` in PR #11. The next implementation branch adds dedicated `/projects` and `/developers` routes and checks availability of the two official market-source pages. These directory pages deliberately publish no records until a permitted, current feed is verified. A source page being reachable does not mean its data has been imported or its terms approved.

## 4. Rwanda data source readiness

This table separates **geographic reference layers** from **market indicators** and **listing/project inventory**. Those data classes answer different questions and must not be substituted for one another.

| Data class | Current source or candidate | State / constraint |
|---|---|---|
| Kigali administrative boundaries | [Kigali City Master Plan GIS](https://masterplan.kigalicity.gov.rw/portal/apps/webappviewer/index.html?id=fdd2e30cbc15401d9daee5f68982d755) | Connected for district, sector, cell and village. Confirm commercial reuse/caching terms. |
| Bugesera administrative boundaries | [Geodata Rwanda Bugesera Masterplan](https://geodata.rw/portal/apps/experiencebuilder/experience/?id=8b259ba9599747898ca728dba4e6d215) | Connected; source metadata flags 2012 capture vintage for the cell layer. Find/confirm a newer authoritative layer before high-consequence use. |
| Kigali parcel geometry | [City of Kigali parcel FeatureServer](https://masterplan.kigalicity.gov.rw/server/rest/services/Hosted/Kigali_Parcels_1June2026_for_search/FeatureServer/0) | Connected. Parcel geometry/fields remain identification data, not legal-title proof. Confirm publication and commercial reuse terms. |
| Bugesera parcel geometry | [NLA-hosted LAIS Bugesera parcel layer](https://services7.arcgis.com/htgaiKX6RV2DDGgK/arcgis/rest/services/Bugesera_Parcels/FeatureServer/0) | Production requests UPI + geometry only. Metadata does not declare reuse rights; obtain written permission and verify coverage/currentness before broad commercial use. |
| District land-price snapshot | [Rwanda Land Dashboard prices](https://rwandalanddashboard.lands.rw/prices) | Mapped for four pilot districts; source table doesn't expose an observation date. Not a house-sale price index and not a year-by-year series. |
| More detailed reference prices | [Rwanda Land Dashboard reference prices](https://rwandalanddashboard.lands.rw/reference) | Candidate to investigate for a stable, permitted machine-readable source and methodology. Do not rely on scraping rendered tables as a production ingestion contract. |
| Transaction aggregates | [Transaction Volume by Type and Year — Rwanda Data Sharing Platform](https://data.gov.rw/datasets/3cee397e-8da0-418f-a382-b97feffba7ed) | Described as summary statistics derived from LAIS, not individual title records. Dataset terms say sharing is for approved users and prohibit redistribution without permission. Contact owner/provider before product integration. |
| Population/demographics | [NISR 2022 Population and Housing Census](https://gis.statistics.gov.rw/data-sources/censuses/Population-and-Housing-Census) | Candidate context only. Preserve survey year, geographic granularity and official methodology; not an active listings, rent or property-price feed. |
| Active listing supply / rent records | No verified permitted feed connected. | Needs listing partnerships or other authorized data. A social post or historic listing isn't reliable evidence of current availability. |
| Developer/project pipeline | No verified feed connected. | Needs developer/authority/partner records, update timestamp, project identity, development stage, unit count, price/payment details and permission to display. |
| Amenities and transit | No verified Rwanda POI/transit feed connected in this app. | Research publisher, currency, completeness, ODbL/other licence, attribution and allowed caching before adding overlay toggles. |

### Data-source gates

The Rwanda Data Sharing Platform's [transaction dataset page](https://data.gov.rw/datasets/3cee397e-8da0-418f-a382-b97feffba7ed) explicitly says the content is summary data derived from LAIS and says not to redistribute it without permission. The dashboard may be publicly viewable, but that alone does not establish permission to copy, cache or republish the dataset in a commercial product.

For every source, record four independent checks: **reuse permission, completeness/coverage, positional or statistical quality, and freshness**. Passing one check does not imply passing the others.

## 5. Implementation sequence

### P0 — finish the interaction patterns without inventing data
1. Rework Compare into a centred modal with a search field, selected-area chips, remove/clear actions and up-to-four columns.
2. Make the comparison value model explicit: `numeric value + unit + source + observation period + status`. Missing values remain missing. Do not rank a row unless values are comparable across its selected areas.
3. Rework the selected-area drawer into a metric-card grid. Keep the available sourced land-price value; render honest “not connected” states for unsupported metrics. Show project cards only for verified project records.
4. Add metric-information popovers that explain units, methodology, period and limitations.
5. Keep a historical slider hidden/disabled for any metric without validated year-by-year data.

### P1 — connect a permitted and testable market-data feed
1. Ask the dataset owner for approved product use, permitted caching/redistribution, attribution and refresh expectations for LAIS-derived transaction aggregates.
2. Investigate the Land Dashboard reference-price table for a supported download/API contract rather than relying on HTML scraping.
3. Normalize source fields and administrative identifiers; retain source URL, source timestamp, retrieval timestamp, observation period, measurement unit and geographic level.
4. Add tests for missing values, duplicate IDs, schema changes, stale data, failed upstream requests and geographic-join rates.

### P2 — Projects and Developers pages
The first version of both routes is implemented as evidence-gated directories with an explicit empty state. Before publishing project/developer results, agree which publisher or partner owns the records and can authorize display. Each record needs a stable ID, update timestamp, geographic ID/coordinates, source, and a data-status trail. Project price, launch/availability state, completion progress, payment plan and delivery units must not be guessed.

### P3 — contextual map overlays
Select official or properly licensed sources for health facilities, schools, landmarks and Rwanda-appropriate transit/road layers. Add toggles and legends only after each overlay's licence, currentness, attribution and geographic quality have passed review.

### P4 — quality and launch checks
- Test every screen at desktop and mobile breakpoints.
- Confirm each metric tooltip matches its implemented calculation and dataset.
- Verify a missing source fails visibly, never falls back to synthetic markers or hidden stale data.
- Keep source attribution and the “geometry is not proof of legal title” notice close to cadastral views.
- Re-test the whole map after adding any new layer to ensure map-worker, hydration, zoom and parcel-boundary fidelity remain stable.

## 6. Acceptance criteria

- The 18 reference states are mapped to explicit requirements above.
- Every implemented metric is tied to a defined source and measure; absent values are not faked.
- The comparison UI works for one to four areas, clear/remove actions, duplicate selections, and partly missing metrics.
- Project/developer routes are navigable and clearly explain the empty state; they publish no records until a verified, permitted source exists.
- Cadastral, administrative, zoning, listing and planning layers remain semantically distinct.
- `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` pass before changes are merged.
