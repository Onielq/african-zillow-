# Parcel price labels and provenance

## Supported label types

| Type | Meaning | Evidence required before it is shown |
| --- | --- | --- |
| **Indicative estimate** | A calculated amount, such as parcel area multiplied by an available area-level average transaction price per m² | Show the calculation basis and call it an estimate |
| **Confirmed asking price** | The current amount requested by the seller or authorised agent | A source record for the specific property, a current price, and confirmation/source date |
| **Recorded sale price** | A price recorded for a completed transaction involving that property | A source that identifies the property and records a completed transaction and date |
| **Formal valuation** | A valuation issued by a qualified valuer or authorised valuation source | The valuation report/source, valuation date, and responsible valuer or institution |

The map pill remains short (for example `500K` or `1M`). Selecting the parcel reveals the price type, source and date, plus the calculation when the amount is estimated.

## What the current dataset supports

The connected cadastral parcel layer supplies parcel geometry and attributes such as parcel size, UPI and administrative area. The current land-price data is an area-level average transaction-price-per-square-metre snapshot, not an asking price or completed sale linked to an individual parcel.

Therefore, today's map can calculate an **indicative estimate** where parcel area and a usable unit-price snapshot are both available. It must not infer that the particular parcel sold for that amount. Confirmed asking prices, recorded parcel sale prices and formal valuations stay unavailable until a trustworthy property-specific source is connected and verified.

## Safety rules for new price feeds

- Do not publish a non-estimate price type without a named source and positive price value.
- Keep price type, source and source date attached to the specific parcel record rather than inferring them from its sector or district.
- Keep an indicative estimate marked as an estimate even if its unit-price input came from a transaction-price dataset.
- Never fill a missing asking/sale/valuation price by silently falling back to a district average. The existing district fallback is allowed only for the clearly labelled indicative estimate and should be stated in the calculation detail.
- A price label is not proof of parcel ownership, title validity, or current availability for sale.
