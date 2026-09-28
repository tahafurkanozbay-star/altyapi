# Service Runtime v25 — Scale-aware coverage navigation

v25 strengthens layer activation when a provider is technically healthy but its data coverage is outside the current camera.

## Problem closed in v25

The v23/v24 coverage watchdog could correctly detect a disjoint `fullExtent`, but `goTo(fullExtent)` allowed ArcGIS to choose a scale from the full geographic footprint. Large infrastructure extents can therefore produce a temporary scale that is farther out than the layer's provider visibility range. The continuous scale guard then has to correct the scale immediately afterwards, which can look like a two-step camera jump.

## v25 policy

When a newly visible service layer is outside the current Scene extent:

1. `fullExtent` is still validated and compared conservatively, including the v24 WGS84/Web Mercator reconciliation.
2. `Layer.minScale` and `Layer.maxScale` are read from the loaded ArcGIS layer when they are positive and coherent.
3. If the current Scene scale is already inside the provider interval, that scale is preserved.
4. If the Scene is too far out, navigation lands 4% inside `minScale`.
5. If the Scene is too close, navigation lands 4% inside `maxScale`.
6. When both bounds exist and there is no valid current scale, their geometric mean is used.
7. Conflicting scale metadata (`maxScale > minScale`) is ignored rather than driving an unsafe camera move.
8. With valid scale metadata, the watchdog sends one `goTo({ target: extent.center, scale })` operation.
9. With no provider scale limits, the existing `fullExtent.expand(1.12)` fit behavior remains unchanged.

This keeps the coverage watchdog compatible with the main runtime scale guard while reducing zoom ping-pong during LayerView creation.

## ArcGIS scale semantics

ArcGIS names are intentionally counter-intuitive:

- `minScale` is the largest denominator / furthest allowed zoom-out.
- `maxScale` is the smallest denominator / closest allowed zoom-in.

For example, a layer with `minScale = 400000` that is activated from `1:800000` is focused at approximately `1:384000`, safely inside the provider boundary.

## Safety rules retained

- Automatic coverage focus only runs on a real hidden → visible activation edge.
- LayerView recycle/recovery does not create a second activation.
- Rapid multi-layer activation is debounced and the latest activation wins.
- Unsupported CRS pairs remain `unknown`; no projection is guessed.
- Invalid, zero, negative, NaN, or contradictory scale metadata is ignored.
- TUCBS signed endpoints and credentials are never read or logged by the watchdog.
- User pan/zoom after activation remains free except for the normal active-layer scale guard.

## Release coherence

Application version: `25.0.0`

PWA caches:

- `altyapi-shell-v25`
- `altyapi-data-v25`
