import { createRoot } from "react-dom/client";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { PlatformStatusHost } from "./components/PlatformStatusHost";
import { TucbsAccessSetupHost } from "./components/TucbsAccessSetup";
import { installSceneLayerWatchdog } from "./gis/layerViewWatchdog";
import { installBrowserServiceHealthMemory } from "./lib/browserServiceHealth";
import { installLayerRenderHealthStore } from "./lib/layerRenderHealth";
import { installPublicServiceWarmup } from "./lib/serviceWarmup";
import { installCitizenExperienceSupervisor } from "./platform/citizenExperienceSupervisor";
import { installCitizenKeyboardSupervisor } from "./platform/citizenKeyboardSupervisor";
import { installRuntimeEventDomBridge } from "./platform/runtimeEventDomBridge";
import { publishRuntimeEvent, subscribeRuntimeEvent } from "./platform/runtimeEvents";
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
import "./styles/experience-v47.css";
import "./styles/experience-v48.css";
import "./styles/experience-v49.css";
import "./styles/experience-v50.css";
import "./styles/experience-v51.css";
import "./styles/experience-v52.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root bulunamadı.");

window.addEventListener("error", (event) => {
  console.error("[Ankara Kent Rehberi] Global error", event.error ?? event.message);
  publishRuntimeEvent("app-runtime-fault", {
    source: "window-error",
    message: "Beklenmeyen bir tarayıcı hatası oluştu. Haritayı yenilemek sorunu çözebilir.",
    reloadRecommended: true
  });
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("[Ankara Kent Rehberi] Unhandled rejection", event.reason);
  publishRuntimeEvent("app-runtime-fault", {
    source: "unhandled-rejection",
    message: "Bir arka plan işlemi tamamlanamadı. Harita yanıt vermiyorsa sayfayı yenileyebilirsiniz.",
    reloadRecommended: true
  });
});

// Application-owned events stay typed, main-thread pressure is measured at runtime,
// keyboard commands are normalized before React handlers, background GIS work yields
// before it can compete with rendering, and the citizen shell coordinates responsive focus.
installRuntimeEventDomBridge();
installRuntimePressureMonitor();
installCitizenKeyboardSupervisor();
installCitizenExperienceSupervisor();
document.documentElement.dataset.experience = "v52";
installLayerRenderHealthStore();
installBrowserServiceHealthMemory();
installSceneLayerWatchdog();
installPublicServiceWarmup();

createRoot(root).render(
  <AppErrorBoundary>
    <App />
    <PlatformStatusHost />
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

  const notifyUpdateAvailable = (source: "waiting" | "installed") => {
    if (registration?.waiting && navigator.serviceWorker.controller) {
      publishRuntimeEvent("pwa-update-available", { source });
    }
  };

  const unsubscribeApplyUpdate = subscribeRuntimeEvent("pwa-apply-update", () => {
    if (!registration?.waiting) return;
    applyingUpdate = true;
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!applyingUpdate) return;
    applyingUpdate = false;
    unsubscribeApplyUpdate();
    window.location.reload();
  });

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).then((nextRegistration) => {
      registration = nextRegistration;
      notifyUpdateAvailable("waiting");

      nextRegistration.addEventListener("updatefound", () => {
        const worker = nextRegistration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed") notifyUpdateAvailable("installed");
        });
      });

      void nextRegistration.update();
    }).catch((error) => {
      console.warn("[Ankara Kent Rehberi] Service worker kaydedilemedi", error);
      publishRuntimeEvent("app-runtime-fault", {
        source: "service-worker",
        message: "Çevrimdışı destek bu oturumda başlatılamadı; canlı harita kullanılmaya devam edebilir.",
        reloadRecommended: false
      });
    });
  });
}
