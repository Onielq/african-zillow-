# Taiseel Architecture and Data Flow

## Runtime overview

The application is a MapLibre-based Next.js interface. The same repository has two production deployment paths: Vercel and a Cloudflare Worker using the Vinext build. They are separate deployments of the same source revision. The Cloudflare parcel API also has a guarded server-to-server failover to the Vercel production parcel API when every primary parcel GIS provider fails inside the Worker runtime; the Vercel API does not use that failover, so the request cannot loop.

~~~mermaid
flowchart TD
  GH[GitHub main] --> V[Vercel production build]
  GH --> GA[GitHub Actions]
  GA --> CF[Cloudflare Worker build and deploy]
  V --> UI[MapLibre web application]
  CF --> UI
  UI --> API[Geography and parcel API routes]
  API --> GEO[Official geography and cadastral services]
  API -- "Worker only, when all primary providers fail" --> VP[Vercel production parcel API]
  VP --> GEO
  UI --> REF[Price snapshots and benchmark modules]
  UI --> ACCESS[Nearby access API]
  ACCESS --> OSM[OpenStreetMap Overpass amenities]
  ACCESS --> VAL[Valhalla road routing]
~~~

Vercel and Cloudflare each serve a deployed application and remain independently buildable. If every primary parcel query fails inside Cloudflare, the Worker makes one bounded server-to-server request to the Vercel production parcel API and accepts only GeoJSON features marked as cadastral parcels with a UPI. The Vercel route does not use this fallback, preventing recursion. The response records the fallback source and primary-provider warning. If the fallback fails validation or times out, the Worker returns its explicit 502 rather than inventing parcel outlines.

## Parcel evidence path

~~~mermaid
flowchart TD
  SELECT[User selects mapped parcel] --> GEOM[Published cadastral geometry]
  SELECT --> DETAIL[Parcel detail panel]
  GEOM --> ID[UPI and parcel attributes when supplied]
  DETAIL --> ZONE[Geometry-based zoning lookup]
  DETAIL --> PRICE[Published price or calculated reference]
  PRICE --> BASIS[Label source, calculation and area basis]
  DETAIL --> ACCESS[Nearby place discovery and road route]
  ID --> NOTE[Show data-quality caveats]
  ZONE --> NOTE
  BASIS --> NOTE
  ACCESS --> NOTE
~~~

## Source roles and limitations

| Data path | Purpose | Important limitation |
|---|---|---|
| Kigali City Master Plan services | Kigali administrative and parcel geometry, plus relevant planning layers | Geometry does not verify title or ownership |
| Geodata Rwanda Bugesera masterplan services | Bugesera administrative/planning context | Individual parcel coverage and reuse permissions require separate verification |
| NLA-hosted LAIS Bugesera parcel service | Bugesera parcel records and attributes | Public access does not establish reuse permission, completeness, or current survey accuracy |
| Zoning feature services | Intersect parcel geometry with published planning areas | A zoning intersection is not proof of legal build permission or title |
| Transaction-price TSV and benchmark modules | Area-level price references | Reference snapshots are not automatically a parcel asking price or a live market feed |
| OpenStreetMap Overpass | Nearby school, health, and transport candidates | Amenity coverage can be incomplete |
| Valhalla | Estimated road distances and times | Not live traffic; omit route metrics if no usable route is returned |
| Resend | Optional contact email delivery | Only active when valid runtime sender, recipient, and API-key settings are configured |

## Data integrity rules

- Never replace missing parcel outlines with guessed boundaries from roads, imagery, or zoning.
- Keep source geometry, listing/asking-price data, transaction references, and calculated estimates distinct.
- Show the source and its caveats near the value that depends on it.
- A source record count is not evidence that the geographic coverage is complete.
- Keep provider credentials in secret stores; never hard-code secrets or place them in browser-visible variables unless they are explicitly designed to be public.
- Keep the Vercel and Cloudflare deploy workflows independently verifiable.
