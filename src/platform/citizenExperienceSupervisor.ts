import {
  shortcutEventDescriptor,
  shouldSuppressAppSingleKeyShortcut
} from "../lib/globalShortcutGuard";

const MOBILE_QUERY = "(max-width: 760px)";
const COARSE_POINTER_QUERY = "(pointer: coarse)";
const HOVER_QUERY = "(hover: hover)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const REDUCED_TRANSPARENCY_QUERY = "(prefers-reduced-transparency: reduce)";
const HIGH_CONTRAST_QUERY = "(prefers-contrast: more)";
const FORCED_COLORS_QUERY = "(forced-colors: active)";
const STANDALONE_QUERY = "(display-mode: standalone)";
const KEYBOARD_THRESHOLD_PX = 120;
const COMPACT_HEIGHT_PX = 560;
const PANEL_SELECTOR = "#kent-rehberi-panels";
const PANEL_CONTENT_SELECTOR = ".main-panel, .operations-panel";
const PANEL_TRIGGER_SELECTOR = "button[data-panel-target]";
const MOBILE_MENU_SELECTOR = ".mobile-menu";
const TOOL_PANEL_SELECTOR = ".map-tool-panel";
const TOOL_TRIGGER_SELECTOR = "button[data-tool-target]";
const TOOL_CLOSE_SELECTOR = ".map-tool-header button";
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

export function installCitizenExperienceSupervisor(): () => void {
  const root = document.documentElement;
  const mobileQuery = window.matchMedia(MOBILE_QUERY);
  const coarsePointerQuery = window.matchMedia(COARSE_POINTER_QUERY);
  const hoverQuery = window.matchMedia(HOVER_QUERY);
  const reducedMotionQuery = window.matchMedia(REDUCED_MOTION_QUERY);
  const reducedTransparencyQuery = window.matchMedia(REDUCED_TRANSPARENCY_QUERY);
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

  const mobilePanelIsVisible = (): boolean =>
    Boolean(panel?.isConnected && panel.classList.contains("is-mobile-visible"));

  const mobileMenuButton = (): HTMLButtonElement | null =>
    document.querySelector<HTMLButtonElement>(MOBILE_MENU_SELECTOR);

  const activePanelTrigger = (): HTMLButtonElement | null =>
    document.querySelector<HTMLButtonElement>(`${PANEL_TRIGGER_SELECTOR}.is-active`);

  const layersPanelTrigger = (): HTMLButtonElement | null =>
    document.querySelector<HTMLButtonElement>(`${PANEL_TRIGGER_SELECTOR}[data-panel-target="layers"]`);

  const syncViewport = (): void => {
    const viewportHeight = visualViewport?.height ?? window.innerHeight;
    const viewportWidth = visualViewport?.width ?? window.innerWidth;
    const viewportOffsetTop = visualViewport?.offsetTop ?? 0;
    const keyboardInset = Math.max(0, window.innerHeight - viewportHeight - viewportOffsetTop);

    setCssPixelVariable(root, "--v44-visual-height", viewportHeight);
    setCssPixelVariable(root, "--v44-keyboard-inset", keyboardInset);
    setCssPixelVariable(root, "--v47-visual-width", viewportWidth);
    setDatasetValue(root, "virtualKeyboard", keyboardInset >= KEYBOARD_THRESHOLD_PX ? "open" : "closed");
    setDatasetValue(root, "orientation", viewportWidth > viewportHeight ? "landscape" : "portrait");
    setDatasetValue(root, "compactHeight", viewportHeight <= COMPACT_HEIGHT_PX ? "true" : "false");
  };

  const syncDeviceCapabilities = (): void => {
    setDatasetValue(root, "viewport", mobileQuery.matches ? "mobile" : "desktop");
    setDatasetValue(root, "pointer", coarsePointerQuery.matches ? "coarse" : "fine");
    setDatasetValue(root, "hover", hoverQuery.matches ? "true" : "false");
  };

  const syncUserPreferences = (): void => {
    setDatasetValue(root, "reducedMotion", reducedMotionQuery.matches ? "true" : "false");
    setDatasetValue(root, "reducedTransparency", reducedTransparencyQuery.matches ? "true" : "false");
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
    if (!panel) {
      setDatasetValue(root, "panelVisibility", "closed");
      return;
    }

    const isMobile = mobileQuery.matches;
    const isVisible = !isMobile || panel.classList.contains("is-mobile-visible");
    const hasContent = Boolean(panel.querySelector(PANEL_CONTENT_SELECTOR));

    panel.inert = !isVisible || !hasContent;
    if (isVisible && hasContent) panel.removeAttribute("aria-hidden");
    else panel.setAttribute("aria-hidden", "true");
    setDatasetValue(root, "panelVisibility", isVisible && hasContent ? "open" : "closed");

    for (const trigger of document.querySelectorAll<HTMLButtonElement>(PANEL_TRIGGER_SELECTOR)) {
      trigger.setAttribute("aria-controls", "kent-rehberi-panels");
      const controlsActivePanel = trigger.classList.contains("is-active");
      trigger.setAttribute("aria-expanded", String(isVisible && hasContent && controlsActivePanel));
    }

    if (panelWasVisible && (!isVisible || !hasContent)) {
      const activeElement = document.activeElement instanceof Element ? document.activeElement : null;
      if (isElementInside(panel, activeElement)) focusWithoutScroll(lastPanelTrigger);
    }

    if (!panelWasVisible && isVisible && hasContent && focusPanelAfterOpen) {
      focusPanelAfterOpen = false;
      window.requestAnimationFrame(() => {
        const closeButton = panel?.querySelector<HTMLElement>(
          ".mobile-panel-close, .operations-heading button, [data-panel-close]"
        ) ?? null;
        focusWithoutScroll(closeButton);
      });
    }

    panelWasVisible = isVisible && hasContent;
  };

  const syncToolAccessibility = (): void => {
    const nextToolPanel = document.querySelector<HTMLElement>(TOOL_PANEL_SELECTOR);

    if (nextToolPanel && nextToolPanel !== toolPanel) {
      toolPanel = nextToolPanel;
      setDatasetValue(root, "toolVisibility", "open");
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
      setDatasetValue(root, "toolVisibility", "closed");
      focusToolAfterOpen = false;
      if (restoreToolFocusOnClose && lastToolTrigger?.isConnected) {
        restoreToolFocusOnClose = false;
        window.requestAnimationFrame(() => focusWithoutScroll(lastToolTrigger));
      } else {
        restoreToolFocusOnClose = false;
      }
      return;
    }

    setDatasetValue(root, "toolVisibility", nextToolPanel ? "open" : "closed");
  };

  const hideMobilePanelForTool = (): void => {
    if (!mobileQuery.matches || !mobilePanelIsVisible()) return;
    const closeButton = panel?.querySelector<HTMLButtonElement>(
      ".mobile-panel-close, .operations-heading button, [data-panel-close]"
    ) ?? null;
    closeButton?.click();

    window.requestAnimationFrame(() => {
      if (!mobilePanelIsVisible()) return;
      mobileMenuButton()?.click();
    });
  };

  const closeToolForMobilePanel = (): void => {
    if (!mobileQuery.matches || !toolPanel) return;
    const closeButton = toolPanel.querySelector<HTMLButtonElement>(TOOL_CLOSE_SELECTOR);
    if (closeButton) {
      restoreToolFocusOnClose = false;
      closeButton.click();
    }
  };

  const bindPanelObserver = (): boolean => {
    const nextPanel = document.querySelector<HTMLElement>(PANEL_SELECTOR);
    if (!nextPanel) return false;

    panel = nextPanel;
    panelWasVisible = !mobileQuery.matches || (
      panel.classList.contains("is-mobile-visible") && Boolean(panel.querySelector(PANEL_CONTENT_SELECTOR))
    );
    panelObserver?.disconnect();
    panelObserver = new MutationObserver(syncPanelAccessibility);
    panelObserver.observe(panel, { attributes: true, attributeFilter: ["class"], childList: true, subtree: true });
    shellObserver?.disconnect();
    shellObserver = null;
    syncPanelAccessibility();
    return true;
  };

  const onDocumentClick = (event: MouseEvent): void => {
    if (!(event.target instanceof Element)) return;

    const mobileMenu = event.target.closest<HTMLButtonElement>(MOBILE_MENU_SELECTOR);
    if (mobileMenu && mobileQuery.matches && !activePanelTrigger()) {
      const layersTrigger = layersPanelTrigger();
      if (layersTrigger) {
        event.preventDefault();
        event.stopImmediatePropagation();
        lastPanelTrigger = layersTrigger;
        focusPanelAfterOpen = true;
        closeToolForMobilePanel();
        layersTrigger.click();
        return;
      }
    }

    const panelTrigger = event.target.closest<HTMLButtonElement>(PANEL_TRIGGER_SELECTOR);
    if (panelTrigger) {
      const controlsActivePanel = panelTrigger.classList.contains("is-active");
      const revealingHiddenPanel = mobileQuery.matches && controlsActivePanel && !mobilePanelIsVisible();

      lastPanelTrigger = panelTrigger;
      focusPanelAfterOpen = mobileQuery.matches;

      if (revealingHiddenPanel) {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeToolForMobilePanel();
        mobileMenuButton()?.click();
        window.requestAnimationFrame(syncPanelAccessibility);
        return;
      }

      if (mobileQuery.matches && !controlsActivePanel) closeToolForMobilePanel();
      window.requestAnimationFrame(syncPanelAccessibility);
    }

    const toolTrigger = event.target.closest<HTMLButtonElement>(TOOL_TRIGGER_SELECTOR);
    if (toolTrigger) {
      const opening = !toolTrigger.classList.contains("is-active");
      if (opening) hideMobilePanelForTool();
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

  const onMobileChange = (): void => {
    syncDeviceCapabilities();
    syncViewport();
    syncPanelAccessibility();
  };

  root.dataset.experience = "v51";
  root.dataset.inputModality = "pointer";
  root.dataset.panelVisibility = "closed";
  root.dataset.toolVisibility = "closed";
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
  reducedTransparencyQuery.addEventListener("change", syncUserPreferences);
  highContrastQuery.addEventListener("change", syncUserPreferences);
  forcedColorsQuery.addEventListener("change", syncUserPreferences);
  standaloneQuery.addEventListener("change", syncUserPreferences);
  connection?.addEventListener("change", syncNetworkPreferences);
  document.addEventListener("visibilitychange", syncVisibility);
  document.addEventListener("click", onDocumentClick, true);

  return () => {
    shellObserver?.disconnect();
    panelObserver?.disconnect();
    toolObserver?.disconnect();
    window.removeEventListener("resize", syncViewport);
    window.removeEventListener("keydown", onKeyDownCapture, true);
    window.removeEventListener("pointerdown", onPointerDown, true);
    visualViewport?.removeEventListener("resize", syncViewport);
    visualViewport?.removeEventListener("scroll", syncViewport);
    mobileQuery.removeEventListener("change", onMobileChange);
    coarsePointerQuery.removeEventListener("change", syncDeviceCapabilities);
    hoverQuery.removeEventListener("change", syncDeviceCapabilities);
    reducedMotionQuery.removeEventListener("change", syncUserPreferences);
    reducedTransparencyQuery.removeEventListener("change", syncUserPreferences);
    highContrastQuery.removeEventListener("change", syncUserPreferences);
    forcedColorsQuery.removeEventListener("change", syncUserPreferences);
    standaloneQuery.removeEventListener("change", syncUserPreferences);
    connection?.removeEventListener("change", syncNetworkPreferences);
    document.removeEventListener("visibilitychange", syncVisibility);
    document.removeEventListener("click", onDocumentClick, true);
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
    delete root.dataset.reducedTransparency;
    delete root.dataset.contrast;
    delete root.dataset.displayMode;
    delete root.dataset.inputModality;
    delete root.dataset.orientation;
    delete root.dataset.compactHeight;
    delete root.dataset.panelVisibility;
    delete root.dataset.toolVisibility;
  };
}
