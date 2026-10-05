import {
  shortcutEventDescriptor,
  shouldSuppressAppSingleKeyShortcut
} from "../lib/globalShortcutGuard";

const MOBILE_QUERY = "(max-width: 760px)";
const COARSE_POINTER_QUERY = "(pointer: coarse)";
const HOVER_QUERY = "(hover: hover)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const HIGH_CONTRAST_QUERY = "(prefers-contrast: more)";
const FORCED_COLORS_QUERY = "(forced-colors: active)";
const STANDALONE_QUERY = "(display-mode: standalone)";
const KEYBOARD_THRESHOLD_PX = 120;
const PANEL_SELECTOR = "#kent-rehberi-panels";
const PANEL_TRIGGER_SELECTOR = "button[data-panel-target]";
const TOOL_PANEL_SELECTOR = ".map-tool-panel";
const TOOL_TRIGGER_SELECTOR = "button[data-tool-target]";
const TOOL_CLOSE_SELECTOR = ".map-tool-header button";
const EDITING_SELECTOR = [
  "input:not([type='checkbox']):not([type='radio']):not([type='range'])",
  "textarea",
  "select",
  "[contenteditable='true']",
  "[role='textbox']",
  "[role='combobox']"
].join(",");
const INTERACTIVE_SELECTOR = [
  "input",
  "textarea",
  "select",
  "button",
  "a[href]",
  "[contenteditable='true']",
  "[role='textbox']",
  "[role='combobox']",
  "[role='listbox']",
  "[role='menu']",
  "[role='dialog']"
].join(",");

interface NetworkInformationLike extends EventTarget {
  readonly saveData?: boolean;
  readonly effectiveType?: string;
}

interface NavigatorWithConnection extends Navigator {
  readonly connection?: NetworkInformationLike;
}

function setDatasetValue(element: HTMLElement, key: string, value: string): void {
  if (element.dataset[key] !== value) element.dataset[key] = value;
}

function setCssPixelVariable(element: HTMLElement, name: string, value: number): void {
  element.style.setProperty(name, `${Math.max(0, Math.round(value))}px`);
}

function isElementInside(container: Element, candidate: Element | null): boolean {
  return candidate !== null && container.contains(candidate);
}

function focusWithoutScroll(element: HTMLElement | null): void {
  element?.focus({ preventScroll: true });
}

function eventPathContainsInteractiveTarget(event: KeyboardEvent): boolean {
  return event.composedPath().some((candidate) =>
    candidate instanceof HTMLElement && candidate.matches(INTERACTIVE_SELECTOR)
  );
}

function shellDensity(width: number): "compact" | "cozy" | "comfortable" {
  if (width < 560) return "compact";
  if (width < 1040) return "cozy";
  return "comfortable";
}

export function installCitizenExperienceSupervisor(): () => void {
  const root = document.documentElement;
  const mobileQuery = window.matchMedia(MOBILE_QUERY);
  const coarsePointerQuery = window.matchMedia(COARSE_POINTER_QUERY);
  const hoverQuery = window.matchMedia(HOVER_QUERY);
  const reducedMotionQuery = window.matchMedia(REDUCED_MOTION_QUERY);
  const highContrastQuery = window.matchMedia(HIGH_CONTRAST_QUERY);
  const forcedColorsQuery = window.matchMedia(FORCED_COLORS_QUERY);
  const standaloneQuery = window.matchMedia(STANDALONE_QUERY);
  const visualViewport = window.visualViewport;
  const navigatorWithConnection = navigator as NavigatorWithConnection;
  const connection = navigatorWithConnection.connection;

  let panel: HTMLElement | null = null;
  let panelObserver: MutationObserver | null = null;
  let shellObserver: MutationObserver | null = null;
  let toolObserver: MutationObserver | null = null;
  let toolPanel: HTMLElement | null = null;
  let lastPanelTrigger: HTMLButtonElement | null = null;
  let lastToolTrigger: HTMLButtonElement | null = null;
  let panelWasVisible = false;
  let focusPanelAfterOpen = false;
  let focusToolAfterOpen = false;
  let restoreToolFocusOnClose = false;
  let activeEditingElement: HTMLElement | null = null;
  let editingVisibilityFrame = 0;

  const ensureEditingElementVisible = (): void => {
    if (!mobileQuery.matches || root.dataset.virtualKeyboard !== "open") return;
    if (!activeEditingElement?.isConnected) return;
    activeEditingElement.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: reducedMotionQuery.matches ? "auto" : "smooth"
    });
  };

  const scheduleEditingVisibility = (): void => {
    if (editingVisibilityFrame) window.cancelAnimationFrame(editingVisibilityFrame);
    editingVisibilityFrame = window.requestAnimationFrame(() => {
      editingVisibilityFrame = 0;
      ensureEditingElementVisible();
    });
  };

  const syncViewport = (): void => {
    const viewportHeight = visualViewport?.height ?? window.innerHeight;
    const viewportWidth = visualViewport?.width ?? window.innerWidth;
    const viewportOffsetTop = visualViewport?.offsetTop ?? 0;
    const keyboardInset = Math.max(0, window.innerHeight - viewportHeight - viewportOffsetTop);

    setCssPixelVariable(root, "--v44-visual-height", viewportHeight);
    setCssPixelVariable(root, "--v44-keyboard-inset", keyboardInset);
    setCssPixelVariable(root, "--v47-visual-width", viewportWidth);
    setDatasetValue(root, "virtualKeyboard", keyboardInset >= KEYBOARD_THRESHOLD_PX ? "open" : "closed");
    setDatasetValue(root, "shellDensity", shellDensity(viewportWidth));
    if (keyboardInset >= KEYBOARD_THRESHOLD_PX) scheduleEditingVisibility();
  };

  const syncDeviceCapabilities = (): void => {
    setDatasetValue(root, "viewport", mobileQuery.matches ? "mobile" : "desktop");
    setDatasetValue(root, "pointer", coarsePointerQuery.matches ? "coarse" : "fine");
    setDatasetValue(root, "hover", hoverQuery.matches ? "true" : "false");
  };

  const syncUserPreferences = (): void => {
    setDatasetValue(root, "reducedMotion", reducedMotionQuery.matches ? "true" : "false");
    setDatasetValue(
      root,
      "contrast",
      forcedColorsQuery.matches ? "forced" : highContrastQuery.matches ? "more" : "normal"
    );
    setDatasetValue(root, "displayMode", standaloneQuery.matches ? "standalone" : "browser");
  };

  const syncNetworkPreferences = (): void => {
    setDatasetValue(root, "saveData", connection?.saveData ? "true" : "false");
    const effectiveType = connection?.effectiveType;
    const networkClass = effectiveType && /^(slow-2g|2g|3g|4g)$/.test(effectiveType) ? effectiveType : "unknown";
    setDatasetValue(root, "networkClass", networkClass);
  };

  const syncVisibility = (): void => {
    setDatasetValue(root, "pageVisibility", document.visibilityState);
  };

  const syncPanelAccessibility = (): void => {
    if (!panel?.isConnected) panel = document.querySelector<HTMLElement>(PANEL_SELECTOR);
    if (!panel) return;

    const isMobile = mobileQuery.matches;
    const isVisible = !isMobile || panel.classList.contains("is-mobile-visible");

    panel.inert = !isVisible;
    if (isVisible) panel.removeAttribute("aria-hidden");
    else panel.setAttribute("aria-hidden", "true");

    for (const trigger of document.querySelectorAll<HTMLButtonElement>(PANEL_TRIGGER_SELECTOR)) {
      trigger.setAttribute("aria-controls", "kent-rehberi-panels");
      const controlsActivePanel = trigger.classList.contains("is-active");
      trigger.setAttribute("aria-expanded", String(isVisible && controlsActivePanel));
    }

    if (panelWasVisible && !isVisible) {
      const activeElement = document.activeElement instanceof Element ? document.activeElement : null;
      if (isElementInside(panel, activeElement)) focusWithoutScroll(lastPanelTrigger);
    }

    if (!panelWasVisible && isVisible && focusPanelAfterOpen) {
      focusPanelAfterOpen = false;
      window.requestAnimationFrame(() => {
        const closeButton = panel?.querySelector<HTMLElement>(
          ".mobile-panel-close, .operations-heading button, [data-panel-close]"
        ) ?? null;
        focusWithoutScroll(closeButton);
      });
    }

    panelWasVisible = isVisible;
  };

  const syncToolAccessibility = (): void => {
    const nextToolPanel = document.querySelector<HTMLElement>(TOOL_PANEL_SELECTOR);

    if (nextToolPanel && nextToolPanel !== toolPanel) {
      toolPanel = nextToolPanel;
      if (focusToolAfterOpen) {
        focusToolAfterOpen = false;
        window.requestAnimationFrame(() => {
          focusWithoutScroll(toolPanel?.querySelector<HTMLElement>(TOOL_CLOSE_SELECTOR) ?? null);
        });
      }
      return;
    }

    if (!nextToolPanel && toolPanel) {
      toolPanel = null;
      focusToolAfterOpen = false;
      if (restoreToolFocusOnClose && lastToolTrigger?.isConnected) {
        restoreToolFocusOnClose = false;
        window.requestAnimationFrame(() => focusWithoutScroll(lastToolTrigger));
      } else {
        restoreToolFocusOnClose = false;
      }
    }
  };

  const bindPanelObserver = (): boolean => {
    const nextPanel = document.querySelector<HTMLElement>(PANEL_SELECTOR);
    if (!nextPanel) return false;

    panel = nextPanel;
    panelWasVisible = !mobileQuery.matches || panel.classList.contains("is-mobile-visible");
    panelObserver?.disconnect();
    panelObserver = new MutationObserver(syncPanelAccessibility);
    panelObserver.observe(panel, { attributes: true, attributeFilter: ["class"] });
    shellObserver?.disconnect();
    shellObserver = null;
    syncPanelAccessibility();
    return true;
  };

  const onDocumentClick = (event: MouseEvent): void => {
    if (!(event.target instanceof Element)) return;

    const panelTrigger = event.target.closest<HTMLButtonElement>(PANEL_TRIGGER_SELECTOR);
    if (panelTrigger) {
      lastPanelTrigger = panelTrigger;
      focusPanelAfterOpen = mobileQuery.matches;
      window.requestAnimationFrame(syncPanelAccessibility);
    }

    const toolTrigger = event.target.closest<HTMLButtonElement>(TOOL_TRIGGER_SELECTOR);
    if (toolTrigger) {
      const opening = !toolTrigger.classList.contains("is-active");
      lastToolTrigger = toolTrigger;
      focusToolAfterOpen = opening && (mobileQuery.matches || root.dataset.inputModality === "keyboard");
      restoreToolFocusOnClose = false;
      window.requestAnimationFrame(syncToolAccessibility);
      return;
    }

    if (toolPanel && isElementInside(toolPanel, event.target) && event.target.closest(TOOL_CLOSE_SELECTOR)) {
      restoreToolFocusOnClose = true;
    }
  };

  const onKeyDownCapture = (event: KeyboardEvent): void => {
    if (event.key === "Tab") setDatasetValue(root, "inputModality", "keyboard");
    if (event.key === "Escape" && toolPanel) restoreToolFocusOnClose = true;

    if (shouldSuppressAppSingleKeyShortcut(
      shortcutEventDescriptor(event),
      eventPathContainsInteractiveTarget(event)
    )) {
      // Keep browser/assistive-technology defaults intact while preventing the app's
      // unmodified single-key shortcuts from stealing modified or text-input keystrokes.
      event.stopImmediatePropagation();
    }
  };

  const onPointerDown = (): void => {
    setDatasetValue(root, "inputModality", "pointer");
  };

  const onFocusIn = (event: FocusEvent): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.matches(EDITING_SELECTOR)) return;
    activeEditingElement = target;
    scheduleEditingVisibility();
  };

  const onFocusOut = (event: FocusEvent): void => {
    if (event.target === activeEditingElement) activeEditingElement = null;
  };

  const onMobileChange = (): void => {
    syncDeviceCapabilities();
    syncViewport();
    syncPanelAccessibility();
  };

  root.dataset.experience = "v51";
  root.dataset.inputModality = "pointer";
  syncDeviceCapabilities();
  syncUserPreferences();
  syncViewport();
  syncNetworkPreferences();
  syncVisibility();

  if (!bindPanelObserver()) {
    shellObserver = new MutationObserver(() => {
      bindPanelObserver();
    });
    shellObserver.observe(document.body ?? root, { childList: true, subtree: true });
  }

  toolObserver = new MutationObserver(syncToolAccessibility);
  toolObserver.observe(document.body ?? root, { childList: true, subtree: true });
  syncToolAccessibility();

  window.addEventListener("resize", syncViewport, { passive: true });
  window.addEventListener("keydown", onKeyDownCapture, true);
  window.addEventListener("pointerdown", onPointerDown, { passive: true, capture: true });
  visualViewport?.addEventListener("resize", syncViewport, { passive: true });
  visualViewport?.addEventListener("scroll", syncViewport, { passive: true });
  mobileQuery.addEventListener("change", onMobileChange);
  coarsePointerQuery.addEventListener("change", syncDeviceCapabilities);
  hoverQuery.addEventListener("change", syncDeviceCapabilities);
  reducedMotionQuery.addEventListener("change", syncUserPreferences);
  highContrastQuery.addEventListener("change", syncUserPreferences);
  forcedColorsQuery.addEventListener("change", syncUserPreferences);
  standaloneQuery.addEventListener("change", syncUserPreferences);
  connection?.addEventListener("change", syncNetworkPreferences);
  document.addEventListener("visibilitychange", syncVisibility);
  document.addEventListener("click", onDocumentClick, true);
  document.addEventListener("focusin", onFocusIn, true);
  document.addEventListener("focusout", onFocusOut, true);

  return () => {
    shellObserver?.disconnect();
    panelObserver?.disconnect();
    toolObserver?.disconnect();
    if (editingVisibilityFrame) window.cancelAnimationFrame(editingVisibilityFrame);
    window.removeEventListener("resize", syncViewport);
    window.removeEventListener("keydown", onKeyDownCapture, true);
    window.removeEventListener("pointerdown", onPointerDown, true);
    visualViewport?.removeEventListener("resize", syncViewport);
    visualViewport?.removeEventListener("scroll", syncViewport);
    mobileQuery.removeEventListener("change", onMobileChange);
    coarsePointerQuery.removeEventListener("change", syncDeviceCapabilities);
    hoverQuery.removeEventListener("change", syncDeviceCapabilities);
    reducedMotionQuery.removeEventListener("change", syncUserPreferences);
    highContrastQuery.removeEventListener("change", syncUserPreferences);
    forcedColorsQuery.removeEventListener("change", syncUserPreferences);
    standaloneQuery.removeEventListener("change", syncUserPreferences);
    connection?.removeEventListener("change", syncNetworkPreferences);
    document.removeEventListener("visibilitychange", syncVisibility);
    document.removeEventListener("click", onDocumentClick, true);
    document.removeEventListener("focusin", onFocusIn, true);
    document.removeEventListener("focusout", onFocusOut, true);
    root.style.removeProperty("--v44-visual-height");
    root.style.removeProperty("--v44-keyboard-inset");
    root.style.removeProperty("--v47-visual-width");
    delete root.dataset.experience;
    delete root.dataset.viewport;
    delete root.dataset.pointer;
    delete root.dataset.hover;
    delete root.dataset.virtualKeyboard;
    delete root.dataset.saveData;
    delete root.dataset.networkClass;
    delete root.dataset.pageVisibility;
    delete root.dataset.reducedMotion;
    delete root.dataset.contrast;
    delete root.dataset.displayMode;
    delete root.dataset.inputModality;
    delete root.dataset.shellDensity;
  };
}
