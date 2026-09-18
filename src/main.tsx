import { createRoot } from "react-dom/client";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import "@arcgis/core/assets/esri/themes/dark/main.css";
import "./styles/app.css";
import "./styles/runtime.css";

declare global {
  interface Window {
    __ALTYAPI_BOOT_TIMER__?: number;
  }
}

const root = document.getElementById("root");
if (!root) throw new Error("#root bulunamadı.");

window.addEventListener("error", (event) => {
  console.error("[Başkent 3B CBS] Global error", event.error ?? event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("[Başkent 3B CBS] Unhandled rejection", event.reason);
});

createRoot(root).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);

document.documentElement.dataset.appReady = "true";
if (window.__ALTYAPI_BOOT_TIMER__ !== undefined) {
  window.clearTimeout(window.__ALTYAPI_BOOT_TIMER__);
  delete window.__ALTYAPI_BOOT_TIMER__;
}

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).then((registration) => {
      void registration.update();
    }).catch((error) => {
      console.warn("[Başkent 3B CBS] Service worker kaydedilemedi", error);
    });
  });
}
