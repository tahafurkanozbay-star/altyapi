import { createRoot } from "react-dom/client";
import { finishBoot } from "./boot";
import "./platform/sdkAssets";
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
import { installCitizenShellSupervisor } from "./platform/citizenShellSupervisor";
import { installRuntimeEventDomBridge } from "./platform/runtimeEventDomBridge";
import { publishRuntimeEvent, subscribeRuntimeEvent } from "./platform/runtimeEvents";
import { installRuntimePressureMonitor } from "./platform/runtimePressure";
import "@arcgis/core/assets/esri/themes/light/main.css";
import "./styles/app.css";
import "./styles/runtime.css";
import "./styles/comfort-white.css";
import "./styles/ankara-brand.css";
import "./styles/tucbs-access.css";
import "./styles/citizen-shell.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root bulunamadı.");

window.addEventListener("error", () => {
  // Do not forward raw Error objects: third-party exceptions may embed signed URLs.
  console.error("[Ankara Kent Rehberi] Beklenmeyen tarayıcı hatası (ayrıntılar gizlendi).");
  publishRuntimeEvent("app-runtime-fault", {
    source: "window-error",
    message: "Beklenmeyen bir tarayıcı hatası oluştu. Haritayı yenilemek sorunu çözebilir.",
    reloadRecommended: true
  });
});

window.addEventListener("unhandledrejection", () => {
  console.error("[Ankara Kent Rehberi] Tamamlanamayan arka plan işlemi (ayrıntılar gizlendi).");
  publishRuntimeEvent("app-runtime-fault", {
    source: "unhandled-rejection",
    message: "Bir arka plan işlemi tamamlanamadı. Harita yanıt vermiyorsa sayfayı yenileyebilirsiniz.",
    reloadRecommended: true
  });
});

// Application-owned events stay typed, main-thread pressure is measured at runtime,
// keyboard commands are normalized before React handlers, the whole citizen shell
// receives one dismissal/context policy, background GIS work yields before it can
// compete with rendering, and the responsive supervisor coordinates focus/viewport state.
installRuntimeEventDomBridge();
installRuntimePressureMonitor();
installCitizenKeyboardSupervisor();
installCitizenExperienceSupervisor();
installCitizenShellSupervisor();
document.documentElement.dataset.experience = "v60";
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
finishBoot();

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
    }).catch(() => {
      console.warn("[Ankara Kent Rehberi] Service worker kaydedilemedi (ayrıntılar gizlendi).");
      publishRuntimeEvent("app-runtime-fault", {
        source: "service-worker",
        message: "Çevrimdışı destek bu oturumda başlatılamadı; canlı harita kullanılmaya devam edebilir.",
        reloadRecommended: false
      });
    });
  });
}
