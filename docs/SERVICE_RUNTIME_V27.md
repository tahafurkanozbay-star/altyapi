# Service Runtime v27 — Atomic Layer Activation

v27 gives `ArcGISRuntime` sole ownership of automatic camera movement during a layer activation.

## Why

Before v27, three independent mechanisms could react to one user action:

1. `prepareLayerActivation()` could navigate before the remote layer had loaded.
2. Live provider `minScale` / `maxScale` reconciliation could make the continuous scale guard move again.
3. The global coverage/LayerView watchdog could focus `fullExtent` after LayerView creation.

Each mechanism was individually conservative, but together they could produce a visible two-step or three-step camera correction.

## v27 transaction

For a newly activated layer the runtime now:

1. creates and fully loads a fresh ArcGIS `Layer`;
2. applies WMS selection / renderer finalization;
3. reads live provider scale metadata and reconciles it with the verified catalogue profile;
4. registers the candidate in the active common scale range without moving the Scene;
5. marks `svc-<serviceId>` as an atomic activation so the LayerView recovery watchdog cannot race the transaction;
6. attaches the layer and briefly waits for its first LayerView scale signal;
7. combines current Scene extent, provider `fullExtent`, TUCBS/verified operational extent, reconciled scale range and LayerView visibility in `planAtomicLayerActivation()`;
8. executes at most one activation `goTo`;
9. releases the transaction and re-enables continuous post-activation guardrails.

Hide/show of an already cached layer uses the same transaction, but does not require a network reload.

## Camera ownership

`layerCoverageWatchdog.ts` is now a pure geometry/projection helper. It no longer installs DOM listeners and never calls `scene.goTo`.

`layerViewWatchdog.ts` remains the final render-health recovery layer. During an atomic activation it still observes LayerView health, but defers `scene.scale` repairs. The completion event schedules an immediate re-audit after the runtime commits its one camera decision.

## Safety properties

- Provider `fullExtent` wins when it can be safely compared with the current Scene extent.
- Only WGS84 ↔ Web Mercator cross-SR extent comparison is automatic; unsupported projections stay `unknown`.
- Existing visible layers participate in a strict common scale intersection.
- If active scale envelopes conflict, the existing deterministic latest-activation fallback remains in effect.
- No camera movement happens before live layer metadata is available.
- Failed or superseded activation never performs a late camera jump.
- Continuous scale guardrails still protect later manual user zooming after activation completes.

## Release

- Application version: `27.0.0`
- PWA shell/data cache generation: `v27`
