# Service Runtime v24 — Projection-aware coverage navigation

v24 extends the v23 layer-coverage watchdog so a layer can still be positioned correctly when the ArcGIS Scene and the provider advertise their extents in different, but safely convertible, coordinate systems.

## Problem closed by v24

A common ArcGIS/OGC combination is:

- Scene/basemap extent: Web Mercator (`EPSG:3857`, `102100`, `102113`, or `900913`)
- Provider `fullExtent`: geographic WGS84 (`EPSG:4326`)

v23 deliberately returned `unknown` for every mixed spatial-reference pair. That was safe, but it meant a valid layer could be fully outside the camera and still not receive automatic first-activation focus.

## v24 comparison policy

The coverage watchdog now supports exactly one deterministic cross-reference family:

- `EPSG:4326` -> Web Mercator
- Web Mercator -> `EPSG:4326`

The conversion is performed with the standard spherical Web Mercator equations using the WGS84 semi-major radius (`6378137 m`). Latitude is clamped to the Web Mercator mathematical limit (`±85.0511287798066°`).

The legacy ArcGIS/Web Mercator identifiers `102100`, `102113`, and `900913` are canonicalized to `3857` before comparison.

## Safety rules

Automatic camera movement is still conservative:

1. malformed or non-finite extents are rejected;
2. zero-width/zero-height extents are rejected;
3. impossible geographic coordinates are rejected;
4. impossible Web Mercator coordinates are rejected;
5. unsupported CRS pairs such as UTM vs Web Mercator remain `unknown`;
6. an `unknown` comparison never triggers automatic navigation;
7. navigation only occurs on a real hidden -> visible activation edge;
8. LayerView recovery destroy/create cycles do not count as new activation;
9. the existing 120 ms activation debounce remains in force;
10. user pan/zoom after activation is never continuously overridden.

## Why arbitrary projection was not added

The public client must not guess datum transformations or projection definitions. For arbitrary projected coordinate systems the application would need an authoritative transformation definition and, in some cases, transformation grids. v24 therefore supports only the deterministic WGS84/Web Mercator pair and leaves all other mixed-reference cases untouched.

## Validation

Regression tests cover:

- same-reference intersection and disjoint detection;
- ArcGIS Web Mercator alias handling;
- WGS84 -> Web Mercator intersection;
- WGS84 -> Web Mercator disjoint detection;
- Web Mercator -> WGS84 disjoint detection;
- Ankara-area round-trip projection tolerance;
- unsupported CRS refusal;
- malformed/impossible extent refusal;
- watchdog boot ordering and visibility watchers.

The application and PWA cache generation are advanced together to v24 so clients do not retain the older v23 coverage logic after deployment.
