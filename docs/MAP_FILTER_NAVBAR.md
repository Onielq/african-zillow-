# Map filter navigation and panels

## Layout and interaction

The existing primary map toolbar remains intact. The Filters trigger is icon-only. Opening it reveals a second, bordered navigation row directly below the Developers / Projects / Metrics / Show controls.

The row contains six separate filter cells. Each cell opens its own popover. Selected values are reflected in the cell label; the icon-only Filters trigger gains a small numeric count, and **Reset all** appears after any filter state changes.

- **Sale / Rent:** Any status, For sale, For rent, Sold out. Sold out remains a historical market status; it is not proof of a registered transfer.
- **Price:** List price and Monthly payment use separate tabs and independent bounds. The scale is 0 to the exact maximum from current eligible asking-price inventory in the active district, sector, cell or village. A 24-bin histogram shows listing frequency; bars are passive and the dragged range thumb shows its live amount. No transaction-benchmark or parcel-area calculation is treated as an asking price. When no permitted records are connected, the scale and histogram remain empty rather than inventing a maximum.
- **Property type:** Any, Houses, Townhouse, Multifamily, Condos, Land, Lots & Land, Apartment, Manufactured and Mixed Use. Each choice uses a Lucide icon.
- **Zoning:** The default view shows R1, R1A, R2, R3, R4, CA, C2 and C3, plus a separate Forestation choice. Less common codes remain under Other zoning. The catalogue is searchable; the applicable district plan remains authoritative. CA is a catalogue label and must be confirmed against the parcel's governing plan.
- **Measurement:** Plot area and Interior area are separate bases. Switching bases clears the previous numeric range so plot area cannot silently be reused as floor area. Quick search bands (0–300, 300–500, 500–700, 700–800 and 800+ m²) retain editable minimum/maximum inputs.
- **Beds / Baths:** Bedrooms appear above Bathrooms in one card. Both remain available for verified building, project-unit and property inventory. Exact match is unavailable until a threshold is chosen. Cadastral parcels themselves do not contain room counts.

Only one filter menu is open at a time. Escape closes the active dropdown first and the secondary row second. Clicking outside a dropdown closes it. Opening another primary toolbar menu closes the filter row.

## Zoning catalogue and rule accuracy

The filter catalogue is a union of codes found in the published City of Kigali, Bugesera and Gakenke plan legends, plus shorthand categories shown in the Ruhango District Land Use Plan map legend. It includes residential, commercial, agriculture/livestock, industrial/mining, public facilities, buffers, forests/ecology, transport/utilities, wetlands and water bodies.

This is a searchable catalogue, not a claim that every code applies in every district. In the official legends checked, A3 and A4 do not appear; the selector does not invent them. The District Land Use Plan applicable to the property is authoritative.

Official source references:
- National Land Authority Master Plans page: https://www.lands.rw/publications/master-plans
- Gakenke District Land Use Plan zoning legend: https://geodata.rw/server/rest/services/Hosted/Gakenke_DLUP_20042026/MapServer/legend
- Bugesera District Land Use Plan zoning layer: https://geodata.rw/server/rest/services/masterplan/Bugesera_DLUP/FeatureServer/0
- Kigali City Master Plan zoning legend: https://masterplan.kigalicity.gov.rw/server/rest/services/Masterplan2020/Masterplan2020_24June2024/MapServer/legend
- Ruhango District Land Use Plan, Official Gazette of 6 November 2026: https://www.minijust.gov.rw/fileadmin/user_upload/Minijust/Official_gazettes_2/____2026_Igazeti_ya_Leta/_UGUSHYINGO-November-Novembre/OG_n___Special_of_06.11.2026__RUHANGO__Imikoreshereze_n_imitunganyirize_by_ubutaka.pdf

Plot-size rules are not universal code-to-size bands. They vary with the district plan, residential typology, land use and permitted development. As one district-specific example, the 2026 Ruhango plan describes R1 villa/bungalow plots at 500 m² and R1A low-density densification plots at 300 m². These figures must not be copied to other districts. The information panel shows a plot standard only when the governing district plan has an indexed rule. Kigali's 2020 residential standards are limited to Gasabo, Kicukiro and Nyarugenge; those figures are not copied to other districts. The ordinary selected chip is the visual indication that a zone is active; no separate selected-zone summary card is shown.

The production map requests published zoning polygons for the current map bounds and matches cadastral parcel polygons against those zoning geometries by spatial intersection, rather than assigning a zone from the parcel bounding-box centre. Every cadastral polygon remains in the map source when a filter changes; matching parcels are highlighted and non-matches are dimmed, never deleted. This is a viewport-scoped pilot, not nationwide coverage. The connected zoning layers cover the published Kigali pilot extent and Bugesera extent; parcels outside those layers cannot be assumed to have a zoning match. Selected-parcel zoning lookup remains a separate exact-UPI workflow.

## Result-count and data boundary

Zoning and cadastral plot-area selections filter the loaded parcel polygons in the current map viewport. The map retains all parcel boundaries and highlights matches. Source-authorized market listing and unit filters query the REJA inventory endpoint; list-price and monthly-payment distributions are built from current permitted asking-price records, while room filters use verified property/unit fields. The production runtime still has no APP_DATABASE_URL configured, and the checked Neon foundation branch contains no listing, property or unit records. Therefore production currently returns an honest not-connected/empty state for listing prices, monthly payments, room counts and property markers. No synthetic inventory data is shown.

Required data connections:
- **Sale / rent / sold and price:** authorized first-party or source-observed listing records with current market status, currency, asking amount and rent period/payment frequency.
- **Histogram:** current source-authorized active sale listings and verified first-party published listings, separated by currency and list/monthly basis. Monthly values are computed from explicitly supplied finance terms and are not a lender offer.
- **Property type and beds/baths:** verified building/unit records with consistent typology, room-count values and coordinates where map markers are required.
- **Zoning:** expand district-plan layer coverage and index plan-specific plot standards (district, zone, typology and effective plan version) before displaying legal minimum/maximum plot sizes. Current viewport filtering uses actual polygon intersections but only where published zoning layers are connected.
- **Measurement:** preserve cadastral plot area, geometry-estimated area and building/unit interior area as separate fields and sources.

Do not present an empty or unavailable inventory source as zero supply. Parcel geometry, market listings, project records and unit records remain distinct data sources. A filter may affect only the layer and dataset for which it has verified fields.
