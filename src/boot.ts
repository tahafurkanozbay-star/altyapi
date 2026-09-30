declare global {
  interface Window {
    __ALTYAPI_BOOT_TIMER__?: number;
  }
}

const BOOT_TIMEOUT_MS = 12_000;

function appendText(parent: HTMLElement, tag: keyof HTMLElementTagNameMap, text: string): HTMLElement {
  const element = document.createElement(tag);
  element.textContent = text;
  parent.append(element);
  return element;
}

function showBootFallback(): void {
  if (document.documentElement.dataset.appReady === "true") return;
  const root = document.getElementById("root");
  if (!root) return;

  root.replaceChildren();
  const shell = document.createElement("div");
  shell.style.cssText = "min-height:100vh;display:grid;place-items:center;background:#f4f7f9;color:#183243;font:14px/1.65 Inter,system-ui,sans-serif;padding:24px";

  const card = document.createElement("div");
  card.style.cssText = "max-width:680px;border:1px solid #dbe5eb;border-radius:20px;background:#fff;box-shadow:0 18px 52px rgba(43,72,91,.12);padding:26px";
  appendText(card, "strong", "Ankara Kent Rehberi yüklenemedi").style.fontSize = "20px";
  const description = appendText(card, "p", "Uygulama beklenen sürede başlatılamadı. Ağ bağlantınızı kontrol edip yeniden deneyebilirsiniz.");
  description.style.color = "#6b8291";

  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "Yeniden dene";
  retry.style.cssText = "border:0;border-radius:10px;padding:10px 16px;background:#083f88;color:#fff;font:600 14px/1 system-ui,sans-serif;cursor:pointer";
  retry.addEventListener("click", () => window.location.reload());
  card.append(retry);
  shell.append(card);
  root.append(shell);
}

window.__ALTYAPI_BOOT_TIMER__ = window.setTimeout(showBootFallback, BOOT_TIMEOUT_MS);

export {};
