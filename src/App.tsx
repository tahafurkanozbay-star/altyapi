import { ViewTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArcGISRuntime } from "./gis/ArcGISRuntime";
import { LayerLoadScheduler, type LayerLoadPriority } from "./gis/layerLoadScheduler";
import { loadServiceCatalog } from "./lib/catalog";
import { detectPerformanceProfile } from "./lib/performance";
import { encodeShareState, decodeShareState } from "./lib/urlState";
import { loadPreferences, saveCamera, savePreferences } from "./lib/storage";
import { appendIncident, createIncident, loadIncidentJournal, type IncidentInput } from "./lib/incidentJournal";
import { publicErrorMessage } from "./lib/publicError";
import {
  applyServiceHealthSnapshot,
  failurePatch,
  loadServiceHealthSnapshot,
  shouldAutoLoadService,
  successPatch
} from "./lib/serviceHealth";
import {
  applyServiceNavigationSnapshot,
  formatScale,
  loadServiceNavigationSnapshot
} from "./lib/serviceNavigation";
import {
  mergeCapturedLayerOrder,
  moveVisibleLayer,
  normalizeLayerOrder,
  visibleLayerOrder
} from "./lib/workspaceView";
import type {
  AppPreferences,
  AttributeQueryOptions,
  AttributeTableResult,
  Bookmark,
  CameraState,
  IdentifyResult,
  LayerOrderDirection,
  PanelId,
  PerformanceProfile,
  RuntimeIncident,
  SceneTelemetry,
  ServiceDefinition,
  ToolId
} from "./types";
import { useToastQueue } from "./hooks/useToastQueue";
import { LayerExplorer } from "./components/LayerExplorer";
import { ToolRail } from "./components/ToolRail";
import { StatusBar } from "./components/StatusBar";
import { DetailsPanel } from "./components/DetailsPanel";
import { OperationsPanel } from "./components/OperationsPanel";
import { BookmarkDialog } from "./components/BookmarkDialog";
import { ToastStack } from "./components/ToastStack";
import { Icon } from "./components/Icon";

const DEFAULT_CAMERA: CameraState = { longitude: 32.8542, latitude: 39.9208, z: 5200, heading: 2, tilt: 58 };
const basemaps = [
  ["hybrid", "Hibrit"],
  ["satellite", "Uydu"],
  ["topo-vector", "Topoğrafik"],
  ["streets-vector", "Sokak"],
  ["dark-gray-vector", "Koyu Gri"],
  ["gray-vector", "Açık Gri"]
] as const;

export default function App() {
  const initialPreferences = useMemo(() => loadPreferences(), []);
  const effectivePerformance: PerformanceProfile = useMemo(() => detectPerformanceProfile(), []);
  const layerLoadScheduler = useMemo(() => new LayerLoadScheduler(effectivePerformance), [effectivePerformance]);
  const [preferences, setPreferences] = useState<AppPreferences>(initialPreferences);
  const [services, setServices] = useState<ServiceDefinition[]>([]);
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelId>("layers");
  const [activeTool, setActiveTool] = useState<ToolId>(null);
  const [identify, setIdentify] = useState<IdentifyResult | null>(null);
  const [telemetry, setTelemetry] = useState<SceneTelemetry>({ altitude: DEFAULT_CAMERA.z, tilt: DEFAULT_CAMERA.tilt, heading: DEFAULT_CAMERA.heading });
  const [mobilePanelsVisible, setMobilePanelsVisible] = useState(true);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [focusMode, setFocusMode] = useState(false);
  const [bookmarkDialogOpen, setBookmarkDialogOpen] = useState(false);
  const { items: toasts, pushToast, dismissToast } = useToastQueue();

  const mapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const navigationRef = useRef<HTMLDivElement>(null);
  const toolHostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<ArcGISRuntime | null>(null);
  const navigationCleanupRef = useRef<(() => void) | null>(null);
  const servicesRef = useRef<ServiceDefinition[]>([]);
  const incidentsRef = useRef<RuntimeIncident[]>(loadIncidentJournal());

  const shellMetrics = useMemo(() => ({
    active: services.filter((service) => service.visible).length,
    loading: services.filter((service) => service.status === "loading").length,
    error: services.filter((service) => service.status === "error").length
  }), [services]);

  const effectiveLayerOrder = useMemo(
    () => normalizeLayerOrder(preferences.layerOrder, services.map((service) => service.id)),
    [preferences.layerOrder, services]
  );

  useEffect(() => { servicesRef.current = services; }, [services]);

  const recordIncident = useCallback((input: IncidentInput) => {
    incidentsRef.current = appendIncident(incidentsRef.current, createIncident(input));
  }, []);

  const patchService = useCallback((id: string, patch: Partial<ServiceDefinition>) => {
    setServices((current) => current.map((service) => service.id === id ? { ...service, ...patch } : service));
    servicesRef.current = servicesRef.current.map((service) => service.id === id ? { ...service, ...patch } : service);
  }, []);

  const persistLayerPreferences = useCallback((nextServices: ServiceDefinition[]) => {
    setPreferences((current) => {
      const next: AppPreferences = {
        ...current,
        layerVisibility: Object.fromEntries(nextServices.map((service) => [service.id, service.visible])),
        layerOpacity: Object.fromEntries(nextServices.map((service) => [service.id, service.opacity])),
        layerOrder: normalizeLayerOrder(current.layerOrder, nextServices.map((service) => service.id)),
        favorites: nextServices.filter((service) => service.favorite).map((service) => service.id)
      };
      savePreferences(next);
      return next;
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = "light";
  }, []);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      pushToast("İnternet bağlantısı yeniden kuruldu.", "success");
      recordIncident({ severity: "info", kind: "network", message: "Ağ bağlantısı yeniden kuruldu.", recovered: true });
    };
    const onOffline = () => {
      setOnline(false);
      pushToast("İnternet bağlantısı kesildi. Bazı harita katmanları geçici olarak açılamayabilir.", "error");
      recordIncident({ severity: "warning", kind: "network", message: "Tarayıcı çevrimdışı duruma geçti." });
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [pushToast, recordIncident]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    void (async () => {
      try {
        const [catalog, healthSnapshot, navigationSnapshot] = await Promise.all([
          loadServiceCatalog("./services.json", controller.signal),
          loadServiceHealthSnapshot("./service-health.json", controller.signal),
          loadServiceNavigationSnapshot("./service-navigation.json", controller.signal)
        ]);
        if (cancelled || !mapRef.current) return;

        const share = decodeShareState(new URLSearchParams(location.search));
        const favoriteSet = new Set(initialPreferences.favorites);
        const sharedLayers = share ? new Set(share.layerIds) : null;
        const healthCatalog = applyServiceHealthSnapshot(catalog, healthSnapshot);
        const enrichedCatalog = applyServiceNavigationSnapshot(healthCatalog, navigationSnapshot);
        let suppressedRestores = 0;
        const restored = enrichedCatalog.map((service) => {
          const requestedVisible = sharedLayers
            ? sharedLayers.has(service.id)
            : (initialPreferences.layerVisibility[service.id] ?? false);
          const visible = requestedVisible && shouldAutoLoadService(service);
          if (requestedVisible && !visible) suppressedRestores += 1;
          return {
            ...service,
            visible,
            opacity: initialPreferences.layerOpacity[service.id] ?? service.opacity,
            favorite: favoriteSet.has(service.id)
          };
        });

        if (!restored.some((service) => service.visible)) {
          const preferred = [
            restored.find((service) => service.kind === "SceneServer" && shouldAutoLoadService(service)),
            restored.find((service) => service.kind === "FeatureServer" && shouldAutoLoadService(service))
          ].filter(Boolean) as ServiceDefinition[];
          for (const service of preferred) service.visible = true;
        }

        const allServiceIds = restored.map((service) => service.id);
        const restoredOrder = share
          ? mergeCapturedLayerOrder(initialPreferences.layerOrder, share.layerIds, allServiceIds)
          : normalizeLayerOrder(initialPreferences.layerOrder, allServiceIds);
        const restoredBasemap = share?.basemap ?? initialPreferences.basemap;

        setServices(restored);
        servicesRef.current = restored;
        setPreferences((current) => ({ ...current, basemap: restoredBasemap, layerOrder: restoredOrder }));

        const runtime = new ArcGISRuntime(effectivePerformance);
        runtimeRef.current = runtime;
        await runtime.initialize(
          mapRef.current,
          share?.camera ?? initialPreferences.camera ?? DEFAULT_CAMERA,
          restoredBasemap,
          {
            onIdentify: setIdentify,
            onTelemetry: setTelemetry,
            onCamera: (camera) => saveCamera(camera),
            onGraphicsRecovery: (event) => {
              const recoveryMessage = event.state === "recovered"
                ? "Harita görüntüsü yeniden hazır."
                : publicErrorMessage(event.message, "Harita görüntüsü geçici olarak hazırlanamadı.");
              pushToast(
                recoveryMessage,
                event.state === "recovered" ? "success" : event.state === "failed" ? "error" : "info"
              );
              recordIncident({
                severity: event.state === "failed" ? "error" : event.state === "attempting" ? "warning" : "info",
                kind: "system",
                message: event.message,
                recovered: event.state === "recovered"
              });
            }
          }
        );
        if (cancelled) {
          runtime.destroy();
          return;
        }

        if (searchRef.current) await runtime.mountSearch(searchRef.current);
        if (navigationRef.current) navigationCleanupRef.current = await runtime.mountNavigation(navigationRef.current);
        if (cancelled) {
          runtime.destroy();
          return;
        }
        setReady(true);

        await runtime.withLayerActivationBatch(async () => {
          await Promise.all(restored.filter((service) => service.visible).map(async (service) => {
            if (cancelled) return;
            patchService(service.id, { status: "loading" });
            const result = await layerLoadScheduler.schedule(
              service,
              "restore",
              () => runtime.setLayerVisible(service, true),
              { ok: true, superseded: true }
            );
            if (result.superseded) return;
            patchService(
              service.id,
              result.ok
                ? { ...successPatch(result.durationMs), visible: true }
                : failurePatch(service, result.error, result.durationMs)
            );
            if (!result.ok) {
              recordIncident({
                severity: "error",
                kind: "layer-load",
                message: result.error ?? "Başlangıç katmanı yüklenemedi.",
                serviceId: service.id,
                serviceName: service.displayName,
                durationMs: result.durationMs
              });
            }
          }));
        }, { navigate: !share?.camera });

        if (cancelled) return;
        runtime.setLayerOrder(restoredOrder);
        persistLayerPreferences(servicesRef.current);
        if (suppressedRestores > 0) {
          pushToast(`${suppressedRestores} katman bağlantı durumuna göre başlangıçta açılmadı. İsterseniz Katmanlar bölümünden deneyebilirsiniz.`, "info");
        }
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        const fallback = "Kent Rehberi şu anda başlatılamadı. Lütfen yeniden deneyin.";
        const message = publicErrorMessage(error, fallback);
        const diagnostic = error instanceof Error ? error.message : fallback;
        setBootError(message);
        pushToast(message, "error");
        recordIncident({ severity: "error", kind: "boot", message: diagnostic });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      layerLoadScheduler.dispose();
      navigationCleanupRef.current?.();
      navigationCleanupRef.current = null;
      const runtime = runtimeRef.current;
      runtimeRef.current = null;
      runtime?.destroy();
    };
  }, [effectivePerformance, initialPreferences, layerLoadScheduler, patchService, persistLayerPreferences, pushToast, recordIncident]);

  useEffect(() => {
    if (!ready) return;
    if (!activeTool) {
      runtimeRef.current?.closeTool();
      return;
    }
    const frame = requestAnimationFrame(() => {
      if (toolHostRef.current) {
        void runtimeRef.current?.openTool(activeTool, toolHostRef.current).catch(() => pushToast("Harita aracı açılamadı.", "error"));
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [activeTool, ready, pushToast]);

  const toggleLayer = useCallback(async (
    service: ServiceDefinition,
    visible: boolean,
    priority: LayerLoadPriority = "interactive"
  ) => {
    const runtime = runtimeRef.current;
    if (!runtime) return;

    if (visible) patchService(service.id, { visible: true, status: "loading", error: undefined });
    else patchService(service.id, { visible: false });

    const targetService = { ...service, visible };
    let result;
    if (visible) {
      result = await layerLoadScheduler.schedule(
        targetService,
        priority,
        () => runtime.setLayerVisible(targetService, true),
        { ok: true, superseded: true }
      );
    } else {
      layerLoadScheduler.cancel(service.id);
      result = await runtime.setLayerVisible(targetService, false);
    }

    if (result.superseded) return;
    const patch: Partial<ServiceDefinition> = result.ok
      ? {
          ...(visible ? successPatch(result.durationMs) : {}),
          visible,
          status: visible ? "ready" : service.status === "loading" ? "idle" : service.status,
          error: visible ? undefined : service.error
        }
      : failurePatch(service, result.error, result.durationMs);

    patchService(service.id, patch);
    const next = servicesRef.current.map((item) => item.id === service.id ? { ...item, ...patch } : item);
    servicesRef.current = next;
    persistLayerPreferences(next);
    runtime.setLayerOrder(normalizeLayerOrder(preferences.layerOrder, next.map((item) => item.id)));

    if (!result.ok) {
      pushToast(`${service.displayName} şu anda açılamıyor. Daha sonra yeniden deneyebilirsiniz.`, "error");
      recordIncident({
        severity: "error",
        kind: "layer-load",
        message: result.error ?? "Servis yüklenemedi.",
        serviceId: service.id,
        serviceName: service.displayName,
        durationMs: result.durationMs
      });
    } else if (visible && result.navigation?.moved) {
      pushToast(
        result.navigation.targetScale
          ? `${service.displayName} için uygun harita görünümüne geçildi · 1:${formatScale(result.navigation.targetScale)}.`
          : `${service.displayName} veri kapsamına geçildi.`,
        "info"
      );
    }

    if (result.ok && visible && (result.durationMs ?? 0) >= 5_000) {
      recordIncident({
        severity: "warning",
        kind: "layer-load",
        message: "Katman başarıyla açıldı ancak yükleme süresi yüksekti.",
        serviceId: service.id,
        serviceName: service.displayName,
        durationMs: result.durationMs
      });
    }
  }, [layerLoadScheduler, patchService, persistLayerPreferences, preferences.layerOrder, pushToast, recordIncident]);

  const setOpacity = useCallback((service: ServiceDefinition, opacity: number) => {
    const safeOpacity = Math.min(1, Math.max(0, opacity));
    runtimeRef.current?.setOpacity(service.id, safeOpacity);
    patchService(service.id, { opacity: safeOpacity });
    const next = servicesRef.current.map((item) => item.id === service.id ? { ...item, opacity: safeOpacity } : item);
    servicesRef.current = next;
    persistLayerPreferences(next);
  }, [patchService, persistLayerPreferences]);

  const toggleFavorite = useCallback((service: ServiceDefinition) => {
    patchService(service.id, { favorite: !service.favorite });
    const next = servicesRef.current.map((item) => item.id === service.id ? { ...item, favorite: !service.favorite } : item);
    servicesRef.current = next;
    persistLayerPreferences(next);
  }, [patchService, persistLayerPreferences]);

  const moveLayer = useCallback((serviceId: string, direction: LayerOrderDirection) => {
    const snapshot = servicesRef.current;
    const availableIds = snapshot.map((service) => service.id);
    const visibleIds = snapshot.filter((service) => service.visible).map((service) => service.id);
    const currentOrder = normalizeLayerOrder(preferences.layerOrder, availableIds);
    const nextOrder = moveVisibleLayer(currentOrder, visibleIds, serviceId, direction);
    if (nextOrder.every((id, index) => id === currentOrder[index])) return;

    runtimeRef.current?.setLayerOrder(nextOrder);
    setPreferences((current) => {
      const next = { ...current, layerOrder: nextOrder };
      savePreferences(next);
      return next;
    });
  }, [preferences.layerOrder]);

  const zoomLayer = useCallback(async (service: ServiceDefinition) => {
    const ok = await runtimeRef.current?.zoomToLayer(service);
    if (!ok) pushToast("Bu katmanın harita kapsamı alınamadı.", "info");
  }, [pushToast]);

  const retryLayer = useCallback(async (service: ServiceDefinition) => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    patchService(service.id, { visible: true, status: "loading", error: undefined });
    const retryService = { ...service, visible: true };
    const result = await layerLoadScheduler.schedule(
      retryService,
      "retry",
      () => runtime.reloadLayer(retryService),
      { ok: true, superseded: true }
    );
    if (result.superseded) return;
    const patch: Partial<ServiceDefinition> = result.ok
      ? { ...successPatch(result.durationMs), visible: true }
      : failurePatch(service, result.error, result.durationMs);
    patchService(service.id, patch);
    const next = servicesRef.current.map((item) => item.id === service.id ? { ...item, ...patch } : item);
    servicesRef.current = next;
    persistLayerPreferences(next);
    runtime.setLayerOrder(normalizeLayerOrder(preferences.layerOrder, next.map((item) => item.id)));
    pushToast(result.ok ? `${service.displayName} açıldı.` : `${service.displayName} şu anda açılamıyor.`, result.ok ? "success" : "error");
    recordIncident({
      severity: result.ok ? "info" : "error",
      kind: "layer-retry",
      message: result.ok ? "Servis yeniden bağlandı." : (result.error ?? "Servis yeniden bağlanamadı."),
      serviceId: service.id,
      serviceName: service.displayName,
      durationMs: result.durationMs,
      recovered: result.ok
    });
  }, [layerLoadScheduler, patchService, persistLayerPreferences, preferences.layerOrder, pushToast, recordIncident]);

  const queryAttributes = useCallback(async (service: ServiceDefinition, options: AttributeQueryOptions): Promise<AttributeTableResult> => {
    const runtime = runtimeRef.current;
    if (!runtime) throw new Error("Harita henüz hazır değil.");
    const startedAt = performance.now();
    try {
      return await runtime.queryAttributes(service, options);
    } catch (error) {
      recordIncident({
        severity: "error",
        kind: "query",
        message: error instanceof Error ? error.message : "Veri sorgusu başarısız oldu.",
        serviceId: service.id,
        serviceName: service.displayName,
        durationMs: Math.round(performance.now() - startedAt)
      });
      throw new Error(publicErrorMessage(error, "Harita verisi şu anda alınamadı. Lütfen yeniden deneyin."));
    }
  }, [recordIncident]);

  const selectPanel = useCallback((nextPanel: Exclude<PanelId, null>) => {
    setPanel((current) => current === nextPanel ? null : nextPanel);
    setMobilePanelsVisible(true);
  }, []);

  const selectTool = useCallback((tool: Exclude<ToolId, null>) => {
    setActiveTool((current) => current === tool ? null : tool);
  }, []);

  const changeBasemap = useCallback((basemap: string) => {
    runtimeRef.current?.setBasemap(basemap);
    setPreferences((current) => {
      const next = { ...current, basemap };
      savePreferences(next);
      return next;
    });
  }, []);

  const focusGlobalSearch = useCallback(() => {
    const host = searchRef.current;
    if (!host) return;
    const focusTarget = host.querySelector<HTMLElement>("input, [role='combobox'], button, [tabindex='0']");
    if (focusTarget) focusTarget.focus();
    else host.focus();
  }, []);

  const shareView = useCallback(async () => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const visibleIds = servicesRef.current.filter((service) => service.visible).map((service) => service.id);
    const orderedVisibleIds = visibleLayerOrder(
      normalizeLayerOrder(preferences.layerOrder, servicesRef.current.map((service) => service.id)),
      visibleIds
    );
    const params = encodeShareState({
      camera: runtime.getCamera(),
      layerIds: orderedVisibleIds,
      basemap: preferences.basemap
    });
    const url = `${location.origin}${location.pathname}?${params.toString()}`;

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "Ankara Kent Rehberi",
          text: "Ankara Kent Rehberi harita görünümü",
          url
        });
        pushToast("Harita görünümü paylaşıldı.", "success");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API kullanılamıyor.");
      await navigator.clipboard.writeText(url);
      pushToast("Harita bağlantısı panoya kopyalandı.", "success");
    } catch {
      history.replaceState(null, "", `?${params.toString()}`);
      pushToast("Paylaşım bağlantısı adres çubuğuna yazıldı.", "info");
    }
  }, [preferences.basemap, preferences.layerOrder, pushToast]);

  const takeScreenshot = useCallback(async () => {
    const dataUrl = await runtimeRef.current?.takeScreenshot();
    if (!dataUrl) {
      pushToast("Ekran görüntüsü oluşturulamadı.", "error");
      return;
    }
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `ankara-kent-rehberi-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
    link.click();
    pushToast("Ekran görüntüsü hazırlandı.", "success");
  }, [pushToast]);

  const addBookmark = useCallback(() => {
    if (!runtimeRef.current) return;
    setBookmarkDialogOpen(true);
  }, []);

  const saveBookmark = useCallback((name: string) => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const snapshot = servicesRef.current;
    const visible = snapshot.filter((service) => service.visible);
    const order = normalizeLayerOrder(preferences.layerOrder, snapshot.map((service) => service.id));
    const visibleOrder = visibleLayerOrder(order, visible.map((service) => service.id));
    const bookmark: Bookmark = {
      id: createId(),
      name,
      camera: runtime.getCamera(),
      layerIds: visibleOrder,
      layerOrder: visibleOrder,
      layerOpacity: Object.fromEntries(visible.map((service) => [service.id, service.opacity])),
      basemap: preferences.basemap,
      createdAt: new Date().toISOString()
    };
    const bookmarks = [bookmark, ...preferences.bookmarks].slice(0, 40);
    setPreferences((current) => {
      const next = { ...current, bookmarks };
      savePreferences(next);
      return next;
    });
    setBookmarkDialogOpen(false);
    pushToast("Çalışma görünümü kaydedildi.", "success");
  }, [preferences.basemap, preferences.bookmarks, preferences.layerOrder, pushToast]);

  const goBookmark = useCallback(async (bookmark: Bookmark) => {
    const runtime = runtimeRef.current;
    if (!runtime) return;

    const snapshot = servicesRef.current;
    const allIds = snapshot.map((service) => service.id);
    const desired = new Set(bookmark.layerIds);
    const capturedOrder = bookmark.layerOrder?.length ? bookmark.layerOrder : bookmark.layerIds;
    const restoredOrder = mergeCapturedLayerOrder(preferences.layerOrder, capturedOrder, allIds);
    const restoredBasemap = bookmark.basemap ?? preferences.basemap;
    const bookmarkOpacity = bookmark.layerOpacity ?? {};
    const prepared = snapshot.map((service) => {
      const nextOpacity = bookmarkOpacity[service.id];
      return Number.isFinite(nextOpacity)
        ? { ...service, opacity: Math.min(1, Math.max(0, nextOpacity!)) }
        : service;
    });

    setServices(prepared);
    servicesRef.current = prepared;
    for (const service of prepared) runtime.setOpacity(service.id, service.opacity);
    runtime.setBasemap(restoredBasemap);
    setPreferences((current) => {
      const next = {
        ...current,
        basemap: restoredBasemap,
        layerOrder: restoredOrder,
        layerOpacity: Object.fromEntries(prepared.map((service) => [service.id, service.opacity]))
      };
      savePreferences(next);
      return next;
    });

    await runtime.withLayerActivationBatch(async () => {
      await Promise.all(prepared
        .filter((service) => service.visible !== desired.has(service.id))
        .map((service) => toggleLayer(service, desired.has(service.id), "restore")));
    }, { navigate: false });

    runtime.setLayerOrder(restoredOrder);
    await runtime.goTo(bookmark.camera);
    persistLayerPreferences(servicesRef.current);
    pushToast(`${bookmark.name} çalışma görünümü geri yüklendi.`, "success");
  }, [persistLayerPreferences, preferences.basemap, preferences.layerOrder, pushToast, toggleLayer]);

  const deleteBookmark = useCallback((bookmark: Bookmark) => {
    const bookmarks = preferences.bookmarks.filter((item) => item.id !== bookmark.id);
    setPreferences((current) => {
      const next = { ...current, bookmarks };
      savePreferences(next);
      return next;
    });
  }, [preferences.bookmarks]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        if (typeof document.exitFullscreen === "function") await document.exitFullscreen();
        return;
      }
      const request = document.documentElement.requestFullscreen;
      if (typeof request !== "function") {
        pushToast("Bu tarayıcı tam ekran modunu desteklemiyor.", "info");
        return;
      }
      await request.call(document.documentElement);
    } catch {
      pushToast("Tam ekran modu açılamadı.", "info");
    }
  }, [pushToast]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (bookmarkDialogOpen) return;
      const target = event.target as HTMLElement | null;
      const typing = target?.matches("input, textarea, select, [contenteditable='true']");
      if (typing) return;
      if (event.key.toLowerCase() === "h") void runtimeRef.current?.goHome();
      if (event.key.toLowerCase() === "l") selectPanel("layers");
      if (event.key.toLowerCase() === "d") selectPanel("data");
      if (event.key.toLowerCase() === "m") setFocusMode((value) => !value);
      if (event.key === "?") {
        event.preventDefault();
        selectPanel("help");
      }
      if (event.key === "/") {
        event.preventDefault();
        focusGlobalSearch();
      }
      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        void toggleFullscreen();
      }
      if (event.key === "Escape") {
        if (activeTool) setActiveTool(null);
        else if (panel) setPanel(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTool, bookmarkDialogOpen, focusGlobalSearch, panel, selectPanel, toggleFullscreen]);

  return (
    <main className={`app-shell ${focusMode ? "is-focus-mode" : ""}`} data-connection={online ? "online" : "offline"}>
      <nav className="skip-links" aria-label="Hızlı erişim">
        <a href="#kent-rehberi-map">Haritaya geç</a>
        <a href="#kent-rehberi-tools">Araçlara geç</a>
        <a href="#kent-rehberi-panels">Katmanlara geç</a>
      </nav>
      <p id="map-usage-hint" className="visually-hidden">Harita alanını fare, dokunmatik ekran veya klavye ile gezebilirsiniz. Katmanlar açıkken gerekli zoom aralığı otomatik korunur.</p>

      <div
        id="kent-rehberi-map"
        ref={mapRef}
        className="map-view"
        role="region"
        tabIndex={-1}
        aria-label="Ankara 3B Kent Rehberi haritası"
        aria-describedby="map-usage-hint"
      />
      <div className="map-vignette" aria-hidden="true" />

      <header className="topbar" aria-label="Kent Rehberi üst menüsü">
        <button
          type="button"
          className="mobile-menu"
          onClick={() => setMobilePanelsVisible((value) => !value)}
          aria-label="Katman ve araç panelini aç veya kapat"
          aria-controls="kent-rehberi-panels"
          aria-expanded={Boolean(panel && mobilePanelsVisible)}
        >
          <Icon name="menu" />
        </button>
        <div className="brand" aria-label="Ankara Kent Rehberi">
          <div className="brand-symbol"><span>3B</span><i /></div>
          <div><strong>Ankara Kent Rehberi</strong><span>Ankara Büyükşehir Belediyesi · 3B Kent Haritası</span></div>
        </div>
        <div className={`live-chip ${online ? "" : "is-offline"}`} role="status" aria-live="polite" title={online ? "İnternet bağlantısı mevcut" : "İnternet bağlantısı yok"}><i /> {online ? "CANLI HARİTA" : "ÇEVRİMDIŞI"}</div>
        <div className="workspace-summary" role="status" aria-live="polite" aria-label="Katman çalışma özeti">
          <span><strong>{shellMetrics.active}</strong> açık</span>
          {shellMetrics.loading > 0 && <span className="is-loading"><strong>{shellMetrics.loading}</strong> hazırlanıyor</span>}
          {shellMetrics.error > 0 && <span className="is-error"><strong>{shellMetrics.error}</strong> sorunlu</span>}
        </div>
        <div ref={searchRef} className="global-search" role="search" aria-label="Adres ve yer arama" tabIndex={-1} />
        <div className="top-actions">
          <select className="compact-select" value={preferences.basemap} onChange={(event) => changeBasemap(event.target.value)} aria-label="Harita görünümü">
            {basemaps.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button type="button" className="top-icon-button" onClick={() => setFocusMode((value) => !value)} title="Haritaya odaklan" aria-label={focusMode ? "Odak modundan çık" : "Haritaya odaklan"} aria-pressed={focusMode}><Icon name={focusMode ? "close" : "eye"} /></button>
          <button type="button" className="primary-button share-button" onClick={() => void shareView()} aria-label="Mevcut harita görünümünü paylaş"><Icon name="share" /> Paylaş</button>
        </div>
      </header>

      <div ref={navigationRef} className="arcgis-navigation" aria-label="Harita yakınlaştırma ve yön kontrolleri" />

      <ToolRail
        activePanel={panel}
        activeTool={activeTool}
        onPanel={selectPanel}
        onTool={selectTool}
        onHome={() => void runtimeRef.current?.goHome()}
        onScreenshot={() => void takeScreenshot()}
      />

      <div id="kent-rehberi-panels" className={`panel-zone ${mobilePanelsVisible ? "is-mobile-visible" : ""}`} aria-label="Kent Rehberi çalışma panelleri">
        <ViewTransition name="workspace-panel">
          {panel === "layers" ? (
            <aside className="main-panel" key="layers" aria-label="Katmanlar paneli">
              <button type="button" className="mobile-panel-close" onClick={() => setMobilePanelsVisible(false)} aria-label="Katmanlar panelini kapat"><Icon name="close" /></button>
              <LayerExplorer
                services={services}
                currentScale={telemetry.scale}
                layerOrder={effectiveLayerOrder}
                onToggle={toggleLayer}
                onOpacity={setOpacity}
                onFavorite={toggleFavorite}
                onZoom={(service) => void zoomLayer(service)}
                onRetry={retryLayer}
                onMoveLayer={moveLayer}
              />
            </aside>
          ) : panel ? (
            <OperationsPanel
              key={panel}
              panel={panel}
              services={services}
              bookmarks={preferences.bookmarks}
              onClose={() => setPanel(null)}
              onAddBookmark={addBookmark}
              onGoBookmark={(bookmark) => void goBookmark(bookmark)}
              onDeleteBookmark={deleteBookmark}
              onQueryAttributes={queryAttributes}
            />
          ) : null}
        </ViewTransition>
      </div>

      {activeTool && (
        <aside className="map-tool-panel" aria-labelledby="active-map-tool-title">
          <div className="map-tool-header"><strong id="active-map-tool-title">{toolTitle(activeTool)}</strong><button type="button" className="icon-ghost" onClick={() => setActiveTool(null)} aria-label={`${toolTitle(activeTool)} aracını kapat`}><Icon name="close" /></button></div>
          <div ref={toolHostRef} className="map-tool-host" />
        </aside>
      )}

      <DetailsPanel result={identify} onClose={() => setIdentify(null)} />
      <StatusBar telemetry={telemetry} services={services} />
      <ToastStack items={toasts} onDismiss={dismissToast} />
      <BookmarkDialog
        open={bookmarkDialogOpen}
        suggestedName={`Görünüm ${preferences.bookmarks.length + 1}`}
        onCancel={() => setBookmarkDialogOpen(false)}
        onSave={saveBookmark}
      />

      {!online && (
        <div className="offline-banner" role="status" aria-live="polite">
          <Icon name="warning" size={18} />
          <div><strong>Bağlantı yok</strong><span>Önbellekteki harita kabuğu kullanılabilir; canlı katmanlar bağlantı geri geldiğinde yenilenir.</span></div>
        </div>
      )}

      {!ready && !bootError && (
        <div className="boot-screen" role="status" aria-live="polite" aria-busy="true">
          <div className="boot-logo"><span>3B</span><i /></div>
          <div><strong>Ankara Kent Rehberi hazırlanıyor</strong><span>Harita ve katmanlar yükleniyor…</span></div>
          <div className="boot-progress" aria-hidden="true"><i /></div>
        </div>
      )}
      {bootError && (
        <div className="fatal-screen" role="alert">
          <Icon name="warning" size={34} />
          <h1>Kent Rehberi açılamadı</h1>
          <p>{bootError}</p>
          <button type="button" className="primary-button" onClick={() => location.reload()}><Icon name="refresh" /> Yeniden dene</button>
        </div>
      )}
    </main>
  );
}

function toolTitle(tool: Exclude<ToolId, null>): string {
  const labels: Record<Exclude<ToolId, null>, string> = {
    legend: "Lejant",
    basemap: "Harita Görünümü",
    distance: "Mesafe Ölç",
    area: "Alan Ölç",
    daylight: "Gün Işığı",
    slice: "3B Kesit",
    lineOfSight: "Görüş Hattı",
    elevation: "Yükseklik Profili"
  };
  return labels[tool];
}

function createId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
