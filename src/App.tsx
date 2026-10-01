import { ViewTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArcGISRuntime } from "./gis/ArcGISRuntime";
import { LayerLoadScheduler, type LayerLoadPriority } from "./gis/layerLoadScheduler";
import { loadServiceCatalog } from "./lib/catalog";
import { detectPerformanceProfile } from "./lib/performance";
import { encodeShareState, decodeShareState } from "./lib/urlState";
import { loadPreferences, saveCamera, savePreferences } from "./lib/storage";
import { appendIncident, createIncident, loadIncidentJournal, type IncidentInput } from "./lib/incidentJournal";
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
import type {
  AppPreferences,
  AttributeQueryOptions,
  AttributeTableResult,
  Bookmark,
  CameraState,
  IdentifyResult,
  PanelId,
  PerformanceProfile,
  RuntimeIncident,
  SceneTelemetry,
  ServiceDefinition,
  ToolId
} from "./types";
import { LayerExplorer } from "./components/LayerExplorer";
import { ToolRail } from "./components/ToolRail";
import { StatusBar } from "./components/StatusBar";
import { DetailsPanel } from "./components/DetailsPanel";
import { OperationsPanel } from "./components/OperationsPanel";
import { ToastStack, type ToastItem } from "./components/ToastStack";
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
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [mobilePanelsVisible, setMobilePanelsVisible] = useState(true);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [focusMode, setFocusMode] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);

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

  useEffect(() => { servicesRef.current = services; }, [services]);

  const pushToast = useCallback((message: string, tone: ToastItem["tone"] = "info") => {
    const id = createId();
    setToasts((items) => [...items.slice(-3), { id, message, tone }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 4800);
  }, []);

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
    const onUpdate = () => setUpdateAvailable(true);
    window.addEventListener("altyapi:update-available", onUpdate);
    return () => window.removeEventListener("altyapi:update-available", onUpdate);
  }, []);

  const applyAppUpdate = useCallback(() => {
    window.dispatchEvent(new Event("altyapi:apply-update"));
    setUpdateAvailable(false);
    pushToast("Kent Rehberi güncelleniyor…", "info");
  }, [pushToast]);

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

        setServices(restored);
        servicesRef.current = restored;

        const runtime = new ArcGISRuntime(effectivePerformance);
        runtimeRef.current = runtime;
        await runtime.initialize(
          mapRef.current,
          share?.camera ?? initialPreferences.camera ?? DEFAULT_CAMERA,
          share?.basemap ?? initialPreferences.basemap,
          {
            onIdentify: setIdentify,
            onTelemetry: setTelemetry,
            onCamera: (camera) => saveCamera(camera),
            onGraphicsRecovery: (event) => {
              pushToast(
                event.state === "recovered" ? "Harita görüntüsü yeniden hazır." : event.message,
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
        persistLayerPreferences(servicesRef.current);
        if (suppressedRestores > 0) {
          pushToast(`${suppressedRestores} katman bağlantı durumuna göre başlangıçta açılmadı. İsterseniz Katmanlar bölümünden deneyebilirsiniz.`, "info");
        }
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "Kent Rehberi başlatılamadı.";
        setBootError(message);
        pushToast(message, "error");
        recordIncident({ severity: "error", kind: "boot", message });
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
  }, [layerLoadScheduler, patchService, persistLayerPreferences, pushToast, recordIncident]);

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
  }, [layerLoadScheduler, patchService, persistLayerPreferences, pushToast, recordIncident]);

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
      throw error;
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
    const params = encodeShareState({
      camera: runtime.getCamera(),
      layerIds: servicesRef.current.filter((service) => service.visible).map((service) => service.id),
      basemap: preferences.basemap
    });
    const url = `${location.origin}${location.pathname}?${params.toString()}`;
    try {
      await navigator.clipboard.writeText(url);
      pushToast("Harita bağlantısı panoya kopyalandı.", "success");
    } catch {
      history.replaceState(null, "", `?${params.toString()}`);
      pushToast("Paylaşım bağlantısı adres çubuğuna yazıldı.", "info");
    }
  }, [preferences.basemap, pushToast]);

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
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const suggested = `Yer ${preferences.bookmarks.length + 1}`;
    const name = window.prompt("Yer imi adı", suggested)?.trim();
    if (!name) return;
    const bookmark: Bookmark = {
      id: createId(),
      name,
      camera: runtime.getCamera(),
      layerIds: servicesRef.current.filter((service) => service.visible).map((service) => service.id),
      createdAt: new Date().toISOString()
    };
    const bookmarks = [bookmark, ...preferences.bookmarks].slice(0, 40);
    setPreferences((current) => {
      const next = { ...current, bookmarks };
      savePreferences(next);
      return next;
    });
    pushToast("Yer imi kaydedildi.", "success");
  }, [preferences.bookmarks, pushToast]);

  const goBookmark = useCallback(async (bookmark: Bookmark) => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const desired = new Set(bookmark.layerIds);
    const snapshot = servicesRef.current;
    await runtime.withLayerActivationBatch(async () => {
      await Promise.all(snapshot
        .filter((service) => service.visible !== desired.has(service.id))
        .map((service) => toggleLayer(service, desired.has(service.id), "restore")));
    }, { navigate: false });
    await runtime.goTo(bookmark.camera);
  }, [toggleLayer]);

  const deleteBookmark = useCallback((bookmark: Bookmark) => {
    const bookmarks = preferences.bookmarks.filter((item) => item.id !== bookmark.id);
    setPreferences((current) => {
      const next = { ...current, bookmarks };
      savePreferences(next);
      return next;
    });
  }, [preferences.bookmarks]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
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
        void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())
          .catch(() => pushToast("Tam ekran modu açılamadı.", "info"));
      }
      if (event.key === "Escape") {
        if (activeTool) setActiveTool(null);
        else if (panel) setPanel(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTool, focusGlobalSearch, panel, pushToast, selectPanel]);

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
                onToggle={toggleLayer}
                onOpacity={setOpacity}
                onFavorite={toggleFavorite}
                onZoom={(service) => void zoomLayer(service)}
                onRetry={retryLayer}
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
      <ToastStack items={toasts} onDismiss={(id) => setToasts((items) => items.filter((item) => item.id !== id))} />

      {!online && (
        <div className="offline-banner" role="status" aria-live="polite">
          <Icon name="warning" size={18} />
          <div><strong>Bağlantı yok</strong><span>Önbellekteki harita kabuğu kullanılabilir; canlı katmanlar bağlantı geri geldiğinde yenilenir.</span></div>
        </div>
      )}

      {updateAvailable && (
        <div className="app-update-banner" role="status" aria-live="polite">
          <span className="app-update-icon"><Icon name="refresh" size={16} /></span>
          <div><strong>Kent Rehberi güncellemesi hazır</strong><span>Yeni sürüm uygulanabilir; harita tercihleriniz korunur.</span></div>
          <button type="button" className="primary-button" onClick={applyAppUpdate}>Güncelle</button>
          <button type="button" className="icon-ghost" onClick={() => setUpdateAvailable(false)} aria-label="Güncelleme bildirimini kapat"><Icon name="close" size={14} /></button>
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
