const UPDATE_EVENT = "altyapi:update-available";
const APPLY_UPDATE_EVENT = "altyapi:apply-update";
const CLEAR_DATA_EVENT = "altyapi:clear-pwa-data";
const UPDATE_COOLDOWN_MS = 10 * 60 * 1_000;

interface WorkerCommand {
  type: "SKIP_WAITING" | "CLEAR_DATA_CACHE" | "GET_VERSION";
  requestId?: string;
}

export function installServiceWorkerClient(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

  let registration: ServiceWorkerRegistration | undefined;
  let applyingUpdate = false;
  let lastUpdateCheckAt = 0;

  const notifyUpdateAvailable = () => {
    if (registration?.waiting && navigator.serviceWorker.controller) {
      window.dispatchEvent(new Event(UPDATE_EVENT));
    }
  };

  const postToWorker = (command: WorkerCommand) => {
    const worker = registration?.waiting ?? registration?.active ?? navigator.serviceWorker.controller;
    worker?.postMessage(command);
  };

  const requestUpdate = () => {
    if (!registration || !navigator.onLine) return;
    const now = Date.now();
    if (now - lastUpdateCheckAt < UPDATE_COOLDOWN_MS) return;
    lastUpdateCheckAt = now;
    void registration.update().catch(() => undefined);
  };

  window.addEventListener(APPLY_UPDATE_EVENT, () => {
    if (!registration?.waiting) return;
    applyingUpdate = true;
    registration.waiting.postMessage({ type: "SKIP_WAITING" } satisfies WorkerCommand);
  });

  window.addEventListener(CLEAR_DATA_EVENT, () => {
    postToWorker({ type: "CLEAR_DATA_CACHE" });
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!applyingUpdate) return;
    applyingUpdate = false;
    window.location.reload();
  });

  window.addEventListener("online", requestUpdate);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) requestUpdate();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") requestUpdate();
  });

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("./sw.js", {
      updateViaCache: "none",
      scope: "./"
    }).then((nextRegistration) => {
      registration = nextRegistration;
      notifyUpdateAvailable();

      nextRegistration.addEventListener("updatefound", () => {
        const worker = nextRegistration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed") notifyUpdateAvailable();
        });
      });

      lastUpdateCheckAt = Date.now();
      void nextRegistration.update().catch(() => undefined);
    }).catch((error) => {
      console.warn("[Ankara Kent Rehberi] Service worker kaydedilemedi", error);
    });
  }, { once: true });
}
