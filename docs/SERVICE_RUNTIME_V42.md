# Service Runtime v42

v42 extends the strict-TypeScript platform with a typed Dedicated Worker for OGC capabilities inspection and removes duplicate TUCBS metadata requests from the primary approved-IP flows.

## Language and execution model

- Application, engineering scripts, tests, service-worker source and dedicated-worker source remain TypeScript/TSX-only first-party code.
- `src/workers/ogcCapabilities.worker.ts` is typechecked in a dedicated `WebWorker` compilation world through `tsconfig.worker.json`.
- The DOM application deliberately excludes worker entrypoints so browser-window and worker globals cannot accidentally bleed into one another.
- The worker contains no networking code. It receives only an already-fetched XML string plus the OGC service kind and returns validated metadata.
- Unsupported/blocked/crashed workers automatically fall back to the same pure TypeScript parser on the main thread; the worker is an optimization, never a compatibility requirement.

## Single-pass TUCBS capabilities inspection

Previous compatibility APIs are retained, but the live TUCBS setup and catalogue migration now use `inspectTucbsBrowserServices()`.

For each authorized endpoint the coordinator:

1. requests modern WMS 1.3.0 or WFS 2.0.0 `GetCapabilities` from the actual browser/IP;
2. applies a hard timeout and a 4 MB response-body ceiling;
3. validates the OGC response;
4. extracts capability version;
5. extracts WMS scale denominators and converts them to ArcGIS scale semantics;
6. extracts an axis-unambiguous WGS84 coverage envelope;
7. mirrors verified WMS scale/coverage metadata to a verified WFS peer;
8. retries a legacy OGC capabilities version only for format/version compatibility failures, never to bypass 401/403 authorization.

The access dialog therefore no longer performs a second WMS request just to discover coverage. Existing approved-IP catalogue migrations also share one inspection pass when both scale and coverage are missing.

## Main-thread protection

OGC XML parsing is pure and deterministic. When module workers are supported it is performed in a Dedicated Worker, keeping large capability documents away from React/ArcGIS rendering work. Worker creation, message or timeout failure permanently disables that worker instance for the session and falls back safely.

`readResponseTextLimited()` checks declared content length and enforces the same limit while streaming the actual body. A malformed or unexpectedly huge upstream response therefore cannot force an unbounded XML string allocation before validation.

## Privacy and authorization boundaries

The approved-IP security model is unchanged:

- protected TUCBS URLs are fetched only by the browser;
- signed URLs/tokens are never copied into public health/navigation artifacts;
- the worker never receives endpoint URLs or credentials;
- in-memory dedupe keys are opaque hashes and are not persisted;
- reports contain endpoint keys, safe status/error metadata, latency and numeric/geographic provider metadata only;
- 401/403 stays authoritative and does not trigger protocol/version probing intended to bypass access control.

## Compatibility

ArcGIS remains on the repository's validated 5.1.26 line, React remains on 19.3, and TypeScript remains on 7.0. The v42 change modernizes execution boundaries around OGC metadata without changing the ArcGIS layer contract, atomic activation model, zoom locks, LayerView watchdogs, WMS/WFS failover, provider-local circuit breaker or starvation-safe load scheduler.

The application and PWA cache generation are released as 42.0.0 / v42.
