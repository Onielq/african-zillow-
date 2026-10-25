# Rwanda Land Dashboard price reconciliation

**Review date:** 24 October 2026  
**Application:** Rwanda Land Intelligence Map  
**Pilot geography:** Gasabo, Kicukiro, Nyarugenge and Bugesera

## Executive finding

The dashboard pages identify the right source family, but the visible material does **not** establish a reliable effective date or a complete price-calculation method. The raw 244-row file supplied to the project owner remains an audit input, not a production market-price feed.

The raw file has **242 structurally valid rows, 2 malformed rows, and 10 location keys with conflicting values** when grouped by province/district/sector/cell. Several of the same repeated geographic keys also appear in the public page output for `/prices`. That means the problem is not safely fixed by editing the downloaded copy or simply selecting one row.

## What each official page supports

| Official page | What the visible source supports | What it does not settle |
| --- | --- | --- |
| [Overview](https://rwandalanddashboard.lands.rw/) | National parcel totals, ownership summaries, transaction trends, selected monthly transaction counts, transaction-derived land price by existing land use and a transaction map. | These are separate indicator families. The visible page text does not establish an as-of date for each headline. A parcel count is not current sale supply. |
| [Land transaction prices](https://rwandalanddashboard.lands.rw/prices) | An **Average Land Price per District** table, a yearly trend section, and a **Land Value Details by Region** table labelled with a weighted average in RWF/m². | The visible page text does not publish an effective/observation date, a weighting formula, a row-level data identifier or a downloadable schema. The indexed detailed table repeats some province/district/sector/cell keys with different values. |
| [Land reference prices](https://rwandalanddashboard.lands.rw/reference) | Separate **urban** and **rural** reference-price sections; a regional detail table with Province, District, Sector, Cell, **Village**, Minimum, Weighted average and Maximum in RWF/m²; and a separate comparison table for average transaction price versus average reference price. | The visible text does not reveal the effective date, exact weighting basis, source row identifiers, or a full machine-readable data contract. Do not confuse a reference/benchmark price with a price observed in a transaction. |
| [Transactions](https://rwandalanddashboard.lands.rw/transactions) | A dedicated transaction-analysis page. The overview also labels transaction-derived price by existing land use. | The page text alone does not prove the update date or entitlement to copy/download its underlying records. |
| [Official transaction-volume dataset metadata](https://data.gov.rw/datasets/3cee397e-8da0-418f-a382-b97feffba7ed) | The named dataset reports transaction counts by transaction type, year and administrative geography. Metadata says it is summary data from LAIS, updated daily for sharing, and records a last-update time of **20 October 2026, 12:08:17**. It is not individual parcel-title data. | The page says redistribution requires permission. A public page is not blanket permission to ingest, cache or redistribute data in a commercial product. Its update time is metadata update time, not necessarily an observation date for each row. |
| [Ownership](https://rwandalanddashboard.lands.rw/ownership) | Ownership indicators by gender, tenure type, age group, restrictions, owner type, size and existing land use. | These are ownership/registered-parcel statistics, not current asking listings, rents, land prices or freely available plots. |
| [Land use](https://rwandalanddashboard.lands.rw/land-use) | Existing and planned land-use area, land-use categories and parcel counts by existing use. | Planned zoning/land use must not be equated with available market supply or an approved/ready-to-sell plot. |

## District-price cross-check

The indexed public output for `/prices` lists the following values. They are recorded in `public/land-price-district-snapshot.tsv` as a page snapshot; the page does not disclose the price observation date.

| District | `/prices` page value (RWF/m²) |
| --- | ---: |
| Kicukiro | 61,499 |
| Nyarugenge | 50,771 |
| Gasabo | 36,103 |
| Bugesera | 4,038 |

The separate comparison table on `/reference` labels its values **Avg Transaction Price** and shows Kicukiro 61,499, Nyarugenge **50,865**, Gasabo 36,103 and Bugesera 4,038. The Nyarugenge figure differs by **94 RWF/m²** between the two page outputs. The visible pages do not explain whether this difference comes from differing aggregation, timing or definitions. Do not silently substitute one figure for the other; retain the `/prices` value for the district-price display only with the source/date caveat and track this difference for verification.

The observation date of these values is **not confirmed**. The date in the snapshot file records when this review was made, not when the underlying land transactions or reference-price assumptions were measured.

## Duplicate-key and malformed-row audit

The original source file is preserved at `public/land-price-reference.tsv`. The row-by-row audit is in `public/land-price-reconciliation.tsv`.

Ten distinct province/district/sector/cell keys have conflicting prices. Examples include:

- Bugesera / Mayange / Kibenga: 6,566 and 10,980 RWF/m².
- Kicukiro / Gahanga / Kagasa: 22,236 and 92,377 RWF/m² in the supplied file; the indexed `/prices` table shows 22,238 and 92,377.
- Nyarugenge / Kigali / Nyabugogo: 31,394 and 40,517 RWF/m² in the supplied file; the indexed `/prices` table shows 31,405 and 40,517.
- Nyarugenge / Mageregere / Mataba: 10,142 and 78,878 RWF/m² in the supplied file; the indexed `/prices` table shows 10,140 and 78,878.

The two malformed rows are retained rather than guessed into corrected values:
- Source row 61 has four columns where five are expected; a separator may be missing between “Ruhuha” and “Gatanga”, but this has not been silently repaired.
- Source row 74 has four columns and lacks the province field as represented in the raw file; it needs the original record to confirm the complete row.

The `/prices` output also contains several of the same repeated keys. This suggests that the row identity may require a field not exposed in that table or a clarification from the data publisher. The `/reference` page includes a village field, but without a complete export or stable source IDs, the team cannot prove that village alone explains each pair. **Do not choose the higher value, lower value, mean, most recent row or first row as a workaround.**

## Current product treatment

- District price values are shown as a **provisional dashboard snapshot** with an undisclosed effective date. They are not advertised as current asking prices, achieved price for an individual plot or a legal reference/valuation price.
- The supplied cell-price table remains visible for audit and diagnostics, but a unique row from that unversioned file is described as an **unreconciled supplied snapshot**, not a verified current cell price.
- Cells with conflicting values do not show a numeric price.
- No average is computed from duplicate values, and no cell/sector/village price is inferred from district averages.
- The app does not use ownership totals as active supply; planned land use as sellable inventory; or transaction summaries as per-parcel title records.
- Source observation date, retrieval/review date, definition, geography level, unit and source URL remain separate metadata fields.

## Valuation implementation update — 25 October 2026

The parcel-value estimate now uses **average transaction price per m²** as its primary rate and displays average reference price as a separate district benchmark. The reference-price rate is not used to calculate the headline estimate.

- For a parcel, use an unambiguous cell-level weighted-average transaction-price snapshot where one is available.
- If the cell value is absent or has conflicting values, use the district's explicitly labelled **Avg Transaction Price** from the `/reference` comparison table and label the result as a rough district-based estimate.
- Show the district **Avg Reference Price** separately, including an area × reference-price benchmark for comparison only.
- Do not average transaction and reference prices together, and do not silently average duplicate cell rows.
- The app now reads `public/land-price-transaction.tsv`; `public/land-price-reference.tsv` remains unchanged as the original supplied audit file. The transaction-labelled file preserves the same 244 data rows. Its row identity, observation date and weighting method remain provisional and need confirmation from the publisher.

The district transaction/reference benchmarks currently shown by the `/reference` comparison table are: Gasabo 36,103 / 19,976; Kicukiro 61,499 / 27,914; Nyarugenge 50,865 / 28,077; Bugesera 4,038 / 1,145 RWF/m². The separate `/prices` table reports Nyarugenge at 50,771 RWF/m², so the app uses the explicitly labelled `/reference` **Avg Transaction Price** of 50,865 and continues to flag the 94 RWF/m² discrepancy. The observation date and calculation method remain undisclosed; this choice is a clear source-label rule, not a claim that the two page outputs have been reconciled.

## Next evidence required from the source owner

1. A complete downloadable export or supported API for the `/prices` and `/reference` tables, including row IDs and all geographic/classification fields.
2. An explicit observation/effective date (or refresh cadence) for each price series, separately from the website's page or metadata update time.
3. The methodology for “weighted average”, minimum and maximum: what the weights represent, what data population is included, and whether prices come from recorded transactions, approved reference prices or a combination.
4. A documented explanation of repeated keys, sector-name variants (including Mageragere/Mageregere) and malformed rows, so the rows can be reconciled by identifiers rather than guessed names.
5. Confirmed commercial use, download, caching, attribution and redistribution permission for each data series.

Until those items are confirmed, the existing data should remain a qualified research snapshot rather than production-grade land-market intelligence.
