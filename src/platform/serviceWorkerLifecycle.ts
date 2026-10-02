import { publishRuntimeEvent, subscribeRuntimeEvent } from "./runtimeEvents";

const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1_000;

/**
 * Owns PWA registration/update lifecycle outside the React tree. Registration is
 * resilient to late module execution, update checks resume on reconnect/focus,
 * and all application-facing messages use the typed runtime event bus.
 */
export function installServiceWorkerLifecycle(scriptUrl = "./sw.js"): () => void {
  if (!("serviceWorker" in navigator)) return () => undefined;

  let disposed = false;
  let registration: ServiceWorkerRegistration | undefined;
  let registerPromise: Promise<void> | undefined;
  let applyingUpdate = false;
  let lastUpdateCheck = 0;

  const announceWaitingWorker = (source: "waiting" | "installed"): void => {
    if (registration?.waiting && navigator.serviceWorker.controller) {
      publishRuntimeEvent("pwa-update-available", { source });
    }
  };

  const checkForUpdate = async (force = false): Promise<void> => {
    if (disposed || !registration || !navigator.onLine) return;
    const now = Date.now();
    if (!force && now - lastUpdateCheck < UPDATE_CHECK_INTERVAL_MS) return;
    lastUpdateCheck = now;
    try {
      await registration.update();
    } catch (error) {
      console.warn("[Ankara Kent Rehberi] Service worker güncelleme kontrolü tamamlanamadı", error);
    }
  };

  const bindRegistration = (nextRegistration: ServiceWorkerRegistration): void => {
    registration = nextRegistration;
    announceWaitingWorker("waiting");

    nextRegistration.addEventListener("updatefound", () => {
      const worker = nextRegistration.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed") announceWaitingWorker("installed");
      });
    });
  };

  const register = (): Promise<void> => {
    registerPromise ??= navigator.serviceWorker.register(scriptUrl, { updateViaCache: "none" })
      .then(async (nextRegistration) => {
        if (disposed) return;
        bindRegistration(nextRegistration);
        await checkForUpdate(true);
      })
      .catch((error: unknown) => {
        console.warn("[Ankara Kent Rehberi] Service worker kaydedilemedi", error);
        publishRuntimeEvent("app-runtime-fault", {
          source: "service-worker",
          message: "Çevrimdışı destek bu oturumda başlatılamadı; canlı harita kullanılmaya devam edebilir.",
          reloadRecommended: false
        });
      });
    return registerPromise;
  };

  const unsubscribeApplyUpdate = subscribeRuntimeEvent("pwa-apply-update", () => {
    if (!registration?.waiting) return;
    applyingUpdate = true;
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
  });

  const onControllerChange = (): void => {
    if (!applyingUpdate || disposed) return;
    applyingUpdate = false;
    window.location.reload();
  };

  const onLoad = (): void => {
    void register();
  };

  const onOnline = (): void => {
    void register().then(() => checkForUpdate(true));
  };

  const onVisibilityChange = (): void => {
    if (document.visibilityState === "visible") void register().then(() => checkForUpdate(false));
  };

  navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisibilityChange);

  if (document.readyState === "complete") queueMicrotask(() => void register());
  else window.addEventListener("load", onLoad, { once: true });

  return () => {
    disposed = true;
    unsubscribeApplyUpdate();
    navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("load", onLoad);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
