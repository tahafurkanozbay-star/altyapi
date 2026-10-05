export interface AppShortcutKeyEvent {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
  isComposing: boolean;
  defaultPrevented: boolean;
}

export type CitizenShortcutCommand =
  | "home"
  | "layers"
  | "data"
  | "focus-mode"
  | "search"
  | "help"
  | "fullscreen";

const APP_SINGLE_KEY_SHORTCUTS = new Set(["h", "l", "d", "m", "f", "/", "?"]);

export function isAppSingleKeyShortcut(key: string): boolean {
  return APP_SINGLE_KEY_SHORTCUTS.has(key.toLocaleLowerCase("tr-TR"));
}

/**
 * v52 deliberately suppresses every legacy unmodified single-key shortcut.
 * WCAG 2.1.4 requires character-key shortcuts to be disableable/remappable; using
 * explicit modifier chords instead avoids accidental activation for speech input,
 * screen-reader users and ordinary page navigation.
 */
export function shouldSuppressAppSingleKeyShortcut(
  event: AppShortcutKeyEvent,
  _interactiveTarget: boolean
): boolean {
  return isAppSingleKeyShortcut(event.key);
}

export function resolveCitizenShortcut(
  event: AppShortcutKeyEvent,
  interactiveTarget: boolean
): CitizenShortcutCommand | null {
  if (
    interactiveTarget
    || event.defaultPrevented
    || event.isComposing
    || event.repeat
  ) return null;

  const key = event.key.toLocaleLowerCase("tr-TR");
  const primary = event.ctrlKey || event.metaKey;

  if (primary && !event.altKey && !event.shiftKey && key === "k") return "search";
  if (primary && !event.altKey && !event.shiftKey && key === "/") return "help";
  if (primary && !event.altKey && event.shiftKey && key === "f") return "fullscreen";

  if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    if (key === "h") return "home";
    if (key === "l") return "layers";
    if (key === "d") return "data";
    if (key === "m") return "focus-mode";
  }

  return null;
}

export function shortcutEventDescriptor(event: KeyboardEvent): AppShortcutKeyEvent {
  return {
    key: event.key,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    repeat: event.repeat,
    isComposing: event.isComposing,
    defaultPrevented: event.defaultPrevented
  };
}
