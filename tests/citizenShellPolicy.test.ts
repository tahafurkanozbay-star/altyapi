import { describe, expect, it } from "vitest";
import {
  citizenShellContext,
  resolveCitizenDismissAction,
  type CitizenShellSnapshot
} from "../src/platform/citizenShellPolicy";

const EMPTY: CitizenShellSnapshot = {
  dialogOpen: false,
  detailsOpen: false,
  toolOpen: false,
  panelOpen: false,
  mobilePanelVisible: false,
  mobileViewport: false,
  focusMode: false
};

function snapshot(patch: Partial<CitizenShellSnapshot>): CitizenShellSnapshot {
  return { ...EMPTY, ...patch };
}

describe("citizen shell dismissal policy", () => {
  it("closes only the most local context first", () => {
    expect(resolveCitizenDismissAction(snapshot({
      dialogOpen: true,
      detailsOpen: true,
      toolOpen: true,
      panelOpen: true,
      focusMode: true
    }))).toBe("native-dialog");

    expect(resolveCitizenDismissAction(snapshot({
      detailsOpen: true,
      toolOpen: true,
      panelOpen: true,
      focusMode: true
    }))).toBe("close-details");

    expect(resolveCitizenDismissAction(snapshot({
      toolOpen: true,
      panelOpen: true,
      focusMode: true
    }))).toBe("close-tool");
  });

  it("hides a visible mobile drawer without discarding the selected panel", () => {
    const mobilePanel = snapshot({
      panelOpen: true,
      mobilePanelVisible: true,
      mobileViewport: true
    });
    expect(resolveCitizenDismissAction(mobilePanel)).toBe("hide-mobile-panel");
    expect(citizenShellContext(mobilePanel)).toBe("panel-mobile");
  });

  it("toggles a desktop panel and exits focus mode only after panels are gone", () => {
    expect(resolveCitizenDismissAction(snapshot({ panelOpen: true, focusMode: true }))).toBe("toggle-panel");
    expect(resolveCitizenDismissAction(snapshot({ focusMode: true }))).toBe("exit-focus-mode");
    expect(resolveCitizenDismissAction(EMPTY)).toBeNull();
  });

  it("reports a deterministic current shell context", () => {
    expect(citizenShellContext(EMPTY)).toBe("map");
    expect(citizenShellContext(snapshot({ focusMode: true }))).toBe("focus-mode");
    expect(citizenShellContext(snapshot({ panelOpen: true }))).toBe("panel-desktop");
    expect(citizenShellContext(snapshot({ toolOpen: true, panelOpen: true }))).toBe("tool");
    expect(citizenShellContext(snapshot({ detailsOpen: true, toolOpen: true }))).toBe("details");
    expect(citizenShellContext(snapshot({ dialogOpen: true, detailsOpen: true }))).toBe("dialog");
  });
});
