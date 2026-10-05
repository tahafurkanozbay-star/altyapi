import {
  citizenShellContext,
  resolveCitizenDismissAction,
  type CitizenDismissAction,
  type CitizenShellSnapshot
} from "./citizenShellPolicy";

const MOBILE_QUERY = "(max-width: 760px)";
const PANEL_ZONE_SELECTOR = "#kent-rehberi-panels";
const PANEL_CONTENT_SELECTOR = ".main-panel, .operations-panel";
const ACTIVE_PANEL_TRIGGER_SELECTOR = "#kent-rehberi-tools button[data-panel-target].is-active";
const MOBILE_MENU_SELECTOR = ".mobile-menu";
const DETAILS_SELECTOR = ".details-drawer";
const DETAILS_CLOSE_SELECTOR = ".details-drawer button[aria-label='Detayları kapat']";
const TOOL_PANEL_SELECTOR = ".map-tool-panel";
const TOOL_CLOSE_SELECTOR = ".map-tool-header button";
const FOCUS_MODE_BUTTON_SELECTOR = ".top-icon-button[aria-pressed='true'][aria-label='Odak modundan çık']";
const DIALOG_SELECTOR = "dialog[open]";
const MOBILE_MODAL_BACKGROUND_SELECTORS = [
  "#kent-rehberi-map",
  "#kent-rehberi-tools",
  ".arcgis-navigation",
  ".status-bar"
] as const;
const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

function firstEnabledButton(selector: string): HTMLButtonElement | null {
  const button = document.querySelector<HTMLButtonElement>(selector);
  return button && !button.disabled ? button : null;
}

function clickFirstEnabled(selector: string): boolean {
  const button = firstEnabledButton(selector);
  if (!button) return false;
  button.click();
  return true;
}

export function readCitizenShellSnapshot(mobileViewport: boolean): CitizenShellSnapshot {
  const panelZone = document.querySelector<HTMLElement>(PANEL_ZONE_SELECTOR);
  const panelOpen = Boolean(panelZone?.querySelector(PANEL_CONTENT_SELECTOR));

  return {
    dialogOpen: Boolean(document.querySelector(DIALOG_SELECTOR)),
    detailsOpen: Boolean(document.querySelector(DETAILS_SELECTOR)),
    toolOpen: Boolean(document.querySelector(TOOL_PANEL_SELECTOR)),
    panelOpen,
    mobilePanelVisible: Boolean(panelZone?.classList.contains("is-mobile-visible")),
    mobileViewport,
    focusMode: Boolean(document.querySelector(FOCUS_MODE_BUTTON_SELECTOR))
  };
}

function executeDismissAction(action: Exclude<CitizenDismissAction, "native-dialog" | null>): boolean {
  switch (action) {
    case "close-details":
      return clickFirstEnabled(DETAILS_CLOSE_SELECTOR);
    case "close-tool":
      return clickFirstEnabled(TOOL_CLOSE_SELECTOR);
    case "hide-mobile-panel":
      return clickFirstEnabled(MOBILE_MENU_SELECTOR);
    case "toggle-panel":
      return clickFirstEnabled(ACTIVE_PANEL_TRIGGER_SELECTOR)
        || clickFirstEnabled(`${PANEL_ZONE_SELECTOR} [data-panel-close]`);
    case "exit-focus-mode":
      return clickFirstEnabled(FOCUS_MODE_BUTTON_SELECTOR);
  }
}

function visibleMobilePanel(): HTMLElement | null {
  if (!document.querySelector<HTMLElement>(PANEL_ZONE_SELECTOR)?.classList.contains("is-mobile-visible")) return null;
  return document.querySelector<HTMLElement>(`${PANEL_ZONE_SELECTOR} ${PANEL_CONTENT_SELECTOR}`);
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
    .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true" && !element.inert);
}

function trapMobilePanelTab(event: KeyboardEvent): boolean {
  if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey || document.querySelector(DIALOG_SELECTOR)) return false;
  const panel = visibleMobilePanel();
  if (!panel) return false;
  const focusable = focusableElements(panel);
  if (focusable.length === 0) {
    event.preventDefault();
    panel.focus({ preventScroll: true });
    return true;
  }

  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) return false;
  const active = document.activeElement;

  if (!panel.contains(active)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus({ preventScroll: true });
    return true;
  }
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus({ preventScroll: true });
    return true;
  }
  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus({ preventScroll: true });
    return true;
  }
  return false;
}

function setMobileModalBackgroundInert(inert: boolean): void {
  for (const selector of MOBILE_MODAL_BACKGROUND_SELECTORS) {
    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      if (inert) {
        if (element.inert) continue;
        element.inert = true;
        element.dataset["v54Inert"] = "true";
        continue;
      }
      if (element.dataset["v54Inert"] !== "true") continue;
      element.inert = false;
      delete element.dataset["v54Inert"];
    }
  }
}

function syncMobilePanelSemantics(mobileViewport: boolean): HTMLElement | null {
  const panelZone = document.querySelector<HTMLElement>(PANEL_ZONE_SELECTOR);
  const visible = mobileViewport && Boolean(panelZone?.classList.contains("is-mobile-visible"));
  const content = panelZone?.querySelector<HTMLElement>(PANEL_CONTENT_SELECTOR) ?? null;

  for (const surface of document.querySelectorAll<HTMLElement>(PANEL_CONTENT_SELECTOR)) {
    if (surface === content && visible) {
      surface.dataset["v53Modal"] = "true";
      surface.setAttribute("role", "dialog");
      surface.setAttribute("aria-modal", "true");
      if (!surface.hasAttribute("tabindex")) surface.tabIndex = -1;
      continue;
    }
    if (surface.dataset["v53Modal"] === "true") {
      delete surface.dataset["v53Modal"];
      surface.removeAttribute("role");
      surface.removeAttribute("aria-modal");
    }
  }

  return visible ? content : null;
}

/**
 * Page-wide interaction supervisor for the public citizen shell.
 *
 * v54 keeps React as the state owner while making the mobile workspace a truly
 * isolated modal interaction: background map controls become inert, initial
 * focus enters the drawer, focus stays bounded there and returns to the opening
 * control when the drawer is dismissed. Escape still closes exactly one
 * top-most context and native dialogs remain authoritative.
 */
export function installCitizenShellSupervisor(): () => void {
  const root = document.documentElement;
  const mobileQuery = window.matchMedia(MOBILE_QUERY);
  const body = document.body ?? root;
  let syncFrame = 0;
  let modalPanel: HTMLElement | null = null;
  let focusBeforeModal: HTMLElement | null = null;
  let focusFrame = 0;

  const cancelFocusFrame = (): void => {
    if (!focusFrame) return;
    window.cancelAnimationFrame(focusFrame);
    focusFrame = 0;
  };

  const enterMobileModal = (panel: HTMLElement): void => {
    const active = document.activeElement;
    focusBeforeModal = active instanceof HTMLElement && active !== body ? active : null;
    setMobileModalBackgroundInert(true);
    cancelFocusFrame();
    focusFrame = window.requestAnimationFrame(() => {
      focusFrame = 0;
      if (!panel.isConnected || visibleMobilePanel() !== panel || document.querySelector(DIALOG_SELECTOR)) return;
      const target = focusableElements(panel)[0] ?? panel;
      target.focus({ preventScroll: true });
    });
  };

  const leaveMobileModal = (): void => {
    cancelFocusFrame();
    setMobileModalBackgroundInert(false);
    const preferred = focusBeforeModal?.isConnected && !focusBeforeModal.inert
      ? focusBeforeModal
      : firstEnabledButton(MOBILE_MENU_SELECTOR);
    focusBeforeModal = null;
    if (!preferred) return;
    focusFrame = window.requestAnimationFrame(() => {
      focusFrame = 0;
      if (document.querySelector(DIALOG_SELECTOR)) return;
      preferred.focus({ preventScroll: true });
    });
  };

  const sync = (): void => {
    syncFrame = 0;
    const snapshot = readCitizenShellSnapshot(mobileQuery.matches);
    root.dataset["shellContext"] = citizenShellContext(snapshot);
    const nextModalPanel = syncMobilePanelSemantics(mobileQuery.matches);

    if (nextModalPanel && !modalPanel) enterMobileModal(nextModalPanel);
    else if (!nextModalPanel && modalPanel) leaveMobileModal();
    else if (nextModalPanel && modalPanel !== nextModalPanel) {
      modalPanel = nextModalPanel;
      cancelFocusFrame();
      focusFrame = window.requestAnimationFrame(() => {
        focusFrame = 0;
        (focusableElements(nextModalPanel)[0] ?? nextModalPanel).focus({ preventScroll: true });
      });
    }
    modalPanel = nextModalPanel;
  };

  const scheduleSync = (): void => {
    if (syncFrame) return;
    syncFrame = window.requestAnimationFrame(sync);
  };

  const onKeyDownCapture = (event: KeyboardEvent): void => {
    if (mobileQuery.matches && trapMobilePanelTab(event)) return;
    if (
      event.key !== "Escape"
      || event.defaultPrevented
      || event.isComposing
      || event.altKey
      || event.ctrlKey
      || event.metaKey
      || event.shiftKey
    ) return;

    const snapshot = readCitizenShellSnapshot(mobileQuery.matches);
    const action = resolveCitizenDismissAction(snapshot);
    if (!action || action === "native-dialog") return;
    if (!executeDismissAction(action)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    scheduleSync();
  };

  const onDocumentClickCapture = (event: MouseEvent): void => {
    if (!mobileQuery.matches || !(event.target instanceof Element)) return;
    const panelZone = document.querySelector<HTMLElement>(PANEL_ZONE_SELECTOR);
    if (
      !panelZone
      || event.target !== panelZone
      || !panelZone.classList.contains("is-mobile-visible")
      || !panelZone.querySelector(PANEL_CONTENT_SELECTOR)
    ) return;

    const menuButton = firstEnabledButton(MOBILE_MENU_SELECTOR);
    if (!menuButton) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    menuButton.click();
    scheduleSync();
  };

  const observer = new MutationObserver(scheduleSync);
  observer.observe(body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "open", "aria-pressed"]
  });

  const onMobileChange = (): void => scheduleSync();
  mobileQuery.addEventListener("change", onMobileChange);
  window.addEventListener("keydown", onKeyDownCapture, true);
  document.addEventListener("click", onDocumentClickCapture, true);
  sync();

  return () => {
    observer.disconnect();
    mobileQuery.removeEventListener("change", onMobileChange);
    window.removeEventListener("keydown", onKeyDownCapture, true);
    document.removeEventListener("click", onDocumentClickCapture, true);
    if (syncFrame) window.cancelAnimationFrame(syncFrame);
    cancelFocusFrame();
    setMobileModalBackgroundInert(false);
    delete root.dataset["shellContext"];
    for (const surface of document.querySelectorAll<HTMLElement>("[data-v53-modal='true']")) {
      delete surface.dataset["v53Modal"];
      surface.removeAttribute("role");
      surface.removeAttribute("aria-modal");
    }
  };
}
