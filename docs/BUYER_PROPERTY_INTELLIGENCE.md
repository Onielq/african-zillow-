# Buyer Property Intelligence

## Product promise

A buyer starts with either a parcel's Unique Parcel Identifier (UPI) or a property listing. Taiseel resolves the property identity where the evidence permits, then brings the available land, development and market evidence into one connected property profile.

The profile is a decision-support view. It is not a title certificate, development permit, legal opinion, valuation, or guarantee that a property is available.

The Singapore, Dubai and United States references describe the role each intelligence layer should play. They are design analogies, not claims that Rwanda's institutions, laws or datasets are identical to those markets.

## The three intelligence layers

### 01 — Land Intelligence

**Question: is this the correct parcel, and what do the land records and planning layers say about it?**

The layer brings together:
- the exact UPI and the source record that supplied it;
- mapped cadastral boundaries, kept separate from administrative boundaries;
- registered or mapped area, with cadastral and geometry-estimated area labelled differently;
- zoning and land-use designations intersecting the parcel;
- mapped planning constraints, such as wetland overlap, where the source actually supplies them.

A mapped parcel does not prove legal ownership, title, tenure, encumbrances, physical access, buildability or current survey accuracy. A zoning intersection is not itself a building permit. Where a source is missing, contradictory, stale or outside its published coverage, the profile must say so.

### 02 — Development and Regulatory Intelligence

**Question: what development or regulatory context is actually evidenced for this land?**

The layer brings together, when authoritative records are connected:
- projects linked to the parcel;
- developer and project identity;
- project registration where registration is required;
- planning, construction and other relevant approvals;
- applicable development restrictions and recorded compliance evidence;
- source-dated construction or delivery milestones.

A project-directory entry is not proof of project registration, planning approval, construction approval, escrow compliance or regulatory compliance. The system may describe a sourced project record, but it must not call a project approved or registered unless the relevant authority record supports that exact claim.

A missing project link does not prove that no development affects the parcel.

### 03 — Marketplace and Market Intelligence

**Question: who is advertising the property, what alternatives exist, and what transaction evidence supports the market view?**

The layer brings together, when permitted sources are connected:
- advertiser, agent or agency identity;
- active property listings, with source, observation date and reported status;
- asking prices, currency, rental period and property-area basis;
- comparable listings with enough consistent attributes to justify comparison;
- reliable completed-transaction evidence, distinct from asking prices and area-level benchmarks;
- neighbourhood context and market indicators with a disclosed method and observation period.

An advertisement is not a completed transaction. A source-reported status is not an independently verified sale. A district or cell price benchmark is not a parcel-specific comparable or valuation. Listings may be displayed only when source permissions allow the intended use, including commercial display, caching and redistribution where applicable.

## One identity, separate evidence

The UPI is the canonical parcel identity. It does not replace a listing's own source identifier.

There are two entry paths:

1. **UPI entry:** resolve the exact UPI against the cadastral sources available for the selected geography, then open the parcel profile.
2. **Listing entry:** resolve the source and listing identifier first. Attach the listing to a parcel only when an explicit, independently checked listing-to-UPI relationship exists.

Do not link a listing to a parcel using nearest coordinates, matching place names, a shared neighbourhood, or visual proximity alone. If a relationship is pending, conflicting or unverified, keep the listing and parcel as separate records and show the relationship state. Never silently merge them.

A connected profile is composed from separate source records. Each displayed fact should retain, where available:
- source organisation and dataset or register;
- source record ID and the UPI or listing ID it describes;
- observation, publication or last-updated date;
- source URL and attribution requirements;
- reuse permission status;
- evidence state and known limitations.

The absence of a record means **not found in the connected sources**, not that the real-world feature or event does not exist.

## Buyer-facing profile contract

Keep the order stable on every parcel profile:

| Section | Buyer should see | Required honesty check |
|---|---|---|
| Land Intelligence | UPI, boundary, area, zoning and mapped constraints | Distinguish cadastral attributes from geometry estimates; disclose title and source limitations |
| Development and Regulatory Intelligence | Linked project, developer, registration, approvals and restrictions | Separate a project record from authority-issued registration or approval evidence |
| Marketplace and Market Intelligence | Advertiser, listing status, asking price, comparables and completed transactions | Separate source-reported listings, asking prices, benchmarks and completed transactions |

Each section must support explicit states such as **source record found**, **estimated**, **not connected**, **not covered**, **conflicting**, and **source unavailable**. Do not use a single green “verified” badge for the whole profile. Evidence is assessed fact by fact and source by source.

The profile should not hide an incomplete layer. A buyer should be able to see which parts are supported and which still need independent checking.

## Current implementation boundary

As of the current canonical application:
- **Land:** the map resolves published cadastral parcel records and UPIs for the connected pilot geographies. Area, zoning and constraint evidence varies by source and geography. Ownership and title verification are not provided by the map.
- **Development:** the application has a sourced Rwanda project directory. A subset of projects can be matched to parcels by exact UPI. This directory is not an authoritative development-registration or approvals register.
- **Market:** the application has market-data adapters and area-level price references, but production listing feeds, parcel-linked comparables and parcel-specific completed-transaction history are not connected as a complete live service. A calculated parcel amount must remain labelled as an estimate, not an advertised price.

The buyer-profile UI must reflect these boundaries. Do not seed sample records or invent approvals, advertiser names, comparable listings, transaction values, availability or source dates to make the three sections appear complete.

## Acceptance criteria

- A full UPI search opens the exact mapped parcel where the source returns an unambiguous match.
- A listing can enter the same profile only through an explicit verified listing-to-UPI relationship; unlinked listings remain separate.
- One parcel profile displays the three layers in the same order.
- Every layer reports its own evidence state and source context.
- Missing, conflicting, stale or unavailable data remains visible as such; it is never converted to zero, “none”, “approved”, “sold” or “not affected”.
- Asking prices, calculated estimates, transaction-price benchmarks, recorded-sale evidence and formal valuations remain distinct.
- The UI explains that mapped information is not proof of ownership or permission to build.
- The profile remains usable on mobile and by keyboard, without hiding the map or clipping the UPI and source details.
