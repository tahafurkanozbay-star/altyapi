# Service Runtime v22 — Render Stall Recovery

v22 extends the v21 LayerView health pipeline with a bounded first-render deadline. The goal is to prevent a layer from remaining indefinitely in **Render hazırlanıyor** after `Layer.load()` succeeds but ArcGIS never reaches a settled LayerView.

## Render deadlines

Deadlines are intentionally service-type aware so heavy 3D layers are not treated like lightweight OGC layers:

| ArcGIS layer type | First-render deadline |
| --- | ---: |
| SceneLayer | 35 s |
| MapImageLayer | 28 s |
| WFS / FeatureLayer | 26 s |
| WMS | 24 s |
| Unknown / fallback | 25 s |

A timeout is actionable only while the project layer is visible, the LayerView is visible, the layer is inside its valid scale range, and `updating` has still not settled to `false`. Hidden or out-of-scale layers are never classified as render stalls.

## Recovery sequence

1. LayerView is created and enters `Render hazırlanıyor`.
2. Provider scale watchdog repairs an out-of-scale view first when necessary.
3. If an in-scale LayerView misses its first-render deadline, health becomes `Render gecikti`.
4. The watchdog performs a bounded recycle using the same layer and original map order.
5. Recovery state is preserved across the temporary LayerView destroy/create pair; the UI does not incorrectly fall back to `Kapalı` or lose the attempt number.
6. At most two recycle attempts are allowed. A stable LayerView clears the counters immediately.
7. If both attempts fail, health becomes `Render başarısız` and the existing manual retry path remains available.

There is no interval polling. Each LayerView owns at most one timeout and the timeout is cleared on stable render, hide, out-of-scale transition, LayerView destruction, or application teardown.

## Permanent errors

Authentication and configuration failures such as HTTP 401/403, invalid token, malformed URL, or unsupported spatial reference are not recycled. They are surfaced immediately as a render failure instead of remaining indefinitely in a preparing state.

## Security

The watchdog only works with ArcGIS Layer/LayerView state and project layer IDs (`svc-*`). It does not read, persist, log, or transform TUCBS signed endpoint credentials. Existing approved-IP and browser-local TUCBS configuration remains unchanged.
