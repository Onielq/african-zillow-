# Map filter navigation

## Layout

The Filters trigger on the existing map toolbar is icon-only. Opening it reveals one horizontal secondary row directly below the Developer / Projects / Metrics / Show toolbar.

Each filter has its own trigger and dropdown:

- Sale / Rent: Any, For sale, For rent.
- Price: minimum, maximum and currency.
- Property type: land, apartment, house/villa, commercial, industrial and mixed-use.
- Zoning: R1, R1A, R2, R3, R4, C, A, mixed-use and industrial.
- Measurement: minimum and maximum area in square metres.
- Beds / Baths: minimum bedrooms and minimum bathrooms.

Only one dropdown is open at a time. Escape closes the active dropdown first and the secondary row second. Clicking outside a dropdown closes it. The main toolbar's other menus close the filter row.

## Current implementation boundary

This is the first UI skeleton. Dropdowns open, accept selections and retain the selected values while the map component remains mounted. It does not yet filter the map or listing results.

The data connections are intentionally separate:

- Sale/rent and price need an authorized listing feed. The map's estimated land value is not a listing asking price.
- Property type and bed/bath need verified building and unit inventory.
- Zoning needs parcel-wide spatial joins. The current map can show zoning overlays and fetch zoning for a selected parcel, but that does not provide a complete parcel-wide filter index.
- Measurement can later use the cadastral plot-area attribute or geometry-derived estimate, preserving the source and area basis. Building floor area must remain separate from plot area.

Do not represent a selected filter as applied to map results until its matching data layer is connected and tested.
