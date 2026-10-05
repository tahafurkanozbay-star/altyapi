import { shortcutFor, type CitizenShortcutCommand } from "./citizenActions";

const COMMAND_BUTTON_SELECTOR = "button[data-command-target]";
const FOCUSABLE_SELECTOR = [
  "input:not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  "button:not([disabled])",
  "a[href]",
  "[role='combobox']",
  "[role='textbox']",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

export interface CitizenActionExecutionResult {
  command: CitizenShortcutCommand;
  handled: boolean;
  message: string;
}

function isUsable(element: HTMLElement): boolean {
  if (element.hidden || element.inert || element.getAttribute("aria-hidden") === "true") return false;
  if (element instanceof HTMLButtonElement && element.disabled) return false;
  if (element instanceof HTMLInputElement && element.disabled) return false;
  return true;
}

function firstDeepFocusable(root: ParentNode): HTMLElement | null {
  for (const candidate of root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) {
    if (isUsable(candidate)) return candidate;
  }

  for (const candidate of root.querySelectorAll<HTMLElement>("*")) {
    const shadowRoot = candidate.shadowRoot;
    if (!shadowRoot) continue;
    const nested = firstDeepFocusable(shadowRoot);
    if (nested) return nested;
  }
  return null;
}

function focusGlobalSearch(): boolean {
  const host = document.querySelector<HTMLElement>(".global-search");
  if (!host) return false;
  const target = firstDeepFocusable(host) ?? firstDeepFocusable(host.shadowRoot ?? host) ?? host;
  if (!isUsable(target)) return false;
  target.focus({ preventScroll: true });
  return true;
}

function commandButton(command: CitizenShortcutCommand): HTMLButtonElement | null {
  const exact = document.querySelector<HTMLButtonElement>(`${COMMAND_BUTTON_SELECTOR}[data-command-target="${command}"]`);
  if (exact && !exact.disabled) return exact;

  if (command === "focus-mode") {
    return document.querySelector<HTMLButtonElement>(
      '.top-icon-button[aria-label="Haritaya odaklan"], .top-icon-button[aria-label="Odak modundan çık"]'
    );
  }
  return null;
}

async function toggleFullscreen(): Promise<boolean> {
  try {
    if (document.fullscreenElement) {
      if (typeof document.exitFullscreen !== "function") return false;
      await document.exitFullscreen();
      return true;
    }
    const request = document.documentElement.requestFullscreen;
    if (typeof request !== "function") return false;
    await request.call(document.documentElement);
    return true;
  } catch {
    return false;
  }
}

export async function executeCitizenCommand(command: CitizenShortcutCommand): Promise<CitizenActionExecutionResult> {
  const label = shortcutFor(command).label;

  if (command === "search") {
    const handled = focusGlobalSearch();
    return {
      command,
      handled,
      message: handled ? "Adres ve yer arama alanı hazır." : "Arama alanına odaklanılamadı."
    };
  }

  if (command === "fullscreen") {
    const exiting = Boolean(document.fullscreenElement);
    const handled = await toggleFullscreen();
    return {
      command,
      handled,
      message: handled
        ? (exiting ? "Tam ekran modundan çıkıldı." : "Tam ekran modu açıldı.")
        : "Tam ekran modu bu tarayıcıda açılamadı."
    };
  }

  const button = commandButton(command);
  if (!button) {
    return { command, handled: false, message: `${label} komutu şu anda kullanılamıyor.` };
  }

  button.click();
  return { command, handled: true, message: `${label} komutu uygulandı.` };
}
