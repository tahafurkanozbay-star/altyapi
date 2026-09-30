# Service Runtime v34 — Adaptive Layer Load Scheduling

v34 keeps the v33 atomic camera transaction and adds a separate admission-control layer for expensive remote layer loads.

## Goals

- Prevent startup/bookmark restores from creating avoidable request bursts against ABB, TUCBS and other providers.
- Let a direct user action take precedence over queued background/restore work.
- Serialize WMS/WFS metadata loads per host because one logical OGC layer can trigger several capability/metadata requests.
- Keep ArcGIS retry, WMS/WFS failover, zoom reconciliation and LayerView recovery semantics unchanged.
- Cancel queued activation when the user closes a layer before its remote load begins.

## Priority classes

1. `interactive` — a layer the user explicitly enables.
2. `retry` — a manual retry after a failed load/render.
3. `restore` — startup/share/bookmark state restoration.

Priorities only reorder work that has not started. A running request is never force-preempted because abrupt cancellation can leave ArcGIS Layer instances in an ambiguous state. If the user closes a layer while its request is already running, the existing `desiredVisibility` guard marks the eventual result as superseded and prevents attachment to the live map.

## Concurrency policy

Global admission budget follows the detected performance profile:

| Profile | Max concurrent remote layer loads |
| --- | ---: |
| high | 3 |
| balanced | 2 |
| eco | 1 |

Per-host admission is stricter:

- WMS / WFS: **1** load at a time per host on every profile.
- MapServer / FeatureServer / SceneServer: **2** per host on `high`, otherwise **1**.

A different host may use an available global slot even when another host's lane is saturated. This avoids head-of-line blocking while still protecting each upstream service family from bursts.

## Privacy

The scheduler derives an in-memory lane key from a service URL only to group requests. The key is never logged, persisted, emitted to UI events or written to public artifacts. TUCBS signed endpoints therefore remain under the existing client-only access policy.

## Interaction with v33 atomic navigation

Load scheduling and camera ownership are intentionally independent:

1. v34 decides **when** a remote layer may begin loading.
2. v16+ runtime retry/failover decides **how** that load is recovered.
3. v18–v32 metadata/LayerView logic determines provider scale and extent truth.
4. v33 batch activation still decides **one camera movement** after the batch has completed.

This preserves the single-camera-owner architecture while reducing server/browser pressure during multi-layer activation.
