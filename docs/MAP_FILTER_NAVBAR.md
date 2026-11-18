# Map filter navigation and panels

## Layout and interaction

The existing primary map toolbar remains intact. The Filters trigger is icon-only. Opening it reveals a second, bordered navigation row directly below the Developers / Projects / Metrics / Show controls.

The row contains six separate filter cells. Each cell opens its own popover. Selected values are reflected in the cell label; the icon-only Filters trigger gains a small numeric count, and **Reset all** appears after any filter state changes.

- **Sale / Rent:** Any status, For sale, For rent, Sold out. Sold out remains a historical market status; it is not proof of a registered transfer.
- **Price:** List price and Monthly payment are visible side by side. Each has its own dual-handle minimum/maximum slider and editable numeric bounds. The two ranges are independent; setting or clearing one does not change the other. RWF/USD selection applies to both, with limits of RWF 0–1 trillion and USD 0–100 million. Both price-distribution panels remain honest empty states until verified observations exist.
- **Property type:** Any, Houses, Townhouse, Multifamily, Condos, Land, Lots & Land, Apartment, Manufactured and Mixed Use. Each choice uses a Lucide icon.
- **Zoning:** Searchable, grouped codes; All zoning; an information panel; selected-code descriptions; and links to the official plan sources.
- **Measurement:** Plot area and Interior area are separate bases. Switching bases clears the previous numeric range so plot area cannot silently be reused as floor area. Quick search bands (0–300, 300–500, 500–700, 700–800 and 800+ m²) retain editable minimum/maximum inputs.
- **Beds / Baths:** Separate bedroom and bathroom groups, minimum counts, and independent exact-match toggles. Exact match is unavailable until a bedroom/bathroom threshold is chosen. Selecting a land-only property type switches the measurement basis to plot area and clears room filters.

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

Plot-size rules are not universal code-to-size bands. They vary with the district plan, residential typology, land use and permitted development. As one district-specific example, the 2026 Ruhango plan describes R1 villa/bungalow plots at 500 m² and R1A low-density densification plots at 300 m². These figures must not be copied to other districts. The selected-zone summary therefore shows the code meaning and states that the typical plot standard is district-plan and housing-type specific until a rule set is indexed for the selected district.

The production map currently has no nationwide parcel-to-zoning filter index. The selected-parcel zoning API supports Gasabo, Kicukiro, Nyarugenge and Bugesera; this is not the same as a parcel-wide spatial search index.

## Result-count and data boundary

The controls keep their selections in component state, but they do not yet filter live map/listing results. Result counts and price histograms remain disabled/empty rather than showing synthetic market data.

Production does not currently have a configured read-only market database connection, and the separate Neon foundation branch checked for schema validation contains no property, listing, unit or parcel records. It is not a production inventory source.

Required data connections:
- **Sale / rent / sold and price:** authorized first-party or source-observed listing records with current market status, currency, asking amount and rent period/payment frequency.
- **Histogram:** sufficient verified list-price/monthly-payment observations, separated by currency and price basis.
- **Property type and beds/baths:** verified building/unit records with consistent typology and room-count values.
- **Zoning:** district-aware parcel-wide spatial joins against applicable district-plan layers. Selected-parcel zoning alone is not a filter index.
- **Measurement:** preserve cadastral plot area, geometry-estimated area and building/unit interior area as separate fields and sources.

Do not present a selected filter as applied to map results until its matching data source is connected and tested.
