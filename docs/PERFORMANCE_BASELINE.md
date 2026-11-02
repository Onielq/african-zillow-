# Taiseel performance baseline

## Implemented in this pass

- Cell parcel inventory uses paginated retrieval. The first request returns 100 records; the API accepts pages up to 250 and reports total count plus continuation state.
- Parcel inventory requests only the fields used in the cell panel. Each page fetches one bounded group of geometries rather than downloading the full cell in serial batches.
- Dense map tiles that reach the GIS provider transfer limit request matching object IDs and retrieve parcel geometries in bounded concurrent batches. The viewport safety ceiling is 1,600 geometries and the response exposes when it is reached.
- Developer and project rows show source-backed logos or photos where available. A project with no image can use its developer brand mark; otherwise it gets initials. No stock photo is represented as a project.
- Remote brand images pass through a host-allowlisted Cloudflare image transformation endpoint. It requests AVIF or WebP based on browser support, resizes thumbnails and caches responses.
- Images use lazy loading and asynchronous decoding. Brand images and cell parcel lists have skeleton states.
- Project and developer search is debounced by 180 milliseconds. Long client-side directories initially render 24 records and expose a load-more action.
- Cell parcel responses expose server timing for request inspection.

## Already provided by the current architecture

- Cloudflare Workers execute application requests at the edge. Static assets use the Cloudflare static-assets binding and are delivered through the Cloudflare network.
- The application already binds the Vinext data cache to Cloudflare KV. Adding Redis now would introduce another service without a demonstrated cache-miss or persistence requirement.
- The map already caches viewport geography, skips duplicate in-flight viewport refreshes, aborts stale requests, debounces map movement and retries transient GIS failures.
- Brotli/Gzip delivery is handled at the Cloudflare zone level. The application should not manually double-compress responses.

## Not applicable or not configured

- There is no application SQL database or ORM query path in this repository. SQL indexing, SQL connection pooling and database N+1 fixes do not apply to the current GIS API integration.
- There is no existing recurring ingestion or long-running task that needs a background job queue.
- There is no AI response endpoint in this application to convert to token streaming.
- There is no configured OpenTelemetry collector/exporter or real-user monitoring destination. Server timing is available, but end-to-end tracing and RUM are not claimed as active.
- The application is edge deployed and has no database region to co-locate with its Worker.
- The root layout does not load external analytics/chat scripts. UI typography uses a system font fallback; no font files are fetched from a third party.

## Verification still required after deployment

Image transformation and compression headers must be inspected on the deployed Worker. The image endpoint returns an X-Image-Optimization header indicating whether Cloudflare transformed an image or served the original as a fallback. The parcel-source diagnostic checks the example Kigali UPI against three published layers and reports each layer separately.
