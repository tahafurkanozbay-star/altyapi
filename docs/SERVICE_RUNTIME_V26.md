# Service Runtime v26 — TUCBS provider coverage learning

v26 extends the approved-IP TUCBS workflow so activation decisions can use both the provider render scale and the provider geographic coverage.

## Problem closed

Earlier releases learned WMS `MinScaleDenominator` / `MaxScaleDenominator` from the browser, but TUCBS catalogue rows could still lack a trusted operational extent until ArcGIS created the live layer. That left a gap where a layer could be at the correct zoom but the camera could still be outside the actual dataset area.

## v26 policy

1. Only configured TUCBS WMS endpoints are queried from the user's browser, so source-IP restrictions are evaluated from the approved client network.
2. `GetCapabilities` is requested with `WMS 1.3.0` and `cache: no-store`.
3. `EX_GeographicBoundingBox` is preferred because its longitude/latitude axis semantics are unambiguous.
4. WMS 1.1.x `LatLonBoundingBox` is accepted as a conservative fallback.
5. When multiple valid geographic boxes are present, the smallest valid box is selected as the most specific dataset coverage rather than the broader service envelope.
6. Extents are accepted only when all coordinates are finite, ordered, and inside legal WGS84 longitude/latitude bounds.
7. Only `{xmin, ymin, xmax, ymax, wkid: 4326}`, verification time, and a non-secret source label are persisted.
8. Signed service URLs, path credentials, tokens, query secrets, and response bodies are never written into the coverage profile store.
9. The WFS row for the same logical TUCBS dataset inherits the verified WMS coverage, matching the existing WMS→WFS scale-profile policy.
10. Coverage discovery is non-blocking. A temporary provider/network failure never prevents the public catalogue from loading.

## Existing approved-IP users

On the first v26 catalogue load, any configured WMS endpoint that does not yet have a learned coverage profile is probed once. The learned numeric envelope is saved locally. Users do not need to re-import their protected service JSON.

When a user imports a fresh TUCBS JSON through the access dialog, scale verification and coverage discovery run together before the page reloads. The dialog reports how many layer rows received scale and geographic coverage metadata.

## Navigation integration

The learned WGS84 extent is attached to `ServiceDefinition.operationalExtent`. It therefore participates in the same activation/zoom safety model already used by verified ABB layers:

- opening a layer can move the map toward its real provider coverage;
- closing the layer removes its active zoom restriction as before;
- WMS/WFS peer failover retains the same logical geographic envelope;
- later live ArcGIS `fullExtent` and LayerView watchdog checks remain the final render-time safety net.

## Release coherence

Application version: `26.0.0`

PWA caches:

- `altyapi-shell-v26`
- `altyapi-data-v26`
