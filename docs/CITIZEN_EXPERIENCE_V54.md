# Ankara Kent Rehberi v54 — Unified Citizen Experience Contract

v54 keeps the application on the browser-native ArcGIS 5.1 + React 19 + strict TypeScript 7 architecture. Moving the GIS client to a non-browser-native language would add an interoperability layer around the ArcGIS JavaScript SDK without improving layer availability or citizen usability. The release therefore advances the language contract by removing duplicated behavior and making the remaining page-wide contracts typed and deterministic.

## One typed command registry

Citizen keyboard shortcuts, visible help text and ToolRail `aria-keyshortcuts` now derive from one `citizenActions.ts` registry. The registry owns command ids, keys, modifier requirements, display labels, panel names and map-tool labels. Runtime shortcut matching no longer duplicates the same chord table in an `if` chain.

The contract keeps legacy character-only shortcuts disabled. Primary shortcuts expose both Control and Meta variants to assistive technology where appropriate.

## One citizen-shell stylesheet entry point

`main.tsx` now imports a single `citizen-shell.css` entry point for the evolving citizen experience. Historical experience fragments remain in their original order behind that entry point, preserving the proven cascade while preventing every future release from adding another top-level stylesheet import.

v54 also standardizes:

- visible focus rings,
- 44 px coarse-pointer touch targets,
- safe wrapping for long service/status text,
- overscroll containment for modal mobile panels,
- reduced-motion behavior,
- forced-colors focus visibility.

## Mobile modal isolation and focus restoration

The visible mobile workspace panel is now isolated from background map interaction, not merely labelled as modal. While the drawer is open, the map canvas, tool rail, navigation controls and status bar become `inert`. The first usable drawer control receives focus, Tab stays bounded in the drawer, and closing the drawer restores focus to the control that opened it when possible.

The supervisor only removes `inert` state that it owns, so it does not overwrite unrelated application or browser accessibility state.

Escape priority from v53 is preserved: native dialog → details → active map tool → mobile drawer → desktop panel → focus mode.

## Release coherence

Application version and PWA shell/data cache generations move together to `54.0.0` / `v54`. Regression tests lock:

- shortcut registry uniqueness and runtime matching,
- Control/Meta accessibility metadata,
- unified stylesheet ordering,
- mobile inert/focus lifecycle,
- current cache/package generation coherence.
