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
| User-supplied `public/land-price-reference.tsv` | Cell-level weighted-average land price reference for exact sector/cell matches | Imported into the pilot; 244 source data rows retained | The observation date is not supplied. Two rows have missing separators and ten location keys have conflicting prices. The UI shows only exact, unambiguous cell matches; it does not average conflicting rows, substitute district prices for cells, or infer a village/parcel price. The source figures are not represented as live prices. |
| Rwanda Land Dashboard prices page | District land price per m² snapshot | Snapshot mapped | Observation date is not exposed in the visible table. It is not a house-price index or a live/time-series feed. |
| Rwanda Data Sharing Platform: transaction volumes and land-use volumes | Candidate source for land-market activity summaries | Not connected | Dataset pages say summaries are for approved sharing. Confirm access and product redistribution terms before importing. Not parcel-level/title data. |
| NISR 2022 Population and Housing Census | Candidate demographic context for market analysis | Not connected | Preserve census year and geographic granularity; census values are not active listings, rent observations or transaction prices. |
| Authorised project / developer feed | Project discovery and developer directory | Not connected; dedicated routes show zero published records | No maintained, authorised source is connected. Do not fill the directory with stale advertisements or unverified company/project claims. |

## Verified source links

- Kigali Master Plan: https://masterplan.kigalicity.gov.rw/portal/apps/webappviewer/index.html?id=fdd2e30cbc15401d9daee5f68982d755
- Kigali parcel layer: https://masterplan.kigalicity.gov.rw/server/rest/services/Hosted/Kigali_Parcels_1June2026_for_search/FeatureServer/0
- Bugesera Masterplan: https://geodata.rw/portal/apps/experiencebuilder/experience/?id=8b259ba9599747898ca728dba4e6d215
- Bugesera NLA parcel layer: https://services7.arcgis.com/htgaiKX6RV2DDGgK/arcgis/rest/services/Bugesera_Parcels/FeatureServer/0
- Rwanda Land Dashboard prices: https://rwandalanddashboard.lands.rw/prices
- Rwanda Data Sharing Platform datasets: https://data.gov.rw/datasets
- NISR Population and Housing Census: https://gis.statistics.gov.rw/data-sources/censuses/Population-and-Housing-Census
- NLA land use and mapping information: https://www.lands.rw/land-use-and-mapping

## Operational source-health checks

The application source register includes an on-demand health check at `/api/data-sources/health` for four GIS services plus two official land-market source pages: the Rwanda Land Dashboard prices page and the Rwanda Data Sharing Platform transaction-volume dataset page. For ArcGIS services it reads metadata such as HTTP reachability, exposed layer/schema information, a last-edit timestamp when supplied, and whether a licence statement is declared. For the two HTML pages it checks page availability and title only.

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

The drawer separately lists estate-agency candidates found through public websites and one agent name listed on an agency's public profile. These are labelled as review-pending candidates, not endorsements. No "top agent" ranking is shown because no comparable, current performance source was verified. Confirm present activity, affiliation, registration and display/contact permission before changing any candidate to verified.
