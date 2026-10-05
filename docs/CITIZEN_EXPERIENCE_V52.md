# Ankara Kent Rehberi v52 — Accessible Interaction Contract

v52 keeps the ArcGIS 5.1 + React 19 browser-native architecture and the end-to-end strict TypeScript 7 language contract. Moving the project to a non-browser-native language would add an interoperability layer around ArcGIS JavaScript SDK without improving layer reliability. The v52 work therefore strengthens the actual citizen interaction surface instead of performing a cosmetic language rewrite.

## Keyboard contract

Legacy unmodified character shortcuts (`H`, `L`, `D`, `M`, `F`, `/`, `?`) are retired. They could be triggered accidentally by speech input and assistive technologies and are difficult to reconcile with WCAG 2.1.4 character-key guidance.

The citizen shell now uses explicit chords:

- `Alt+H`: Ankara home view
- `Alt+L`: Layers
- `Alt+D`: Map data
- `Alt+M`: map focus mode
- `Ctrl/Command+K`: address/place search
- `Ctrl/Command+/`: Help
- `Ctrl/Command+Shift+F`: fullscreen
- `Escape`: close the active tool/panel

Text-entry and composite controls remain authoritative: application shortcuts are not executed while the event originates in editable/interactive surfaces.

## Tool-dock navigation

When focus is on a Kent Rehberi tool button, Arrow keys move between tools, `Home` moves to the first tool and `End` moves to the last tool. Navigation wraps and keeps the focused item scrolled into view, which is especially important for the v51 horizontal mobile dock.

A hidden description on the tool rail exposes this interaction model to assistive technology. Keyboard-triggered commands also publish short polite announcements through a dedicated live region.

## Notification semantics

Toast cards are no longer entire buttons. Informational/success messages are polite `status` regions; errors are assertive `alert` regions. Dismissal is a dedicated labelled button. This preserves the meaning of the notification while keeping the only action explicit.

## Focus and high-contrast behavior

The v52 stylesheet is loaded after previous experience layers and provides an authoritative `:focus-visible` treatment for buttons, links, inputs, the map skip target and the panel skip target. Forced-colors and reduced-motion preferences retain dedicated behavior.

## TypeScript and release coherence

`citizenKeyboardSupervisor.ts` is included in the maximum-strict contract compiler (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`, and the existing strict flags). First-party sources remain TypeScript; the generated `public/sw.js` remains the intentional deployment artifact compiled from `src/sw/sw.ts`.

Application version and PWA shell/data cache generations are `52.0.0` / `v52`. Regression tests lock the keyboard commands, tool-dock navigation, toast semantics, focus styling, strict compiler inclusion and cache coherence.
