import { createRoot } from "react-dom/client";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { TucbsAccessSetupHost } from "./components/TucbsAccessSetup";
import { installSceneLayerWatchdog } from "./gis/layerViewWatchdog";
import { installLayerRenderHealthStore } from "./lib/layerRenderHealth";
import { installPublicServiceWarmup } from "./lib/serviceWarmup";
import { installServiceWorkerClient } from "./platform/serviceWorkerClient";
import "@arcgis/core/assets/esri/themes/light/main.css";
import "./styles/app.css";
import "./styles/runtime.css";
import "./styles/comfort-white.css";
import "./styles/ankara-brand.css";
import "./styles/tucbs-access.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root bulunamadı.");

window.addEventListener("error", (event) => {
  console.error("[Ankara Kent Rehberi] Global error", event.error ?? event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("[Ankara Kent Rehberi] Unhandled rejection", event.reason);
});

// Install the render-health store before the LayerView watchdog and React. The
// runtime owns activation navigation; the watchdog observes render truth and
// only performs post-activation recovery when the transaction has completed.
installLayerRenderHealthStore();
installSceneLayerWatchdog();
installPublicServiceWarmup();
// The typed PWA client owns `altyapi:update-available` and `controllerchange`
// lifecycle handling so the application entrypoint stays declarative.
installServiceWorkerClient();

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
