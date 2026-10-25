# Parcel price estimates from currently connected data

This pilot intentionally makes an indicative estimate from the data already connected, rather than waiting for property-by-property asking-price or completed-sale feeds that do not yet exist for much of the market.

## Price fallback order

For an individual parcel, the current system uses the following existing inputs:

1. A source-backed price attached to that exact parcel, if one is present with a recognized type and source.
2. The transaction-price-per-square-metre snapshot for its matching cell.
3. An indicative sector mean calculated from unambiguous cell snapshots in the same sector when that cell is missing or conflicting.
4. The district average transaction-price snapshot from the Rwanda Land Dashboard.

The fallback order only changes the input used for an **indicative estimate**. An area or district average is not claimed to be a verified asking price or the recorded sale price of the individual parcel.

## Parcel area

The preferred area is the parcel size value supplied by the connected cadastral layer. When that field is blank, the app estimates area from the connected parcel polygon geometry and marks it as an approximate geometry-derived area. When polygon area also cannot be calculated, the map still shows the available price per square metre as an **Indicative area price / m²**, rather than presenting that unit rate as the parcel's total value.

## What users see

- A compact map tag such as `500K` or `1M`.
- The selected parcel panel explains whether the total is an indicative estimate or a per-square-metre proxy.
- It names the available basis (cell, derived sector, or district snapshot) and the area basis (cadastral attribute or approximate mapped boundary).
- The separate district average reference price remains a comparison benchmark. It does not silently replace the average transaction-price input used for the indicative estimate.

## Future corrections

These are explicit, replaceable estimation rules. When property-specific asking prices, registered sale records or formal valuation sources become available and are connected, they can be shown as their own source-backed price types without changing today's map labels into a false claim about a completed sale.
