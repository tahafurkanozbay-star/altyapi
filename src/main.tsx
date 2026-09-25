import { createRoot } from "react-dom/client";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { TucbsAccessSetupHost } from "./components/TucbsAccessSetup";
import { installSceneLayerWatchdog } from "./gis/layerViewWatchdog";
import { installLayerRenderHealthStore } from "./lib/layerRenderHealth";
import "@arcgis/core/assets/esri/themes/light/main.css";
import "./styles/app.css";
import "./styles/runtime.css";
import "./styles/comfort-white.css";
import "./styles/ankara-brand.css";
import "./styles/tucbs-access.css";

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

// Install the render-health store before the watchdog and React. This keeps
// LayerView readiness across panel unmount/remount cycles and guarantees that
// no fast cached LayerView event races past the citizen-facing status bridge.
installLayerRenderHealthStore();
installSceneLayerWatchdog();

createRoot(root).render(
  <AppErrorBoundary>
    <App />
    <TucbsAccessSetupHost />
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
