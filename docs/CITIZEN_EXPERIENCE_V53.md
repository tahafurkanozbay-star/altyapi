# Ankara Kent Rehberi v53 — Unified Citizen Shell

v53 keeps the project on the browser-native ArcGIS 5.1 + React 19 + strict TypeScript 7 architecture. Rewriting the application in a non-browser-native language would add interoperability code around the ArcGIS JavaScript SDK and would not improve service or layer reliability. The release therefore advances the language contract where it matters: all new page-wide behavior is typed, maximum-strict TypeScript and is covered by deterministic policy tests.

## One page-wide dismissal contract

Transient surfaces now follow one explicit Escape priority:

1. native modal dialog,
2. selected-object details,
3. active map tool,
4. visible mobile workspace drawer,
5. desktop workspace panel,
6. map focus mode.

Only one context closes for each Escape press. This prevents a single keyboard action from closing a foreground tool and the panel behind it at the same time. Native `<dialog>` remains authoritative for the bookmark workflow and continues to use its own cancel event.

## Mobile drawer semantics

On phone-sized viewports the visible layers/data/bookmarks/help panel is treated as a true transient drawer. It receives dialog/modal semantics only while visibly open, maintains a bounded Tab loop, and can be dismissed from the dimmed map backdrop. Desktop panels keep their normal non-modal navigation model.

The backdrop respects reduced transparency, data-saver, increased contrast and forced-colors preferences. Reduced-motion users do not receive added shell transitions.

## Responsive workspace refinement

The workspace panel is a CSS containment boundary. Container queries adapt summaries, action groups and filter strips to the actual available panel width instead of relying only on global viewport breakpoints. Long service and status text can wrap safely without forcing the map canvas wider than the device.

## Mobile browser and installed-app behavior

The viewport opts into `interactive-widget=resizes-content` so supported mobile browsers resize the usable application canvas when the virtual keyboard opens. Existing `visualViewport` supervision remains as a compatibility and geometry fallback.

The web-app manifest now has a stable application id and a launch handler that prefers navigating an existing installed-app client instead of producing duplicate Kent Rehberi windows when the browser supports the capability. iOS standalone metadata is also explicit.

## Release and cache coherence

Application version and PWA shell/data cache generations are `53.0.0` / `v53`. The older v52 release-coherence test is now generation-aware rather than permanently pinned to v52, so future releases can rotate caches without weakening the accessibility tests introduced in v52.

New regression coverage locks the shell priority policy, mobile modal/focus behavior, responsive container-query contract, modern PWA metadata and cache/package coherence.
