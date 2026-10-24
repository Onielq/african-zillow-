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
| Rwanda Land Dashboard prices page | District land price per m² snapshot | Snapshot mapped | Observation date is not exposed in the visible table. It is not a house-price index or a live/time-series feed. |
| Rwanda Data Sharing Platform: transaction volumes and land-use volumes | Candidate source for land-market activity summaries | Not connected | Dataset pages say summaries are for approved sharing. Confirm access and product redistribution terms before importing. Not parcel-level/title data. |
| NISR 2022 Population and Housing Census | Candidate demographic context for market analysis | Not connected | Preserve census year and geographic granularity; census values are not active listings, rent observations or transaction prices. |

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

The application source register includes an on-demand health check at `/api/data-sources/health` for the four GIS endpoints already used by the map. It reads service metadata only and reports HTTP reachability, exposed layer/schema metadata, a last-edit timestamp when supplied, and whether the endpoint declares a licence statement.

The check does **not** download parcel features or ownership attributes. A reachable service, an exposed field list, and a published last-edit date are not proof of data completeness, survey accuracy, legal status, freshness of every feature, or permission to cache and redistribute. The UI must keep those checks separate.

## Non-negotiable data rules

1. Do not infer cadastral parcel edges from roads, satellite imagery, administrative polygons, or zoning overlays.
2. Do not fetch, expose or publish private owner/title data without clear authorization and a lawful purpose.
3. Show a source label and the applicable date/vintage wherever known. Where the date is unknown, say so.
4. Keep land-price snapshots, transaction aggregates, asking prices, achieved sale prices, rent observations and cadastral attributes as separate data concepts.
5. No market appreciation, rental yield, active supply, project status or payment plan should be displayed as a factual live metric until a suitable source, measurement definition and observation date are connected and tested.
6. Treat data completeness, positional/survey accuracy, legal status and reuse permission as four separate checks.
7. Before any production cadastral redistribution, retain written confirmation of permission, attribution, permitted caching and limits on display/derivative use.
