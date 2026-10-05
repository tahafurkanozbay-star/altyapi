# Ankara Kent Rehberi v51 — Responsive Citizen Workspace

v51 keeps the browser-native ArcGIS 5.1 + React 19 architecture and the end-to-end strict TypeScript 7 source language. The application already has no first-party JavaScript/JSX/MJS/CJS source under `src`, `scripts` or `tests`; changing to a non-browser-native language would introduce an interop boundary around the ArcGIS JavaScript SDK rather than improve layer reliability. v51 therefore strengthens the TypeScript contract and modernizes the complete citizen-facing workspace instead of performing a cosmetic language rewrite.

## One responsive shell

The desktop layout remains dense and map-first, while viewports at 760px and below use a dedicated phone/tablet workspace. The address/place search remains available on normal portrait phones instead of disappearing. The tall left tool rail becomes a bottom horizontal, scroll-snap dock with visible labels, preserving every map tool without forcing a short phone to fit a long vertical stack.

The top bar, tool dock, status surface, panels, tool panels, details drawer, toast stack and offline notice all respect CSS safe-area insets. Coarse-pointer devices get 44px minimum interaction targets. Very short landscape phones use a compact mode so the 3B scene retains useful vertical space.

## Panel and tool ownership

`citizenExperienceSupervisor.ts` now owns mobile workspace coordination in addition to focus and viewport supervision. A hidden-but-active panel trigger reveals the panel instead of accidentally toggling the React panel state to `null`. If no panel is selected, the mobile menu opens the Layers workspace rather than exposing an empty panel zone.

Opening a map tool hides the visible mobile panel. Opening a different citizen panel closes the map tool. Panel content presence is included in `inert` / `aria-hidden` decisions, so an empty off-canvas container cannot trap keyboard or assistive-technology focus.

## Device and user preferences

The supervisor publishes orientation, compact-height, virtual-keyboard, reduced-transparency, pointer, hover, network and data-saving state as typed DOM datasets. The v51 CSS uses those signals to:

- remove expensive backdrop filters when reduced transparency or Save-Data is requested;
- reclaim viewport space while the on-screen keyboard is open;
- preserve forced-colors and reduced-motion behavior;
- contain overscroll in work surfaces so map gestures and panel scrolling do not fight each other.

## TypeScript language contract

A v51 regression test recursively inspects `src`, `scripts` and `tests` and rejects first-party `.js`, `.jsx`, `.mjs` or `.cjs` sources. Generated `public/sw.js` remains the single intentional JavaScript deployment artifact, compiled from `src/sw/sw.ts`. The application compiler continues to enforce `allowJs: false`, strict mode, unchecked-index protection and erasable-syntax-only TypeScript.

## Release coherence

The application version is `51.0.0`. TypeScript service-worker source and generated worker use `altyapi-shell-v51` / `altyapi-data-v51`. Historical v50 tests retain their behavioral contract without pinning the product permanently to version 50; v51 owns the new responsive release assertions.
