# Service Runtime v36

v36 focuses on request pressure, cancellation and release reproducibility without weakening the approved-client TUCBS model.

## Modern TypeScript baseline

The application, tests and engineering scripts remain first-party strict TypeScript because ArcGIS Maps SDK for JavaScript and Map Components are native JavaScript/TypeScript browser APIs. v36 keeps TypeScript 7 and Vite 8, enables additional TypeScript 7 guardrails (`erasableSyntaxOnly` and `noUncheckedSideEffectImports`) and validates the release dependency graph before every `npm run check`.

`@arcgis/core` and `@arcgis/map-components` are deliberately kept on the same exact stable patch version. The validator rejects ArcGIS version skew, prerelease dependencies and direct git/http dependency specifications.

## Real in-flight layer cancellation

Before v36, hiding a layer while `Layer.load()` was already running marked the result as superseded, but the remote metadata request could continue until it resolved or timed out.

v36 adds a weak-reference load registry:

1. Every fresh ArcGIS Layer created for a logical service is temporarily registered.
2. Successful metadata finalization releases that registration.
3. Explicit hide/cancel asks the newest tracked Layer to run `cancelLoad()`.
4. The existing `desiredVisibility` checks remain authoritative, so a provider that resolves despite cancellation cannot attach a stale layer to the map.
5. Runtime/scheduler disposal also requests cancellation for tracked work.

Only weak references are kept; the registry does not persist URLs, tokens, layer metadata or credentials.

## Network-aware admission

The existing health/latency/host-aware scheduler remains the primary admission controller. v36 additionally reads coarse browser connection hints locally:

- online/offline,
- Save-Data,
- effective connection type,
- approximate RTT/downlink when the browser exposes them,
- document visibility.

These hints are never persisted or transmitted. They only cap *new* admissions. Existing work is not killed because the connection estimate changes.

Policy:

- Save-Data, offline, hidden document, 2G, very high RTT or sub-1 Mbps: one new load at a time.
- 3G/moderately constrained RTT or downlink: maximum two, subject to the normal profile budget.
- healthy connection: the normal eco/balanced/high profile budget remains intact.

Provider-local OGC serialization and health-weighted costs continue to apply.

## PWA delivery

The service worker cache generation is v36. Navigation Preload is enabled when supported so a controlled service worker does not unnecessarily delay fresh document navigation. Dynamic service health/navigation JSON files remain network-first with `no-store` network requests and sanitized cache fallback.

## Security and external-service boundary

v36 does not bypass service authorization, IP restrictions, CORS, TLS or provider availability. TUCBS signed endpoints remain browser-local. The application can cancel/retry/fail over and reduce request pressure, but it cannot make an upstream server respond when that server or network path is unavailable.
