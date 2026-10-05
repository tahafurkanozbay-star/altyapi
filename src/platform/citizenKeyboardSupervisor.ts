import {
  resolveCitizenShortcut,
  shortcutEventDescriptor,
  type CitizenShortcutCommand
} from "../lib/globalShortcutGuard";

const TOOL_BUTTON_SELECTOR = "#kent-rehberi-tools .tool-button";
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
const LEGACY_SINGLE_KEYS = new Set(["h", "l", "d", "m", "f", "/", "?"]);

function eventPathContainsInteractiveTarget(event: KeyboardEvent): boolean {
  return event.composedPath().some((candidate) =>
    candidate instanceof HTMLElement && candidate.matches(INTERACTIVE_SELECTOR)
  );
}

function focusSearch(): boolean {
  const host = document.querySelector<HTMLElement>(".global-search");
  if (!host) return false;
  const target = host.querySelector<HTMLElement>("input, [role='combobox'], button, [tabindex='0']") ?? host;
  target.focus({ preventScroll: true });
  return true;
}

function clickButton(selector: string): boolean {
  const button = document.querySelector<HTMLButtonElement>(selector);
  if (!button || button.disabled) return false;
  button.click();
  return true;
}

function ensureAnnouncer(): HTMLElement {
  const existing = document.getElementById("kent-rehberi-keyboard-announcer");
  if (existing) return existing;
  const node = document.createElement("p");
  node.id = "kent-rehberi-keyboard-announcer";
  node.className = "visually-hidden";
  node.setAttribute("role", "status");
  node.setAttribute("aria-live", "polite");
  node.setAttribute("aria-atomic", "true");
  (document.body ?? document.documentElement).append(node);
  return node;
}

function announce(message: string): void {
  const node = ensureAnnouncer();
  node.textContent = "";
  window.requestAnimationFrame(() => {
    if (node.isConnected) node.textContent = message;
  });
}

async function toggleFullscreen(): Promise<boolean> {
  try {
    if (document.fullscreenElement) {
      if (typeof document.exitFullscreen !== "function") return false;
      await document.exitFullscreen();
      announce("Tam ekran modundan çıkıldı.");
      return true;
    }
    const request = document.documentElement.requestFullscreen;
    if (typeof request !== "function") return false;
    await request.call(document.documentElement);
    announce("Tam ekran modu açıldı.");
    return true;
  } catch {
    announce("Tam ekran modu bu tarayıcıda açılamadı.");
    return false;
  }
}

function executeCommand(command: CitizenShortcutCommand): void {
  if (command === "search") {
    if (focusSearch()) announce("Adres ve yer arama alanı.");
    return;
  }
  if (command === "help") {
    if (clickButton('button[data-panel-target="help"]')) announce("Yardım ve kısayollar paneli.");
    return;
  }
  if (command === "layers") {
    if (clickButton('button[data-panel-target="layers"]')) announce("Katmanlar paneli.");
    return;
  }
  if (command === "data") {
    if (clickButton('button[data-panel-target="data"]')) announce("Harita verisi paneli.");
    return;
  }
  if (command === "home") {
    if (clickButton('button[aria-label="Ankara başlangıç görünümü"]')) announce("Ankara başlangıç görünümüne dönülüyor.");
    return;
  }
  if (command === "focus-mode") {
    const changed = clickButton('button[aria-label="Haritaya odaklan"], button[aria-label="Odak modundan çık"]');
    if (changed) announce("Harita odak modu değiştirildi.");
    return;
  }
  void toggleFullscreen();
}

function visibleToolButtons(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>(TOOL_BUTTON_SELECTOR)]
    .filter((button) => !button.disabled && button.getAttribute("aria-hidden") !== "true");
}

function handleToolRailNavigation(event: KeyboardEvent): boolean {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  if (!(event.target instanceof Element)) return false;
  const current = event.target.closest<HTMLButtonElement>(TOOL_BUTTON_SELECTOR);
  if (!current) return false;

  const buttons = visibleToolButtons();
  const index = buttons.indexOf(current);
  if (index < 0 || buttons.length === 0) return false;

  let nextIndex: number | null = null;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % buttons.length;
  if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (index - 1 + buttons.length) % buttons.length;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = buttons.length - 1;
  if (nextIndex === null) return false;

  const next = buttons[nextIndex];
  if (!next) return false;
  event.preventDefault();
  event.stopImmediatePropagation();
  next.focus({ preventScroll: true });
  next.scrollIntoView({ block: "nearest", inline: "nearest" });
  return true;
}

export function installCitizenKeyboardSupervisor(): () => void {
  const onKeyDownCapture = (event: KeyboardEvent): void => {
    if (handleToolRailNavigation(event)) return;

    const interactiveTarget = eventPathContainsInteractiveTarget(event);
    const command = resolveCitizenShortcut(shortcutEventDescriptor(event), interactiveTarget);
    if (command) {
      event.preventDefault();
      event.stopImmediatePropagation();
      executeCommand(command);
      return;
    }

    const key = event.key.toLocaleLowerCase("tr-TR");
    if (
      !interactiveTarget
      && !event.altKey
      && !event.ctrlKey
      && !event.metaKey
      && !event.isComposing
      && LEGACY_SINGLE_KEYS.has(key)
    ) {
      // Legacy v51 character shortcuts are intentionally retired in v52. Stop the
      // React bubble listener without cancelling the browser/assistive-tech default.
      event.stopImmediatePropagation();
    }
  };

  window.addEventListener("keydown", onKeyDownCapture, true);
  return () => {
    window.removeEventListener("keydown", onKeyDownCapture, true);
    document.getElementById("kent-rehberi-keyboard-announcer")?.remove();
  };
}
