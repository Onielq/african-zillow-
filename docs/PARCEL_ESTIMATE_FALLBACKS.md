# Parcel asking price from the connected transaction-price data

## Product pricing rule

For a mapped parcel, the asking price is calculated as:

**Asking price = parcel area (m²) × average transaction price per m²**

The input is the best available value already connected to the map. This calculation is the product's asking-price rule for the pilot; it does not wait for a separate seller-by-seller asking-price feed.

## Price-per-square-metre fallback order

1. The average transaction-price snapshot for the matching cell.
2. An indicative sector mean calculated from the available unambiguous cell snapshots in that same sector when the cell value is missing or conflicting.
3. The district average transaction-price snapshot from the Rwanda Land Dashboard when the finer-level values are unavailable.

The selected parcel details name the available price basis. The separate district average reference price remains a comparison benchmark; it does not replace the average transaction-price input.

## Parcel area

The preferred area is the parcel size value supplied by the connected cadastral layer. When that field is blank, the app calculates approximate area from the connected parcel polygon and marks it as approximate. If the polygon cannot produce an area either, the map shows the available average transaction price per m² rather than hiding the available price signal or mislabelling a unit rate as a total parcel price.

## Example

For a parcel of **546 m²** using **49,757 RWF/m²**, the system calculates an asking price of **27,167,322 RWF**. On the map, that total is shown in compact form, such as `27.2M`; the parcel details show the area, rate, calculation, and whether the rate came from the matching cell, sector fallback, or district fallback.

## Future corrections

The fallback and pricing rules are deliberately explicit and can be adjusted when stronger or more precise source data becomes available. For the current pilot, the calculation uses the connected data rather than suppressing parcel prices while waiting for future feeds.
