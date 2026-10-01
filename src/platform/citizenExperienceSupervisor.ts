const MOBILE_QUERY = "(max-width: 760px)";
const COARSE_POINTER_QUERY = "(pointer: coarse)";
const KEYBOARD_THRESHOLD_PX = 120;
const PANEL_SELECTOR = "#kent-rehberi-panels";
const PANEL_TRIGGER_SELECTOR = "button[data-panel-target]";

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

export function installCitizenExperienceSupervisor(): () => void {
  const root = document.documentElement;
  const mobileQuery = window.matchMedia(MOBILE_QUERY);
  const coarsePointerQuery = window.matchMedia(COARSE_POINTER_QUERY);
  const visualViewport = window.visualViewport;
  const navigatorWithConnection = navigator as NavigatorWithConnection;
  const connection = navigatorWithConnection.connection;

  let panel: HTMLElement | null = null;
  let panelObserver: MutationObserver | null = null;
  let lastPanelTrigger: HTMLButtonElement | null = null;
  let panelWasVisible = false;
  let focusPanelAfterOpen = false;

  const syncViewport = (): void => {
    const viewportHeight = visualViewport?.height ?? window.innerHeight;
    const viewportOffsetTop = visualViewport?.offsetTop ?? 0;
    const keyboardInset = Math.max(0, window.innerHeight - viewportHeight - viewportOffsetTop);

    setCssPixelVariable(root, "--v44-visual-height", viewportHeight);
    setCssPixelVariable(root, "--v44-keyboard-inset", keyboardInset);
    setDatasetValue(root, "virtualKeyboard", keyboardInset >= KEYBOARD_THRESHOLD_PX ? "open" : "closed");
  };

  const syncDeviceCapabilities = (): void => {
    setDatasetValue(root, "viewport", mobileQuery.matches ? "mobile" : "desktop");
    setDatasetValue(root, "pointer", coarsePointerQuery.matches ? "coarse" : "fine");
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
    panel ??= document.querySelector<HTMLElement>(PANEL_SELECTOR);
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
        const closeButton = panel?.querySelector<HTMLElement>(".mobile-panel-close") ?? null;
        focusWithoutScroll(closeButton);
      });
    }

    panelWasVisible = isVisible;
  };

  const bindPanelObserver = (): void => {
    panel = document.querySelector<HTMLElement>(PANEL_SELECTOR);
    if (!panel) return;
    panelWasVisible = !mobileQuery.matches || panel.classList.contains("is-mobile-visible");
    panelObserver = new MutationObserver(syncPanelAccessibility);
    panelObserver.observe(panel, { attributes: true, attributeFilter: ["class"] });
    syncPanelAccessibility();
  };

  const onDocumentClick = (event: MouseEvent): void => {
    if (!(event.target instanceof Element)) return;
    const trigger = event.target.closest<HTMLButtonElement>(PANEL_TRIGGER_SELECTOR);
    if (!trigger) return;
    lastPanelTrigger = trigger;
    focusPanelAfterOpen = mobileQuery.matches;
    window.requestAnimationFrame(syncPanelAccessibility);
  };

  const onMobileChange = (): void => {
    syncDeviceCapabilities();
    syncViewport();
    syncPanelAccessibility();
  };

  root.dataset.experience = "v44";
  syncDeviceCapabilities();
  syncViewport();
  syncNetworkPreferences();
  syncVisibility();
  bindPanelObserver();

  window.addEventListener("resize", syncViewport, { passive: true });
  visualViewport?.addEventListener("resize", syncViewport, { passive: true });
  visualViewport?.addEventListener("scroll", syncViewport, { passive: true });
  mobileQuery.addEventListener("change", onMobileChange);
  coarsePointerQuery.addEventListener("change", syncDeviceCapabilities);
  connection?.addEventListener("change", syncNetworkPreferences);
  document.addEventListener("visibilitychange", syncVisibility);
  document.addEventListener("click", onDocumentClick, true);

  return () => {
    panelObserver?.disconnect();
    window.removeEventListener("resize", syncViewport);
    visualViewport?.removeEventListener("resize", syncViewport);
    visualViewport?.removeEventListener("scroll", syncViewport);
    mobileQuery.removeEventListener("change", onMobileChange);
    coarsePointerQuery.removeEventListener("change", syncDeviceCapabilities);
    connection?.removeEventListener("change", syncNetworkPreferences);
    document.removeEventListener("visibilitychange", syncVisibility);
    document.removeEventListener("click", onDocumentClick, true);
    root.style.removeProperty("--v44-visual-height");
    root.style.removeProperty("--v44-keyboard-inset");
    delete root.dataset.experience;
    delete root.dataset.viewport;
    delete root.dataset.pointer;
    delete root.dataset.virtualKeyboard;
    delete root.dataset.saveData;
    delete root.dataset.networkClass;
    delete root.dataset.pageVisibility;
  };
}
