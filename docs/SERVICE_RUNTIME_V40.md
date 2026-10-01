# Service Runtime v40 — Typed Runtime Contracts

v40 hardens the Ankara Kent Rehberi runtime around one rule: data is `unknown` until a boundary proves otherwise, and application-owned runtime messages are typed rather than global string events.

## Language baseline

The browser application, React UI, ArcGIS runtime, engineering scripts and tests remain on strict TypeScript 7 / TSX. ArcGIS 5.1 is a JavaScript/TypeScript browser SDK, so introducing a second systems language would add interop and deployment risk without improving service compatibility. v40 instead makes TypeScript itself materially stricter: `verbatimModuleSyntax`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `allowUnreachableCode: false` and `allowUnusedLabels: false` are enforced by CI.

A regression test scans first-party `src`, `scripts` and `tests` code to prevent `.js`, `.mjs` or `.cjs` implementation files from silently returning. `public/sw.js` remains JavaScript because it is a browser Service Worker asset executed directly by the platform.

## Typed runtime event bus

`src/platform/runtimeEvents.ts` is the application-owned event protocol. Event names and payloads are represented by `RuntimeEventMap`, so producers and consumers are checked by TypeScript.

The typed bus currently owns:

- atomic layer activation completion,
- LayerView render-health state,
- TUCBS access-required requests.

ArcGIS SDK DOM events (`arcgisViewLayerviewCreate`, `arcgisViewChange`, etc.) remain DOM events because they are emitted by the SDK. `runtimeEventDomBridge.ts` is the single compatibility boundary for the existing LayerView watchdog; new application code must not create new `window` CustomEvent protocols.

This reduces accidental event-name drift, payload shape mismatches and the possibility of unrelated page scripts spoofing application-internal state.

## Runtime data contracts

`src/platform/runtimeContracts.ts` centralizes defensive readers for unknown JSON/storage values. Public service catalogue, health snapshot and navigation snapshot readers now validate their inputs before constructing domain objects.

Notable v40 protections:

- unsupported health/navigation `ServiceKind` values are rejected instead of cast,
- numeric strings are not silently accepted as numeric scale metadata,
- arrays cannot pass as records,
- required service catalogue fields are rebuilt from validated strings instead of `as unknown as` casts,
- dates/enums/nullable booleans/finite numbers share one validation vocabulary.

TUCBS protected endpoint URLs and credentials are not added to these contracts and are still never written to public health/navigation artifacts.

## Existing layer reliability retained

v40 does not replace the v30–v39 layer reliability stack. Atomic activation, provider/LayerView scale reconciliation, full-extent navigation, visible cartography, WMS/WFS semantic failover, adaptive scheduling, offline suspension/resume, provider-local circuit breakers, bounded queue aging, half-open probe ownership and real in-flight ArcGIS cancellation remain active.

## Release coherence

Application version and PWA cache generation are `40.0.0` / `v40`. Live `services.json`, `service-health.json` and `service-navigation.json` remain network-first with `no-store` network requests, while old `altyapi-*` cache generations are removed on Service Worker activation.
