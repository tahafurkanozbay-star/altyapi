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
import { installRuntimeEventDomBridge } from "./platform/runtimeEventDomBridge";
import { publishRuntimeEvent } from "./platform/runtimeEvents";
import { installRuntimePressureMonitor } from "./platform/runtimePressure";
import { installServiceWorkerLifecycle } from "./platform/serviceWorkerLifecycle";
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

// Platform observers are deliberately independent from the React tree: a panel or
// render failure cannot disable service-health, accessibility or recovery signals.
installRuntimeEventDomBridge();
installRuntimePressureMonitor();
installCitizenExperienceSupervisor();
installLayerRenderHealthStore();
installBrowserServiceHealthMemory();
installSceneLayerWatchdog();
installPublicServiceWarmup();
if (import.meta.env.PROD) installServiceWorkerLifecycle();

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
