import {
  resolveCitizenShortcut,
  shortcutEventDescriptor,
  shouldSuppressAppSingleKeyShortcut
} from "../lib/globalShortcutGuard";
import { executeCitizenCommand } from "./citizenActionExecutor";

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

function eventPathContainsInteractiveTarget(event: KeyboardEvent): boolean {
  return event.composedPath().some((candidate) =>
    candidate instanceof HTMLElement && candidate.matches(INTERACTIVE_SELECTOR)
  );
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
  const controller = new AbortController();

  const onKeyDownCapture = (event: KeyboardEvent): void => {
    if (handleToolRailNavigation(event)) return;

    const interactiveTarget = eventPathContainsInteractiveTarget(event);
    const descriptor = shortcutEventDescriptor(event);
    const command = resolveCitizenShortcut(descriptor, interactiveTarget);
    if (command) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void executeCitizenCommand(command)
        .then((result) => announce(result.message))
        .catch(() => announce("Klavye komutu tamamlanamadı."));
      return;
    }

    if (!interactiveTarget && shouldSuppressAppSingleKeyShortcut(descriptor, interactiveTarget)) {
      // Character-only legacy shortcuts are intentionally retired. Keep the browser
      // default intact but stop the old React bubble listener if it still exists.
      event.stopImmediatePropagation();
    }
  };

  window.addEventListener("keydown", onKeyDownCapture, {
    capture: true,
    signal: controller.signal
  });

  return () => {
    controller.abort();
    document.getElementById("kent-rehberi-keyboard-announcer")?.remove();
  };
}
