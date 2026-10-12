const SLOW_BOOT_NOTICE_MS = 4_500;
const BOOT_TIMEOUT_MS = 60_000;

function renderBootFailure(): void {
  if (document.documentElement.dataset.appReady === "true") return;
  const root = document.getElementById("root");
  if (!root) return;

  finishBoot();
  root.replaceChildren(createBootFailureCard());
}

function createBootFailureCard(): HTMLElement {
  const screen = document.createElement("div");
  screen.className = "static-boot-error";
  screen.setAttribute("role", "alert");
  screen.style.cssText = "min-height:100vh;display:grid;place-items:center;background:#f4f7f9;color:#183243;font:14px/1.65 Inter,system-ui,sans-serif;padding:24px;box-sizing:border-box";

  const card = document.createElement("div");
  card.style.cssText = "width:min(680px,100%);box-sizing:border-box;border:1px solid #dbe5eb;border-radius:20px;background:#fff;box-shadow:0 18px 52px rgba(43,72,91,.12);padding:26px";

  const title = document.createElement("strong");
  title.textContent = "Kent Rehberi başlatılamadı";
  title.style.cssText = "display:block;font-size:20px;margin-bottom:10px";

  const explanation = document.createElement("p");
  explanation.textContent = "Harita kaynakları yüklenemedi. Bağlantınızı kontrol edip sayfayı yeniden yükleyebilirsiniz.";
  explanation.style.cssText = "margin:0 0 12px;color:#617987";

  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "Sayfayı yeniden yükle";
  retry.style.cssText = "min-height:44px;border:0;border-radius:10px;background:#0b6dca;color:#fff;padding:10px 16px;font:inherit;cursor:pointer";
  retry.addEventListener("click", () => window.location.reload());

  card.append(title, explanation, retry);
  screen.append(card);
  return screen;
}

export function finishBoot(): void {
  if (window.__ALTYAPI_BOOT_TIMER__ !== undefined) {
    window.clearTimeout(window.__ALTYAPI_BOOT_TIMER__);
    delete window.__ALTYAPI_BOOT_TIMER__;
  }
}

window.__ALTYAPI_BOOT_TIMER__ = window.setTimeout(() => {
  if (document.documentElement.dataset.appReady === "true") return;
  const fallback = document.getElementById("static-boot-fallback");
  const notice = fallback?.querySelector("strong + div");
  if (notice) notice.textContent = "Hazırlık beklenenden uzun sürüyor. Bağlantınız yavaşsa biraz daha bekleyebilirsiniz.";
  window.__ALTYAPI_BOOT_TIMER__ = window.setTimeout(renderBootFailure, BOOT_TIMEOUT_MS - SLOW_BOOT_NOTICE_MS);
}, SLOW_BOOT_NOTICE_MS);

// Load the heavy app after this small, independent recovery shell is visible.
void import("./main").catch(renderBootFailure);
