# Ankara Kent Rehberi v50 · Application Integrity

v50 focuses on whole-page product integrity rather than adding another isolated GIS feature. The existing ArcGIS 5.1 + React 19 codebase remains end-to-end strict TypeScript because that is the native, type-safe runtime for the browser and ArcGIS Maps SDK; introducing a second systems language would add bridge complexity without improving layer compatibility.

## Single ownership

PWA registration, update discovery and update application now live in `src/platform/serviceWorkerLifecycle.ts`. The React shell no longer keeps a second string-event update path. Runtime events remain typed and subscriber failures are isolated so an optional UI consumer cannot block recovery, service health or PWA listeners.

## Local failure containment

The lazy Harita Verisi surface is wrapped in `PanelErrorBoundary`. A chunk/render failure in that optional panel produces a local recovery surface while the map and the rest of the application keep running. Fatal application recovery remains reserved for failures that actually cross the application boundary.

## Citizen-safe failures

`publicErrorMessage` projects unknown failures onto bounded citizen-facing text. Endpoint URLs, token/auth terminology and implementation-level exceptions are not reflected into boot/query/recovery UI. Raw diagnostic context can still be recorded in the already-sanitized incident journal.

## Honest telemetry

The status bar no longer fabricates Ankara coordinates before ArcGIS telemetry is available. Unknown location is displayed as an em dash until the runtime reports finite latitude/longitude values.

## Accessible notifications

Toasts now use status/alert semantics with a dedicated dismissal button instead of making the entire notification a button. A bounded toast hook owns timers and clears them on dismissal/unmount, preventing stale state writes during page teardown.

## PWA resilience

The service-worker lifecycle registers correctly even when the module executes after `window.load`, checks for updates on reconnect and when the document becomes visible, throttles routine checks, disables registration-script caching, and rotates shell/data caches to v50.

## Install prompt state

The install recommendation follows `display-mode: standalone` changes and the `appinstalled` event instead of relying on a non-reactive display-mode read during render.

## Validation

v50 adds regression coverage for public error projection, typed runtime subscriber isolation, local panel failure containment, single PWA lifecycle ownership, truthful telemetry, accessible notifications and release/cache coherence. All existing service, TUCBS, layer activation, renderer, worker, health, navigation and build tests remain authoritative.
