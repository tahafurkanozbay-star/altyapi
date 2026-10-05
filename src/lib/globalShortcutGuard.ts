import {
  CITIZEN_SHORTCUTS,
  type CitizenShortcutCommand,
  type CitizenShortcutDefinition
} from "../platform/citizenActions";

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

export type { CitizenShortcutCommand } from "../platform/citizenActions";

const APP_SINGLE_KEY_SHORTCUTS = new Set(["h", "l", "d", "m", "f", "/", "?"]);

export function isAppSingleKeyShortcut(key: string): boolean {
  return APP_SINGLE_KEY_SHORTCUTS.has(key.toLocaleLowerCase("tr-TR"));
}

/**
 * Character-only shortcuts stay disabled. Modifier chords live in one typed
 * registry so the keyboard supervisor, visible help and aria-keyshortcuts can
 * never silently drift apart.
 */
export function shouldSuppressAppSingleKeyShortcut(
  event: AppShortcutKeyEvent,
  _interactiveTarget: boolean
): boolean {
  return isAppSingleKeyShortcut(event.key);
}

function shortcutMatches(event: AppShortcutKeyEvent, shortcut: CitizenShortcutDefinition): boolean {
  const key = event.key.toLocaleLowerCase("tr-TR");
  const primary = event.ctrlKey || event.metaKey;
  return key === shortcut.key
    && event.altKey === shortcut.alt
    && primary === shortcut.primary
    && event.shiftKey === shortcut.shift;
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

  return CITIZEN_SHORTCUTS.find((shortcut) => shortcutMatches(event, shortcut))?.command ?? null;
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
