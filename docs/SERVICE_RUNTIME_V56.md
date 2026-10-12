# Service Runtime v56 — Provider topology aware loading

v56 separates **provider host identity** from **gateway route identity**.

The same hostname can expose multiple upstream paths with very different runtime
characteristics. Ankara's current public catalogue is a concrete example:

- `/portal/sharing/servers/.../rest/services` — ArcGIS Portal federation proxy
- `/server/rest/services/...` — direct ArcGIS Server REST

Treating both as one circuit-breaker lane meant a transient/cold proxy failure
could unnecessarily delay UIP, FeatureServer or SceneServer traffic on the same
host. v56 therefore uses a coarse, non-sensitive provider topology key:

`origin | gateway-class`

Only the origin and one of `arcgis-sharing-proxy`, `arcgis-rest`, `ogc` or
`generic` are retained in memory. Layer paths, query strings, tokens and TUCBS
credentials are never part of the key.

## Runtime behavior

- WMS/WFS remains serialized per OGC provider lane.
- ArcGIS Portal sharing-proxy MapServer loads are serialized even on the high
  performance profile.
- Direct ArcGIS REST traffic on the same host uses a separate lane and therefore
  is not poisoned by a sharing-proxy circuit breaker.
- Existing global network caps, starvation aging, cancellation, fresh-instance
  retries and provider-local circuit breakers remain unchanged.

## Observability behavior

The public service-health probe now uses the same provider topology. It keeps a
global concurrency cap while enforcing a separate per-lane cap.

The 2026-10-11 scheduled snapshot verified all 10 publicly probeable services.
During the four-way health probe, several Portal sharing-proxy MapServer rows
reported roughly 5 seconds, while the subsequent serialized scale audit reached
the same metadata routes in roughly 0.25–0.70 seconds. That pattern is treated as
burst-sensitivity evidence rather than proof that each layer is inherently slow.

v56 therefore serializes that proxy lane during health probing while allowing
independent direct REST lanes to continue. This produces a cleaner startup health
signal and avoids teaching the browser scheduler an artificial latency penalty.

## TUCBS

The 10 IP-authorized TUCBS WMS/WFS rows remain browser-authoritative. Public
GitHub runners do not probe their protected endpoints. Provider topology stores
no signed URL path or credential and does not change the approved-IP access model.
