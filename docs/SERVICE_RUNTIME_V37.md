# Service Runtime v37

v37 closes the remaining first-party JavaScript source gaps and hardens PWA/network delivery without changing the approved-client TUCBS authorization model.

## One executable source language

All first-party executable source is now strict TypeScript 7:

- React/application/runtime code: `src/**/*.ts(x)`
- engineering/validation tooling: `scripts/**/*.ts`
- boot fallback: `src/boot.ts`
- service worker source: `worker/sw.ts`
- Vite configuration: `vite.config.ts`

Browsers still execute JavaScript, so `public/sw.js` is generated from `worker/sw.ts` during development/build and is deliberately ignored by Git. `validate:source` rejects tracked `.js/.jsx/.mjs/.cjs` source and executable inline HTML scripts.

`tsconfig.node.json` now typechecks engineering scripts in addition to Vite configuration. The service worker has an isolated `WebWorker` TypeScript project with strict checks appropriate to its global execution context.

## Deterministic PWA release generation

The service-worker cache generation is no longer manually edited. `scripts/build-service-worker.ts` reads the exact package semver and injects it into the typed worker source. v37 therefore produces:

- `altyapi-shell-v37.0.0`
- `altyapi-data-v37.0.0`
- `altyapi-runtime-v37.0.0`

Build verification rejects release placeholders or cache/version drift.

## Safer offline/runtime cache

The v37 worker keeps operational JSON network-first and adds bounded network waits:

- live service/navigation data: 4.5 s network window before cache fallback;
- document navigation: 7 s network window with Navigation Preload support;
- static runtime assets: separate stale-while-revalidate cache.

Cache writes are skipped when a same-origin request contains authorization or token-like query keys. Responses declaring `private` or `no-store` are never persisted. Cache write failure never converts a successful network response into an application failure.

## Typed boot and update lifecycle

The old inline boot JavaScript has been removed from `index.html`. `src/boot.ts` owns the timeout fallback and constructs its UI through DOM APIs rather than string HTML injection.

Service-worker registration/update handling moved from the application entrypoint to `src/platform/serviceWorkerClient.ts`. Update checks are bounded and retried on useful lifecycle transitions such as reconnect, BFCache restore and returning to a visible tab.

## Lower background service pressure

Public slow-service warmup remains restricted to verified browser-public ArcGIS endpoints and still excludes TUCBS or credential-bearing URLs. v37 adds:

- Web Locks coordination when supported, so concurrent tabs do not warm the same providers simultaneously;
- page lifecycle cancellation, including `pagehide`/hidden transitions;
- AbortSignal propagation into candidate requests;
- existing performance-profile concurrency limits.

Warmup remains best-effort and cannot affect layer availability or user-facing health state.

## Citizen branding coherence

The document and PWA manifest now consistently use **Ankara Kent Rehberi** instead of stale v13/operations branding. Runtime service, zoom, LayerView, TUCBS and high-visibility cartography behavior from v36 remains intact.

## External-service boundary

v37 does not bypass IP restrictions, credentials, CORS, TLS or upstream outages. It improves client correctness, cancellation, caching and request pressure; provider availability remains an external dependency.
