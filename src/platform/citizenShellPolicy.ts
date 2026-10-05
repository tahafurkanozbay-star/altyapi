export type CitizenShellContext =
  | "dialog"
  | "details"
  | "tool"
  | "panel-mobile"
  | "panel-desktop"
  | "focus-mode"
  | "map";

export type CitizenDismissAction =
  | "native-dialog"
  | "close-details"
  | "close-tool"
  | "hide-mobile-panel"
  | "toggle-panel"
  | "exit-focus-mode"
  | null;

export interface CitizenShellSnapshot {
  dialogOpen: boolean;
  detailsOpen: boolean;
  toolOpen: boolean;
  panelOpen: boolean;
  mobilePanelVisible: boolean;
  mobileViewport: boolean;
  focusMode: boolean;
}

/**
 * Single source of truth for page-wide dismissal priority.
 *
 * The most local transient surface closes first so Escape never tears down a
 * broader workspace context behind the thing the user is currently reading.
 */
export function resolveCitizenDismissAction(snapshot: Readonly<CitizenShellSnapshot>): CitizenDismissAction {
  if (snapshot.dialogOpen) return "native-dialog";
  if (snapshot.detailsOpen) return "close-details";
  if (snapshot.toolOpen) return "close-tool";
  if (snapshot.panelOpen && snapshot.mobileViewport && snapshot.mobilePanelVisible) return "hide-mobile-panel";
  if (snapshot.panelOpen) return "toggle-panel";
  if (snapshot.focusMode) return "exit-focus-mode";
  return null;
}

export function citizenShellContext(snapshot: Readonly<CitizenShellSnapshot>): CitizenShellContext {
  if (snapshot.dialogOpen) return "dialog";
  if (snapshot.detailsOpen) return "details";
  if (snapshot.toolOpen) return "tool";
  if (snapshot.panelOpen && snapshot.mobileViewport && snapshot.mobilePanelVisible) return "panel-mobile";
  if (snapshot.panelOpen) return "panel-desktop";
  if (snapshot.focusMode) return "focus-mode";
  return "map";
}
