import { createRoot } from "react-dom/client";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { markRuntimeMilestone, startRuntimePerformanceMonitoring } from "./lib/runtimePerformance";
import "@arcgis/core/assets/esri/themes/light/main.css";
import "./styles/app.css";
import "./styles/runtime.css";
import "./styles/comfort-white.css";

declare global {
  interface Window {
    __ALTYAPI_BOOT_TIMER__?: number;
  }
}

startRuntimePerformanceMonitoring();
markRuntimeMilestone("bootstrap");

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
  let registration: ServiceWorkerRegistration | undefined;
  let applyingUpdate = false;

  const notifyUpdateAvailable = () => {
    if (registration?.waiting && navigator.serviceWorker.controller) {
      window.dispatchEvent(new Event("altyapi:update-available"));
    }
  };

  window.addEventListener("altyapi:apply-update", () => {
    if (!registration?.waiting) return;
    applyingUpdate = true;
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!applyingUpdate) return;
    applyingUpdate = false;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).then((nextRegistration) => {
      registration = nextRegistration;
      notifyUpdateAvailable();

      nextRegistration.addEventListener("updatefound", () => {
        const worker = nextRegistration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed") notifyUpdateAvailable();
        });
      });

      void nextRegistration.update();
    }).catch((error) => {
      console.warn("[Başkent 3B CBS] Service worker kaydedilemedi", error);
    });
  });
}
