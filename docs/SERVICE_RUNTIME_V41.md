# Service Runtime v41

v41 removes the last hand-authored JavaScript runtime from the application and introduces main-thread-pressure-aware background scheduling without changing the interactive ArcGIS layer lifecycle.

## Language platform

- `src`, `scripts` and `tests` remain strict TypeScript/TSX-only first-party source trees.
- The PWA worker source now lives at `src/sw/sw.ts` and is typechecked with the dedicated `WebWorker` library.
- `npm run build:sw` emits the browser-required `public/sw.js` artifact before Vite packages the production site.
- `public/sw.js` is generated output, not an authored source of truth.
- Production verification checks that the emitted worker cache generation matches the package major version.

## PWA safety

The v41 worker preserves controlled update semantics: a newly installed worker does not call `skipWaiting()` automatically. The user-facing update flow still owns activation through the `SKIP_WAITING` message. Mutable catalog/health/navigation JSON remains network-first with `no-store` fetches, while cached fallback is available during network failure.

Responses marked `Cache-Control: no-store`, partial `206` responses, cross-origin traffic, non-GET requests and source maps are excluded from application caching paths.

## Runtime pressure

`src/platform/runtimePressure.ts` observes the browser Long Tasks API when available. It keeps only a bounded rolling five-second window and classifies main-thread pressure as `normal`, `busy` or `critical`. Unsupported browsers simply stay on the normal compatibility path; no polling loop is introduced.

Pressure is based on blocking time beyond the 50 ms long-task threshold, maximum individual task duration and repeated long-task count. The monitor stores no user data, URLs, tokens or service payloads.

## Cooperative background scheduling

`src/platform/cooperativeScheduling.ts` feature-detects the modern Scheduling API. When available, background work uses `scheduler.yield()` or `scheduler.postTask()`; otherwise it falls back to a zero-delay macrotask yield. Experimental API failure is contained and automatically falls back.

Public-service warmup now yields before background work and aborts admission while the main thread is critically busy. Interactive layer activation, retries and render recovery are deliberately not delayed by this mechanism.

## Compatibility policy

ArcGIS remains on the repository's validated 5.1 release line. v41 changes runtime orchestration and source-language boundaries, not the ArcGIS API contract. TUCBS approved-IP access, credential quarantine, atomic activation, provider scale reconciliation, LayerView watchdogs and WMS/WFS failover remain intact.
