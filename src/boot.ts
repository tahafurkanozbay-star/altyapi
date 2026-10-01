const BOOT_TIMEOUT_MS = 4_500;

function renderBootFailure(): void {
  if (document.documentElement.dataset.appReady === "true") return;
  const root = document.getElementById("root");
  if (!root) return;

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
  explanation.textContent = "Uygulama kaynak dosya olarak değil, Vite geliştirme sunucusu veya üretim çıktısı üzerinden çalıştırılmalıdır.";
  explanation.style.cssText = "margin:0 0 12px;color:#617987";

  const commands = document.createElement("code");
  commands.textContent = "npm install\nnpm run dev";
  commands.style.cssText = "display:block;white-space:pre-wrap;border-radius:10px;background:#eef4f7;padding:12px;color:#24485c;font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

  const hint = document.createElement("p");
  hint.textContent = "Üretim kullanımı için npm run build komutundan sonra dist/ klasörünü servis edin.";
  hint.style.cssText = "margin:12px 0 0;color:#617987";

  card.append(title, explanation, commands, hint);
  screen.append(card);
  return screen;
}

window.__ALTYAPI_BOOT_TIMER__ = window.setTimeout(renderBootFailure, BOOT_TIMEOUT_MS);
