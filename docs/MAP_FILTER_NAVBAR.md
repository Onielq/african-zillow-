# Map filter navigation and panels

## Layout

The existing map toolbar remains unchanged. The Filters trigger is icon-only. Opening it reveals a second row directly below the Developers / Projects / Metrics / Show controls.

The row is built as six distinct, bordered filter cells. Each opens its own polished popover:

- **Sale / Rent:** Any status, For sale, For rent, Sold out.
- **Price:** List price and Monthly payment tabs; currency selection; price-distribution chart area; range sliders; and editable minimum/maximum values. Bounds are RWF 0–1 trillion and USD 0–100 million.
- **Property type:** Any, Houses, Townhouse, Multifamily, Condos, Land, Lots & Land, Apartment, Manufactured and Mixed Use. Categories use Lucide icons.
- **Zoning:** Grouped codes from published Kigali, Bugesera and Gakenke plan legends, with All zoning and an information panel.
- **Measurement:** Search presets (0–300, 300–500, 500–700, 700–800 and 800+ m²) plus editable minimum/maximum fields.
- **Beds / Baths:** Separate bedroom and bathroom sections, minimum values, and independent exact-match toggles. They are disabled for land-only selections.

Only one filter menu is open at a time. Escape closes the active dropdown first and the secondary row second. Clicking outside a dropdown closes it. Opening another primary toolbar menu closes the filter row.

## Zoning catalogue and accuracy boundary

The code list is a union of codes found in published plan legends. It is not a national rulebook and does not mean every code applies in every district. District Land Use Plans define the local zoning and allowed uses. The connected parcel-zoning API currently supports selected parcels in Gasabo, Kicukiro, Nyarugenge and Bugesera; it does not provide a nationwide parcel index.

The selected-zone panel therefore identifies that the current Edition 2 plot-size rule is not loaded. Do not treat the measurement presets as legal plot standards. The presets are search bands only. The legal standard can vary with district plan, housing typology and building use. A verified Edition 2 zoning-rule dataset is required before displaying official minimum or maximum plot sizes.

## Result-count and data boundary

The UI is interactive and keeps selections in component state. It does not yet filter the map or provide a live matched-result count.

The result button remains disabled while the matching inventory is unavailable. This is intentional: the project directory is a research register, not a unit-level listing feed, and it does not contain reliable sale/rent/sold status, list price, monthly payment, bedroom or bathroom records. Do not infer an inventory count from project rows or seeded examples.

Required data connections:

- **Sale / rent / sold and price:** authorized first-party or source-observed listing records with current market status, currency, list price and monthly payment.
- **Histogram:** enough verified list-price/payment observations to build a distribution. Do not display synthetic bars as market evidence.
- **Property type and beds/baths:** verified building and unit inventory, with consistent typology and room-count fields.
- **Zoning:** parcel-wide spatial joins against the applicable district-plan layer. Selected-parcel zoning alone is not a filter index.
- **Measurement:** preserve the difference between cadastral plot area, geometry-estimated area and building floor area. Never compare them as if they were the same attribute.

Do not represent a selected filter as applied to map results until its matching data layer is connected and tested.
