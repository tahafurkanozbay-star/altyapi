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

const APP_SINGLE_KEY_SHORTCUTS = new Set(["h", "l", "d", "m", "f", "/", "?"]);

export function isAppSingleKeyShortcut(key: string): boolean {
  return APP_SINGLE_KEY_SHORTCUTS.has(key.toLocaleLowerCase("tr-TR"));
}

export function shouldSuppressAppSingleKeyShortcut(
  event: AppShortcutKeyEvent,
  interactiveTarget: boolean
): boolean {
  const key = event.key.toLocaleLowerCase("tr-TR");
  if (!APP_SINGLE_KEY_SHORTCUTS.has(key)) return false;

  const conflictingModifier = event.altKey
    || event.ctrlKey
    || event.metaKey
    || (event.shiftKey && key !== "?");

  return event.defaultPrevented
    || event.isComposing
    || event.repeat
    || conflictingModifier
    || interactiveTarget;
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
