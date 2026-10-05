# Ankara Kent Rehberi v50 — Citizen Experience Contract

v50 keeps the ArcGIS 5.1 + React 19 browser architecture and continues the end-to-end strict TypeScript 7 migration. A forced rewrite to a non-browser-native language would add an interop layer around the ArcGIS JavaScript SDK without improving service reliability, so the platform language remains strict TypeScript and its strongest contract settings are extended to the new citizen readiness core.

## One authoritative readiness model

`src/lib/citizenReadiness.ts` combines the state of visible services, LayerView render health and browser connectivity into one citizen-facing result. Priority is deterministic: offline → visible failure → visible loading/render preparation → no active layer → ready. Hidden layer failures never make the current workspace look broken.

The status bar subscribes to the LayerView health store with `useSyncExternalStore`, so it reflects the same event-driven render truth used by the layer explorer. It deliberately uses citizen language such as “Harita hazır”, “Katmanlar hazırlanıyor” and “Bazı katmanlar sorunlu” rather than exposing ArcGIS internals.

## Accessible page ownership

Platform/PWA notices have one owner: `PlatformStatusHost`. The obsolete `App.tsx` window events and duplicate update banner were removed. The map region now exposes `aria-busy` while the application or visible layers are loading, the workspace summary no longer creates a second live region, and skip-link panel targets are programmatically focusable.

## Responsive state surface

`experience-v50.css` adds a compact readiness surface with safe-area support. On narrow viewports it removes secondary coordinate/detail text before removing the primary state. Forced-colors and reduced-motion modes receive explicit fallbacks, and the readiness tone is also published as `html[data-workspace-readiness]` for future shell-level adaptation.

## Release coherence

The application version is `50.0.0`; TypeScript service-worker source and generated worker both use `altyapi-shell-v50` / `altyapi-data-v50`. Live service, health and navigation documents remain network-first and `no-store` at the network boundary.

## Regression coverage

v50 tests lock the readiness priority model, failure deduplication, hidden-layer isolation, typed PWA ownership, focusable skip targets, map busy semantics, responsive/forced-colors CSS and package/PWA cache generation coherence.
