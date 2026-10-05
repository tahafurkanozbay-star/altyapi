# Ankara Kent Rehberi v51 — Full-page usability contract

v51 continues the ArcGIS 5.1 + React 19 browser architecture and the end-to-end strict TypeScript 7 migration. A forced rewrite to a non-browser-native language would add an interop boundary around the ArcGIS JavaScript SDK and web platform APIs without improving layer reliability. The modernization target is therefore maximum-strict TypeScript contracts, smaller single-purpose modules and safer browser-native interaction patterns.

## Semantic notifications and fatal recovery

Transient notices are no longer one large clickable button. Each notice exposes its state as `status` or `alert`, keeps its message as content and provides a dedicated close control. Fatal React recovery moves keyboard focus to the failure surface and labels the title/description explicitly so keyboard and assistive-technology users are not left behind the failed application tree.

## Adaptive touch, keyboard and mobile editing

The experience supervisor publishes compact/cozy/comfortable shell density from the live visual viewport. Coarse-pointer controls receive at least 44×44 CSS-pixel targets. When a mobile virtual keyboard changes the visual viewport, the actively edited field is kept inside the visible scroll area without forcing animation for users who prefer reduced motion. Panels contain their own overscroll and keep stable scroll gutters.

## Layer workspace continuity and reversible bulk actions

Layer search, kind/availability filters and collapsed groups are validated and retained in `sessionStorage`, so changing panels does not discard the current catalog context. `Açık katmanları kapat` records the affected layer IDs for ten seconds and offers a one-step rollback. Bulk close, restore and retry operations are submitted together; the existing `LayerLoadScheduler` remains the authority for real service concurrency and provider protection.

## Safe data export

CSV export neutralizes text cells and headings whose first meaningful character is `=`, `+`, `-` or `@`. This prevents downloaded provider data from being interpreted as spreadsheet formulas when opened in Excel-compatible software while preserving genuine numeric cells as numeric-looking CSV values.

## Type and release coherence

`citizenExperienceSupervisor`, `attributeTable` and `layerExplorerState` are included in the maximum-strict TypeScript contract build. Application version is `51.0.0`, and both TypeScript service-worker source and generated worker use `altyapi-shell-v51` / `altyapi-data-v51`. The previous v50 release test now derives the expected cache generation from the package major version so future releases do not fail because of obsolete hard-coded assertions.

## Regression coverage

v51 tests lock persisted explorer-state validation, spreadsheet-safe CSV output, semantic toasts, fatal focus recovery, adaptive/coarse-pointer styling, mobile editing visibility, reversible bulk-layer operations, strict-contract inclusion and PWA cache-generation coherence.
