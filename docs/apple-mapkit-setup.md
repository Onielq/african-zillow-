# Apple Maps setup

The map workspace supports Apple Maps Hybrid and Satellite through Apple's official MapKit JS API. The existing MapLibre layer remains on top of Apple imagery and continues to own the Rwanda bounds, district/sector/cell/village/parcel zoom levels, feature hover, parcel clicks, metrics, search-driven navigation, zoning, and Show overlays.

## Required token

Apple Maps will remain unavailable until a Maps token is configured. The UI leaves the existing Map and Satellite views enabled and shows this requirement rather than displaying fake Apple imagery.

1. In the Apple Developer account, open **Certificates, Identifiers & Profiles → Services → Maps**.
2. Create a Maps token with the **MapKit JS** token type and restrict it to the domains where the app will run. Apple requires an authorized Maps token to initialize MapKit JS: https://developer.apple.com/documentation/mapkitjs/creating-a-maps-token
3. In Vercel, open the `rwanda-land-intelligence` project → **Settings → Environment Variables**.
4. Add `NEXT_PUBLIC_APPLE_MAPKIT_TOKEN` for **Production**, **Preview**, and (if needed) **Development**. Use the domain-restricted MapKit JS token itself; do not place an Apple private signing key in a browser-exposed variable.
5. Redeploy production and create a fresh Preview deployment. Open the map and choose **Apple Maps → Hybrid** or **Apple Maps → Satellite**.

Use a domain restriction compatible with the production domain (`rwanda-land-intelligence.vercel.app`) and any preview domain used for testing. The exact domain list and token lifecycle are managed in the Apple Developer account.

## Behavior

- **Hybrid** uses Apple satellite imagery with road and road-name layers.
- **Satellite** uses Apple satellite imagery without the road-name layer.
- The Apple map is a synchronized basemap underneath the existing transparent MapLibre overlay. MapLibre remains the interaction layer so the same overlays and boundary-selection rules work without maintaining a separate copy of every map interaction.
- Apple map view types are only enabled in the UI when `NEXT_PUBLIC_APPLE_MAPKIT_TOKEN` is configured.
