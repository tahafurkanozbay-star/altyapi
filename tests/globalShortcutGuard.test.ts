import { describe, expect, it } from "vitest";
import {
  isAppSingleKeyShortcut,
  shouldSuppressAppSingleKeyShortcut,
  type AppShortcutKeyEvent
} from "../src/lib/globalShortcutGuard";

function event(overrides: Partial<AppShortcutKeyEvent> = {}): AppShortcutKeyEvent {
  return {
    key: "l",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false,
    defaultPrevented: false,
    ...overrides
  };
}

describe("global shortcut guard", () => {
  it("recognizes only the app's unmodified single-key shortcut set", () => {
    expect(isAppSingleKeyShortcut("L")).toBe(true);
    expect(isAppSingleKeyShortcut("/")).toBe(true);
    expect(isAppSingleKeyShortcut("?")).toBe(true);
    expect(isAppSingleKeyShortcut("Escape")).toBe(false);
    expect(isAppSingleKeyShortcut("x")).toBe(false);
  });

  it("protects browser shortcuts from single-key app handlers", () => {
    expect(shouldSuppressAppSingleKeyShortcut(event({ key: "l", ctrlKey: true }), false)).toBe(true);
    expect(shouldSuppressAppSingleKeyShortcut(event({ key: "d", metaKey: true }), false)).toBe(true);
    expect(shouldSuppressAppSingleKeyShortcut(event({ key: "f", altKey: true }), false)).toBe(true);
    expect(shouldSuppressAppSingleKeyShortcut(event({ key: "m", shiftKey: true }), false)).toBe(true);
  });

  it("allows question-mark help even though the keyboard usually reports Shift+?", () => {
    expect(shouldSuppressAppSingleKeyShortcut(event({ key: "?", shiftKey: true }), false)).toBe(false);
  });

  it("does not steal text entry, composition, held keys or already-handled events", () => {
    expect(shouldSuppressAppSingleKeyShortcut(event(), true)).toBe(true);
    expect(shouldSuppressAppSingleKeyShortcut(event({ isComposing: true }), false)).toBe(true);
    expect(shouldSuppressAppSingleKeyShortcut(event({ repeat: true }), false)).toBe(true);
    expect(shouldSuppressAppSingleKeyShortcut(event({ defaultPrevented: true }), false)).toBe(true);
  });

  it("keeps ordinary app shortcuts available on the non-interactive page surface", () => {
    expect(shouldSuppressAppSingleKeyShortcut(event({ key: "h" }), false)).toBe(false);
    expect(shouldSuppressAppSingleKeyShortcut(event({ key: "f" }), false)).toBe(false);
    expect(shouldSuppressAppSingleKeyShortcut(event({ key: "/" }), false)).toBe(false);
  });
});
