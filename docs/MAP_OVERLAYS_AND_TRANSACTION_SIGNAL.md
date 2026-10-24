# Map overlays, price shading, cell parcel inventory and transaction activity

## Show menu

The Show picker fetches one OpenStreetMap discovery layer at a time through a server-side Overpass proxy: landmarks, medical facilities, schools, roads/bus stops and stations, or parks/nature/lakes/waterfalls. Requests are restricted to the active pilot scope: Gasabo, Kicukiro and Nyarugenge for Kigali; Bugesera for that focus; or the combined four-district pilot. The scope limits are service/viewport extents, not legally certified administrative boundaries.

OpenStreetMap coverage and tags can be missing or outdated. These features are discovery references, not official facility registers. Overpass can rate-limit requests or be unavailable; the UI then falls back to no displayed extra overlay without changing cadastral/admin data. Attribution: © OpenStreetMap contributors.

## Hierarchy and price colors

District, sector and cell polygons retain hover highlighting and click selection. The visible administrative outline follows the active zoom hierarchy: district outline at district scale, sector outline when sectors become active, and cell outline when cells become active, rather than stacking parent boundaries over child polygons.

When the land-price metric is active, polygon fill colors range from green/cyan for lower values through yellow/amber/orange to red/dark burgundy for higher values. District numbers are still provisional snapshots. Cell values join only by normalized district + sector + cell labels from `public/land-price-reference.tsv`. If a key maps to more than one distinct value, the map does not assign a number or price color to that cell.

Sector shading is the rounded arithmetic mean of unambiguous cell values in the supplied file. It is an **indicative unweighted mean**, not an official sector-weighted price; it excludes conflicting cells and malformed rows, and uneven source coverage can bias the result. The effective date and calculation methodology have not been confirmed by the publisher. The raw TSV remains unchanged.

## Parcel inventory by cell

Selecting a cell requests parcel polygons from the connected Kigali or Bugesera cadastral service inside the cell extent, with district, sector and cell labels applied as an exact follow-up filter. The request asks only for identifiers, administrative labels, source area, wetland overlap and source update date; it does not request owner names or ownership attributes. Results paginate to a 10,000-record safety cap; the interface warns if it may be incomplete.

Selecting a row centers the map on the returned parcel polygon and opens its identification panel. This is not proof of current title, boundary survey accuracy, completeness, or unrestricted reuse rights. Continue to verify legal title and status with the competent authority.

## Transaction volume

The application records the Bugesera value 4,350 as a user-provided dashboard observation dated 24 October 2026; it is not a live or independently verified feed. The publicly indexed dashboard snapshot returned a different value, so the number must be refreshed against the publisher before analytical reliance. Other pilot district values are not fabricated.

The Rwanda Land Dashboard groups multiple transaction types, not only voluntary sales. Volume therefore measures registration activity, not sale-only demand or price appreciation. Monthly district totals are not distributed down to sector or cell levels without a publisher-backed geographic aggregation.
