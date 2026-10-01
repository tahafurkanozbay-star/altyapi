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

  const card = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = "Kent Rehberi başlatılamadı";

  const explanation = document.createElement("p");
  explanation.textContent = "Uygulama kaynak dosya olarak değil, Vite geliştirme sunucusu veya üretim çıktısı üzerinden çalıştırılmalıdır.";

  const commands = document.createElement("code");
  commands.textContent = "npm install\nnpm run dev";

  const hint = document.createElement("p");
  hint.textContent = "Üretim kullanımı için npm run build komutundan sonra dist/ klasörünü servis edin.";

  card.append(title, explanation, commands, hint);
  screen.append(card);
  return screen;
}

window.__ALTYAPI_BOOT_TIMER__ = window.setTimeout(renderBootFailure, BOOT_TIMEOUT_MS);
