import { createRoot } from "react-dom/client";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { TucbsAccessSetupHost } from "./components/TucbsAccessSetup";
import { installSceneLayerWatchdog } from "./gis/layerViewWatchdog";
import { installLayerRenderHealthStore } from "./lib/layerRenderHealth";
import { installPublicServiceWarmup } from "./lib/serviceWarmup";
import { installCitizenExperienceSupervisor } from "./platform/citizenExperienceSupervisor";
import { installRuntimeEventDomBridge } from "./platform/runtimeEventDomBridge";
import { installRuntimePressureMonitor } from "./platform/runtimePressure";
import "@arcgis/core/assets/esri/themes/light/main.css";
import "./styles/app.css";
import "./styles/runtime.css";
import "./styles/comfort-white.css";
import "./styles/ankara-brand.css";
import "./styles/tucbs-access.css";
import "./styles/experience-v43.css";
import "./styles/experience-v44.css";
import "./styles/experience-v45.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root bulunamadı.");

window.addEventListener("error", (event) => {
  console.error("[Ankara Kent Rehberi] Global error", event.error ?? event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("[Ankara Kent Rehberi] Unhandled rejection", event.reason);
});

// Application-owned events stay typed, main-thread pressure is measured at runtime,
// background GIS work yields before it can compete with interactive rendering, and
// the citizen shell keeps mobile focus/viewport behavior coherent across browsers.
installRuntimeEventDomBridge();
installRuntimePressureMonitor();
installCitizenExperienceSupervisor();
installLayerRenderHealthStore();
installSceneLayerWatchdog();
installPublicServiceWarmup();

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
      console.warn("[Ankara Kent Rehberi] Service worker kaydedilemedi", error);
    });
  });
}
