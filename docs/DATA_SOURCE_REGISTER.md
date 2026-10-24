# Data source register

Last reviewed: 24 October 2026  
Application: Rwanda Land Intelligence Map  
Pilot geography: Kigali City and Bugesera District

This register deliberately distinguishes data connectivity from data-quality validation and permission to reuse. A source that returns data is not automatically licensed for commercial redistribution.

## Current source inventory

| Source | Use in application | State | Main limitation / next action |
| --- | --- | --- | --- |
| Kigali City Master Plan administrative MapServer | District, sector, cell and village polygons for Kigali | Connected in prototype | Confirm permitted commercial use, attribution, caching and redistribution with the publisher. |
| Geodata Rwanda Bugesera Masterplan MapServer | Administrative polygons and planning overlays | Connected in prototype | Cell metadata reports NISR source/capture year 2012. Check whether a newer authoritative layer exists. |
| City of Kigali Kigali Parcels FeatureServer | Individual parcel polygons and public parcel fields | Connected in prototype | Source layer described as 1 June 2026. Confirm terms for commercial display, caching and redistribution. |
| NLA LAIS Bugesera_Parcels FeatureServer | Individual parcel polygons and UPI | Connected in prototype | Public layer metadata does not state a reuse licence. Obtain written permission; verify coverage, survey currency and caching/redistribution terms. Do not treat it as proof of title. |
| User-supplied `public/land-price-reference.tsv` | Supplied cell-level weighted-average price extract | Preserved as a raw 244-row audit input; not a production feed | Two rows are malformed and 10 province/district/sector/cell keys have conflicting values. The official `/prices` page output also repeats some geographic keys. The app does not average duplicates or select an arbitrary value. See `docs/LAND_PRICE_SOURCE_RECONCILIATION.md`, `public/land-price-reconciliation.tsv` and `public/land-price-district-snapshot.tsv`. |
| Rwanda Land Dashboard `/prices` page | District average land price and detailed weighted-average table | Provisional page snapshot mapped for four pilot districts | Indexed page values observed during the 24 October 2026 review: Gasabo 36,103; Kicukiro 61,499; Nyarugenge 50,771; Bugesera 4,038 RWF/m². Effective date and calculation method are not exposed in visible source text. The table repeats some geography keys. Not a live API or production-grade feed. |
| Rwanda Land Dashboard `/reference` page | Urban/rural reference prices; village-level minimum, weighted average and maximum; comparison table against transaction prices | Source identified; reconciliation incomplete | The page distinguishes reference prices from transaction prices and includes Village as a geographic field. Observation date, weight basis and a full machine-readable schema remain unconfirmed. Its transaction comparison shows Nyarugenge 50,865 RWF/m² versus 50,771 on `/prices`; do not silently treat them as the same measure. |
| Rwanda Land Dashboard `/transactions` page | Transaction trends and geographic analysis | Source identified; feed not connected | Use only validated aggregates and preserve each metric's period/definition. Do not treat transaction summaries as active listings or individual title records. |
| Rwanda Land Dashboard `/ownership` page | Registered-ownership statistics by gender, tenure, age, restrictions and use | Source identified; feed not connected | Ownership/registered parcel counts do not measure available-for-sale supply, achieved prices or rental yield. |
| Rwanda Land Dashboard `/land-use` page | Existing versus planned land-use area and parcel counts | Source identified; feed not connected | Planned land use is not market supply or proof that a plot is subdivided, available or ready for sale. |
| Rwanda Data Sharing Platform: Transaction Volume by Type and Year | Counts by transaction type/year and administrative geography | Candidate summary feed; not connected | Official metadata describes this as approved sharing: LAIS-derived summary data may be shared with approved users and is updated daily for sharing; its last metadata update was 20 October 2026 12:08:17. Redistribution still requires permission; contact the data owner before product ingestion. |
| NISR 2022 Population and Housing Census | Candidate demographic context for market analysis | Not connected | Preserve census year and geographic granularity; census values are not active listings, rent observations or transaction prices. |
| Authorised project / developer feed | Project discovery and developer directory | Not connected; dedicated routes show zero published records | No maintained, authorised source is connected. Do not fill the directory with stale advertisements or unverified company/project claims. |

## Verified source links

- Kigali Master Plan: https://masterplan.kigalicity.gov.rw/portal/apps/webappviewer/index.html?id=fdd2e30cbc15401d9daee5f68982d755
- Kigali parcel layer: https://masterplan.kigalicity.gov.rw/server/rest/services/Hosted/Kigali_Parcels_1June2026_for_search/FeatureServer/0
- Bugesera Masterplan: https://geodata.rw/portal/apps/experiencebuilder/experience/?id=8b259ba9599747898ca728dba4e6d215
- Bugesera NLA parcel layer: https://services7.arcgis.com/htgaiKX6RV2DDGgK/arcgis/rest/services/Bugesera_Parcels/FeatureServer/0
- Rwanda Land Dashboard overview: https://rwandalanddashboard.lands.rw/
- Rwanda Land Dashboard prices: https://rwandalanddashboard.lands.rw/prices
- Rwanda Land Dashboard reference prices: https://rwandalanddashboard.lands.rw/reference
- Rwanda Land Dashboard transactions: https://rwandalanddashboard.lands.rw/transactions
- Rwanda Land Dashboard ownership: https://rwandalanddashboard.lands.rw/ownership
- Rwanda Land Dashboard land use: https://rwandalanddashboard.lands.rw/land-use
- Rwanda Data Sharing Platform transaction metadata: https://data.gov.rw/datasets/3cee397e-8da0-418f-a382-b97feffba7ed
- Rwanda Data Sharing Platform datasets: https://data.gov.rw/datasets
- NISR Population and Housing Census: https://gis.statistics.gov.rw/data-sources/censuses/Population-and-Housing-Census
- NLA land use and mapping information: https://www.lands.rw/land-use-and-mapping

## Operational source-health checks

The application source register includes an on-demand health check at `/api/data-sources/health` for four GIS services plus two official land-market source pages: the Rwanda Land Dashboard prices page and the Rwanda Data Sharing Platform transaction-volume dataset page. The additional reference, transactions, ownership and land-use pages are documented as source leads; the current health check does not establish their underlying data freshness or reuse permission. For ArcGIS services it reads metadata such as HTTP reachability, exposed layer/schema information, a last-edit timestamp when supplied, and whether a licence statement is declared. For the two HTML pages it checks page availability and title only.

The check does **not** download parcel features, ownership attributes, or market-data rows. A reachable page is not a connected market-data feed. A reachable service, an exposed field list, and a published last-edit date are not proof of data completeness, survey accuracy, legal status, freshness of every feature, or permission to cache and redistribute. The UI must keep those checks separate.

## Non-negotiable data rules

1. Do not infer cadastral parcel edges from roads, satellite imagery, administrative polygons, or zoning overlays.
2. Do not fetch, expose or publish private owner/title data without clear authorization and a lawful purpose.
3. Show a source label and the applicable date/vintage wherever known. Where the date is unknown, say so.
4. Keep land-price snapshots, transaction aggregates, asking prices, achieved sale prices, rent observations and cadastral attributes as separate data concepts.
5. No market appreciation, rental yield, active supply, project status or payment plan should be displayed as a factual live metric until a suitable source, measurement definition and observation date are connected and tested.
6. Treat data completeness, positional/survey accuracy, legal status and reuse permission as four separate checks.
7. Before any production cadastral redistribution, retain written confirmation of permission, attribution, permitted caching and limits on display/derivative use.


## Directory publication gates

The `/projects` and `/developers` routes are available, but the directory feeds are not connected and the number of verified, published records is currently zero. This is not a claim that Rwanda has no projects or developers. The page requires record-level identity, source, location, last-verified date, and appropriate display permission before showing any result.


## User-supplied cell-price snapshot

The file `public/land-price-reference.tsv` preserves the table supplied for this implementation. It has 244 data rows and a header identifying province, district, sector, cell and weighted average price in RWF/m². Its observation date and the method used to calculate each weighted average were not included.

The application checks the shape of each row and groups repeated locations using normalized district + sector + cell names. A cell price is displayed only when the exact location key has one distinct valid value. Duplicate keys with conflicting values remain unresolved with their source row numbers visible. Rows with missing or extra fields remain in the raw file for audit but are not used as a price. Sector prices are not calculated by averaging the supplied cells, because the file does not provide a sector-level weighted average or the underlying weights.

Initial diagnostics: 242 valid-shaped rows, 2 malformed rows and 10 location keys with more than one price. These are data-quality findings, not a correction of the source values. Review the original source and observation date before production use.

## Public real-estate directory discovery

The Developers drawer contains the 20 organization candidates supplied by the project owner. Where a plausible organization website was found, it is linked as a discovery lead only. Its presence does not verify current legal identity, development role, project ownership, contact information or the right to reproduce a company logo.

The drawer separately lists estate-agency candidates found through public websites and eight publicly listed agent profiles across multiple agencies. These are labelled as review-pending candidates, not endorsements. No "top agent" ranking is shown because no comparable, current performance source was verified. Two developer candidates currently use logo assets found on a public company site/profile; all other organizations retain initials until a suitable logo asset is sourced and checked. Confirm present activity, affiliation, registration and display/contact permission before changing any candidate to verified.


## Price reconciliation record

The official source review on 24 October 2026 is documented in `docs/LAND_PRICE_SOURCE_RECONCILIATION.md`. The district values are stored in `public/land-price-district-snapshot.tsv` with separate review and observation-date fields. The row-level problem list is in `public/land-price-reconciliation.tsv`.

The review timestamp must not be mistaken for the underlying price observation date. District values are marked provisional until the publisher confirms the effective date and method. The raw 244-row user-supplied TSV remains unchanged so that source corrections can be audited rather than silently rewritten.


## Map discovery overlays and transaction activity

- OpenStreetMap / Overpass API: https://overpass-api.de/api/interpreter (fallback: https://overpass.kumi.systems/api/interpreter). Used for viewport-scoped discovery of landmarks, healthcare, schools, roads, bus stations/stops, parks, lakes and waterfalls. Attribution: © OpenStreetMap contributors. Coverage and tag completeness vary; not an official registry. Queries are limited to current Kigali/Bugesera pilot extents and bounded by viewport/zoom.
- Rwanda Land Dashboard transactions: https://rwandalanddashboard.lands.rw/transactions. The app records 4,350 transactions for Bugesera as a user-provided observation dated 24 Oct 2026, not a live/verified feed. The publicly indexed snapshot differed. Do not use it as a current official count until rechecked.
- Sector price shading is the unweighted arithmetic mean of distinct, unambiguous cells in `public/land-price-reference.tsv`. It is labelled indicative, not an official sector-weighted average; conflicting cells and malformed rows are excluded, and the raw file is preserved unchanged. Effective date and methodology remain outstanding.
