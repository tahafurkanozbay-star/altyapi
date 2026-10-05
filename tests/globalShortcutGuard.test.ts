import { describe, expect, it } from "vitest";
import {
  isAppSingleKeyShortcut,
  resolveCitizenShortcut,
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
  it("recognizes the retired legacy character-key set", () => {
    expect(isAppSingleKeyShortcut("L")).toBe(true);
    expect(isAppSingleKeyShortcut("/")).toBe(true);
    expect(isAppSingleKeyShortcut("?")).toBe(true);
    expect(isAppSingleKeyShortcut("Escape")).toBe(false);
    expect(isAppSingleKeyShortcut("x")).toBe(false);
  });

  it("suppresses every legacy unmodified character shortcut in v52", () => {
    for (const key of ["h", "l", "d", "m", "f", "/", "?"]) {
      expect(shouldSuppressAppSingleKeyShortcut(event({ key }), false)).toBe(true);
    }
    expect(shouldSuppressAppSingleKeyShortcut(event({ key: "Escape" }), false)).toBe(false);
  });

  it("resolves explicit Alt workspace chords", () => {
    expect(resolveCitizenShortcut(event({ key: "l", altKey: true }), false)).toBe("layers");
    expect(resolveCitizenShortcut(event({ key: "d", altKey: true }), false)).toBe("data");
    expect(resolveCitizenShortcut(event({ key: "h", altKey: true }), false)).toBe("home");
    expect(resolveCitizenShortcut(event({ key: "m", altKey: true }), false)).toBe("focus-mode");
  });

  it("resolves platform-primary search/help/fullscreen chords", () => {
    expect(resolveCitizenShortcut(event({ key: "k", ctrlKey: true }), false)).toBe("search");
    expect(resolveCitizenShortcut(event({ key: "K", metaKey: true }), false)).toBe("search");
    expect(resolveCitizenShortcut(event({ key: "/", ctrlKey: true }), false)).toBe("help");
    expect(resolveCitizenShortcut(event({ key: "/", metaKey: true }), false)).toBe("help");
    expect(resolveCitizenShortcut(event({ key: "f", ctrlKey: true, shiftKey: true }), false)).toBe("fullscreen");
    expect(resolveCitizenShortcut(event({ key: "F", metaKey: true, shiftKey: true }), false)).toBe("fullscreen");
  });

  it("does not steal text entry, composition, held keys or unrelated modifier chords", () => {
    expect(resolveCitizenShortcut(event({ key: "l", altKey: true }), true)).toBeNull();
    expect(resolveCitizenShortcut(event({ key: "k", ctrlKey: true, isComposing: true }), false)).toBeNull();
    expect(resolveCitizenShortcut(event({ key: "k", ctrlKey: true, repeat: true }), false)).toBeNull();
    expect(resolveCitizenShortcut(event({ key: "k", ctrlKey: true, defaultPrevented: true }), false)).toBeNull();
    expect(resolveCitizenShortcut(event({ key: "x", altKey: true }), false)).toBeNull();
    expect(resolveCitizenShortcut(event({ key: "l", altKey: true, shiftKey: true }), false)).toBeNull();
  });
});
