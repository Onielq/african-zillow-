# Zillow pattern adaptation for Taiseel

## Purpose

Use proven real-estate product patterns without copying Zillow's brand, importing unrelated infrastructure, or weakening Taiseel's evidence rules. Taiseel remains a Rwanda-first land and development intelligence product. The map and cadastral evidence remain separate from project listings, asking prices, zoning, and market estimates.

## Patterns reviewed

| Zillow repository | Useful pattern | Taiseel decision |
|---|---|---|
| [react-fuzzy-search](https://github.com/zillow/react-fuzzy-search) | Search several fields and rank relevant matches instead of relying on one exact substring | Adopted as a small local search function. No old package or new runtime dependency is added. |
| [schema-dot-org-markup](https://github.com/zillow/schema-dot-org-markup) | Treat property facts as structured, typed data that can support consistent UI and metadata | Adopt the separation principle. A full public structured-data layer is deferred until project facts and page types are normalized enough to avoid publishing misleading metadata. |
| [fair-housing-guardrail](https://github.com/zillow/fair-housing-guardrail) and [compliant-real-estate-chatbot](https://github.com/zillow/compliant-real-estate-chatbot) | Review real-estate language for steering, unsupported claims, and discriminatory assumptions | Adopt a neutral editorial rule for area and property descriptions. Their US legal categories are not treated as Rwandan law. |
| [luminaire](https://github.com/zillow/luminaire) | Monitor time-series data for drift and unusual changes | Deferred until Taiseel has reliable dated price observations with stable definitions and adequate history. Static asking-price examples are not a time series. |
| [zind](https://github.com/zillow/zind) | Structured indoor panoramas and floor-plan research data | Not adopted: the dataset is not a source for Rwanda project inventory or floor plans. |

## System design

Keep the flow explicit:

`source records → normalized project facts → sourced or calculated measures → search and report presentation`

- The source record stores the project ID, project identity, developer, address hierarchy, project scale, dates, coordinates, image and source references.
- Derived measures must retain their inputs, unit, calculation, observation date and source. A displayed value must not lose its evidence trail.
- Search works over multiple register fields and returns the original records; it does not create or infer project facts.
- Reports share one five-page sequence and a common stylesheet. Project-specific evidence and product type remain separate.
- Cadastral parcels, administrative areas, development projects, listings and market-price references remain different data entities.

## Search behavior

The project directory now searches project name, internal ID, parcel UPI, developer, district, sector, cell, city, category, owner, status and route. Name matches rank ahead of incidental metadata matches. A limited edit-distance allowance catches likely typing errors; short words still require an exact match. Every query token must match at least one field, which prevents a strong name match from hiding a contradictory location term.

The implementation uses Taiseel's existing TypeScript/JavaScript runtime and does not add a fuzzy-search dependency.

## Report language

- Attribute claims: developer-reported, source-reported, independently verified, calculated, estimated, not published, or not verified.
- State currency, area basis, rent period, observation date and source for every comparable price.
- Never compare monthly rent with sale price or transaction price as though they share a unit.
- Use residential terms such as homes, apartments and bedrooms only for residential products. Use space, suite, floor area, office and retail for commercial products.
- Describe amenities through neutral facts: name, type, distance, travel method and source. Avoid claims about whether an area or its residents are safe, desirable, family-friendly, or socially suitable.
- Attribute subjective words such as “premium” or “prime” to the party making the claim. Do not present marketing language as independent evidence.

## Deliberately not adopted

No Zillow logo, visual identity, private source, proprietary model, Zillow API, scraping workflow, foreign market data, or unrelated runtime dependency has been copied into Taiseel.
