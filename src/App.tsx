import { ViewTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArcGISRuntime } from "./gis/ArcGISRuntime";
import { loadServiceCatalog } from "./lib/catalog";
import { detectPerformanceProfile } from "./lib/performance";
import { encodeShareState, decodeShareState } from "./lib/urlState";
import { loadPreferences, saveCamera, savePreferences } from "./lib/storage";
import { createWorkspaceSnapshot, parseWorkspaceSnapshot, workspaceSnapshotToJson } from "./lib/workspace";
import {
  applyServiceHealthSnapshot,
  failurePatch,
  isServiceCoolingDown,
  loadServiceHealthSnapshot,
  shouldAutoLoadService,
  successPatch
} from "./lib/serviceHealth";
import type {
  AppPreferences,
  AttributeQueryOptions,
  AttributeTableResult,
  Bookmark,
  CameraState,
  IdentifyResult,
  PanelId,
  PerformanceProfile,
  SceneTelemetry,
  ServiceDefinition,
  ToolId
} from "./types";
import { LayerExplorer } from "./components/LayerExplorer";
import { ToolRail } from "./components/ToolRail";
import { StatusBar } from "./components/StatusBar";
import { DetailsPanel } from "./components/DetailsPanel";
import { OperationsPanel } from "./components/OperationsPanel";
import { CommandPalette } from "./components/CommandPalette";
import { ToastStack, type ToastItem } from "./components/ToastStack";
import { Icon } from "./components/Icon";

const APP_VERSION = "10.0.0";
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
  const [preferences, setPreferences] = useState<AppPreferences>(initialPreferences);
  const [services, setServices] = useState<ServiceDefinition[]>([]);
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelId>("overview");
  const [activeTool, setActiveTool] = useState<ToolId>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [identify, setIdentify] = useState<IdentifyResult | null>(null);
  const [telemetry, setTelemetry] = useState<SceneTelemetry>({ altitude: DEFAULT_CAMERA.z, tilt: DEFAULT_CAMERA.tilt, heading: DEFAULT_CAMERA.heading });
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [mobilePanelsVisible, setMobilePanelsVisible] = useState(true);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [focusMode, setFocusMode] = useState(false);

  const effectivePerformance: PerformanceProfile = preferences.performance === "auto" ? detectPerformanceProfile() : preferences.performance;
  const initialPerformanceRef = useRef(effectivePerformance);
  const mapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const navigationRef = useRef<HTMLDivElement>(null);
  const toolHostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<ArcGISRuntime | null>(null);
  const navigationCleanupRef = useRef<(() => void) | null>(null);
  const servicesRef = useRef<ServiceDefinition[]>([]);

  useEffect(() => { servicesRef.current = services; }, [services]);

  const pushToast = useCallback((message: string, tone: ToastItem["tone"] = "info") => {
    const id = createId();
    setToasts((items) => [...items.slice(-3), { id, message, tone }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 4800);
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
    const onOnline = () => {
      setOnline(true);
      pushToast("Ağ bağlantısı yeniden kuruldu.", "success");
    };
    const onOffline = () => {
      setOnline(false);
      pushToast("Ağ bağlantısı kesildi. Harita servisleri geçici olarak kullanılamayabilir.", "error");
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [pushToast]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    void (async () => {
      try {
        const [catalog, healthSnapshot] = await Promise.all([
          loadServiceCatalog("./services.json", controller.signal),
          loadServiceHealthSnapshot("./service-health.json", controller.signal)
        ]);
        if (cancelled || !mapRef.current) return;
        const share = decodeShareState(new URLSearchParams(location.search));
        const favoriteSet = new Set(initialPreferences.favorites);
        const sharedLayers = share ? new Set(share.layerIds) : null;
        const enrichedCatalog = applyServiceHealthSnapshot(catalog, healthSnapshot);
        let suppressedRestores = 0;
        const restored = enrichedCatalog.map((service) => {
          const requestedVisible = sharedLayers ? sharedLayers.has(service.id) : (initialPreferences.layerVisibility[service.id] ?? false);
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

        const runtime = new ArcGISRuntime(initialPerformanceRef.current);
        runtimeRef.current = runtime;
        await runtime.initialize(
          mapRef.current,
          share?.camera ?? initialPreferences.camera ?? DEFAULT_CAMERA,
          share?.basemap ?? initialPreferences.basemap,
          {
            onIdentify: setIdentify,
            onTelemetry: setTelemetry,
            onCamera: (camera) => saveCamera(camera)
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

        await mapWithConcurrency(restored.filter((service) => service.visible), 2, async (service) => {
          if (cancelled) return;
          patchService(service.id, { status: "loading" });
          const result = await runtime.setLayerVisible(service, true);
          patchService(
            service.id,
            result.ok
              ? { ...successPatch(result.durationMs), visible: true }
              : failurePatch(service, result.error, result.durationMs)
          );
        });
        if (cancelled) return;
        persistLayerPreferences(servicesRef.current);
        pushToast(`${restored.length} servis katalogdan yüklendi · ${restored.filter((service) => service.availability === "verified").length} doğrulanmış.`, "success");
        if (suppressedRestores > 0) {
          pushToast(`${suppressedRestores} riskli servis başlangıçta otomatik açılmadı; Katmanlar panelinden manuel denenebilir.`, "info");
        }
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "Uygulama başlatılamadı.";
        setBootError(message);
        pushToast(message, "error");
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      navigationCleanupRef.current?.();
      navigationCleanupRef.current = null;
      const runtime = runtimeRef.current;
      runtimeRef.current = null;
      runtime?.destroy();
    };
  }, [initialPreferences, patchService, persistLayerPreferences, pushToast]);

  useEffect(() => {
    runtimeRef.current?.setPerformanceProfile(effectivePerformance);
  }, [effectivePerformance]);

  useEffect(() => {
    if (!ready) return;
    if (!activeTool) {
      runtimeRef.current?.closeTool();
      return;
    }
    const frame = requestAnimationFrame(() => {
      if (toolHostRef.current) void runtimeRef.current?.openTool(activeTool, toolHostRef.current).catch(() => pushToast("Harita aracı açılamadı.", "error"));
    });
    return () => cancelAnimationFrame(frame);
  }, [activeTool, ready, pushToast]);

  const toggleLayer = useCallback(async (service: ServiceDefinition, visible: boolean) => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    if (visible) {
      patchService(service.id, { visible: true, status: "loading", error: undefined });
      if (service.availability !== "verified") {
        pushToast(`${service.displayName}: servis doğrulama durumu “${service.availability}”; manuel bağlantı deneniyor.`, "info");
      }
    } else {
      patchService(service.id, { visible: false });
    }

    const result = await runtime.setLayerVisible({ ...service, visible }, visible);
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
      pushToast(`${service.displayName}: ${result.error ?? "Servis yüklenemedi."}`, "error");
    }
  }, [patchService, persistLayerPreferences, pushToast]);

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
    const ok = await runtimeRef.current?.zoomToLayer(service.id);
    if (!ok) pushToast("Katmanın görüntüleme kapsamı alınamadı.", "info");
  }, [pushToast]);

  const retryLayer = useCallback(async (service: ServiceDefinition) => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    patchService(service.id, { visible: true, status: "loading", error: undefined });
    const result = await runtime.reloadLayer({ ...service, visible: true });
    const patch: Partial<ServiceDefinition> = result.ok
      ? { ...successPatch(result.durationMs), visible: true }
      : failurePatch(service, result.error, result.durationMs);
    patchService(service.id, patch);
    const next = servicesRef.current.map((item) => item.id === service.id ? { ...item, ...patch } : item);
    servicesRef.current = next;
    persistLayerPreferences(next);
    pushToast(result.ok ? `${service.displayName} yeniden bağlandı.` : `${service.displayName} yeniden bağlanamadı.`, result.ok ? "success" : "error");
  }, [patchService, persistLayerPreferences, pushToast]);

  const retryErrors = useCallback(async () => {
    const errors = servicesRef.current.filter(
      (service) => service.status === "error" && service.availability !== "unavailable" && !isServiceCoolingDown(service)
    );
    const skipped = servicesRef.current.filter(
      (service) => service.status === "error" && (service.availability === "unavailable" || isServiceCoolingDown(service))
    ).length;
    if (skipped > 0) pushToast(`${skipped} servis devre kesici / doğrulama politikası nedeniyle toplu denemede atlandı.`, "info");
    await mapWithConcurrency(errors, 2, retryLayer);
  }, [pushToast, retryLayer]);

  const queryAttributes = useCallback(async (service: ServiceDefinition, options: AttributeQueryOptions): Promise<AttributeTableResult> => {
    const runtime = runtimeRef.current;
    if (!runtime) throw new Error("Harita motoru henüz hazır değil.");
    return runtime.queryAttributes(service, options);
  }, []);

  const exportWorkspace = useCallback(() => {
    const runtime = runtimeRef.current;
    if (!runtime) {
      pushToast("Çalışma alanı dışa aktarılamadı: harita motoru hazır değil.", "error");
      return;
    }

    const currentServices = servicesRef.current;
    const snapshot = createWorkspaceSnapshot({
      applicationVersion: APP_VERSION,
      camera: runtime.getCamera(),
      basemap: preferences.basemap,
      layerVisibility: Object.fromEntries(currentServices.map((service) => [service.id, service.visible])),
      layerOpacity: Object.fromEntries(currentServices.map((service) => [service.id, service.opacity])),
      favorites: currentServices.filter((service) => service.favorite).map((service) => service.id),
      bookmarks: preferences.bookmarks
    });
    const blob = new Blob([workspaceSnapshotToJson(snapshot)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `baskent-3b-workspace-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    pushToast("Çalışma alanı paketi hazırlandı.", "success");
  }, [preferences.basemap, preferences.bookmarks, pushToast]);

  const importWorkspace = useCallback(async (value: unknown) => {
    const runtime = runtimeRef.current;
    if (!runtime) throw new Error("Harita motoru henüz hazır değil.");

    const currentServices = servicesRef.current;
    const allowedIds = new Set(currentServices.map((service) => service.id));
    const snapshot = parseWorkspaceSnapshot(value, allowedIds);
    const favorites = new Set(snapshot.favorites);
    const outcomes = new Map<string, Awaited<ReturnType<ArcGISRuntime["setLayerVisible"]>>>();

    await mapWithConcurrency(currentServices, 2, async (service) => {
      const requestedVisible = snapshot.layerVisibility[service.id] ?? false;
      const desiredVisible = requestedVisible && shouldAutoLoadService(service);
      const desiredOpacity = snapshot.layerOpacity[service.id] ?? service.opacity;
      runtime.setOpacity(service.id, desiredOpacity);
      if (service.visible !== desiredVisible) {
        outcomes.set(
          service.id,
          await runtime.setLayerVisible({ ...service, visible: desiredVisible, opacity: desiredOpacity }, desiredVisible)
        );
      }
    });

    const now = new Date().toISOString();
    const nextServices = currentServices.map((service) => {
      const requestedVisible = snapshot.layerVisibility[service.id] ?? false;
      const desiredVisible = requestedVisible && shouldAutoLoadService(service);
      const opacity = snapshot.layerOpacity[service.id] ?? service.opacity;
      const outcome = outcomes.get(service.id);
      if (outcome && !outcome.ok) {
        return {
          ...service,
          ...failurePatch(service, outcome.error, outcome.durationMs, Date.parse(now)),
          opacity,
          favorite: favorites.has(service.id)
        };
      }
      return {
        ...service,
        visible: desiredVisible,
        opacity,
        favorite: favorites.has(service.id),
        status: desiredVisible ? "ready" as const : service.status === "error" ? "idle" as const : service.status,
        error: desiredVisible ? undefined : service.error,
        ...(outcome?.durationMs !== undefined ? { latencyMs: outcome.durationMs, lastLoadedAt: now } : {})
      };
    });

    setServices(nextServices);
    servicesRef.current = nextServices;
    runtime.setBasemap(snapshot.basemap);
    await runtime.goTo(snapshot.camera);

    setPreferences((current) => {
      const next: AppPreferences = {
        ...current,
        basemap: snapshot.basemap,
        layerVisibility: Object.fromEntries(nextServices.map((service) => [service.id, service.visible])),
        layerOpacity: Object.fromEntries(nextServices.map((service) => [service.id, service.opacity])),
        favorites: nextServices.filter((service) => service.favorite).map((service) => service.id),
        camera: snapshot.camera,
        bookmarks: snapshot.bookmarks
      };
      savePreferences(next);
      return next;
    });

    pushToast("Çalışma alanı paketi uygulandı.", "success");
  }, [pushToast]);

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

  const changePerformance = useCallback((performance: PerformanceProfile | "auto") => {
    setPreferences((current) => {
      const next = { ...current, performance };
      savePreferences(next);
      return next;
    });
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
      pushToast("Harita görünümü panoya kopyalandı.", "success");
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
    link.download = `baskent-3d-cbs-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
    link.click();
    pushToast("Harita ekran görüntüsü hazırlandı.", "success");
  }, [pushToast]);

  const addBookmark = useCallback(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const suggested = `Görünüm ${preferences.bookmarks.length + 1}`;
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
    const desired = new Set(bookmark.layerIds);
    const snapshot = servicesRef.current;
    await mapWithConcurrency(snapshot.filter((service) => service.visible !== desired.has(service.id)), 2, async (service) => {
      await toggleLayer(service, desired.has(service.id));
    });
    await runtimeRef.current?.goTo(bookmark.camera);
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
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
        return;
      }
      if (typing) return;
      if (event.key.toLowerCase() === "h") void runtimeRef.current?.goHome();
      if (event.key.toLowerCase() === "o") selectPanel("overview");
      if (event.key.toLowerCase() === "l") selectPanel("layers");
      if (event.key.toLowerCase() === "d") selectPanel("data");
      if (event.key.toLowerCase() === "w") selectPanel("workspace");
      if (event.key.toLowerCase() === "m") setFocusMode((value) => !value);
      if (event.key.toLowerCase() === "f") {
        void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => pushToast("Tam ekran modu açılamadı.", "info"));
      }
      if (event.key === "Escape") {
        if (activeTool) setActiveTool(null);
        else if (panel) setPanel(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTool, panel, pushToast, selectPanel]);

  return (
    <main className={`app-shell ${focusMode ? "is-focus-mode" : ""}`}>
      <div ref={mapRef} className="map-view" aria-label="3B harita" />
      <div className="map-vignette" aria-hidden="true" />

      <header className="topbar">
        <button type="button" className="mobile-menu" onClick={() => setMobilePanelsVisible((value) => !value)} aria-label="Menüyü aç/kapat"><Icon name="menu" /></button>
        <div className="brand">
          <div className="brand-symbol"><span>3B</span><i /></div>
          <div><strong>Altyapı / Üstyapı Koordinasyon</strong><span>Coğrafi Bilgi Sistemleri · CBS Başkent</span></div>
        </div>
        <div className={`live-chip ${online ? "" : "is-offline"}`} title={online ? "Ağ bağlantısı mevcut" : "Ağ bağlantısı yok"}><i /> {online ? "CANLI CBS" : "ÇEVRİMDIŞI"}</div>
        <div ref={searchRef} className="global-search" />
        <div className="top-actions">
          <select className="compact-select" value={preferences.basemap} onChange={(event) => changeBasemap(event.target.value)} aria-label="Altlık harita">
            {basemaps.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select className="compact-select performance-select" value={preferences.performance} onChange={(event) => changePerformance(event.target.value as PerformanceProfile | "auto")} aria-label="Performans profili">
            <option value="auto">Otomatik GPU</option><option value="high">Yüksek</option><option value="balanced">Dengeli</option><option value="eco">Eco</option>
          </select>
          <button type="button" className="top-icon-button" onClick={() => setFocusMode((value) => !value)} title="Harita odak modu" aria-pressed={focusMode}><Icon name={focusMode ? "close" : "eye"} /></button>
          <button type="button" className="top-icon-button" onClick={() => setCommandOpen(true)} title="Komut paleti"><Icon name="command" /><kbd>⌘K</kbd></button>
          <button type="button" className="primary-button share-button" onClick={() => void shareView()}><Icon name="share" /> Paylaş</button>
        </div>
      </header>

      <div ref={navigationRef} className="arcgis-navigation" />

      <ToolRail
        activePanel={panel}
        activeTool={activeTool}
        onPanel={selectPanel}
        onTool={selectTool}
        onHome={() => void runtimeRef.current?.goHome()}
        onScreenshot={() => void takeScreenshot()}
        onCommand={() => setCommandOpen(true)}
      />

      <div className={`panel-zone ${mobilePanelsVisible ? "is-mobile-visible" : ""}`}>
        <ViewTransition name="workspace-panel">
          {panel === "layers" ? (
            <aside className="main-panel" key="layers">
              <button type="button" className="mobile-panel-close" onClick={() => setMobilePanelsVisible(false)}><Icon name="close" /></button>
              <LayerExplorer services={services} onToggle={toggleLayer} onOpacity={setOpacity} onFavorite={toggleFavorite} onZoom={(service) => void zoomLayer(service)} onRetry={retryLayer} />
            </aside>
          ) : panel ? (
            <OperationsPanel
              key={panel}
              panel={panel}
              services={services}
              bookmarks={preferences.bookmarks}
              performance={effectivePerformance}
              online={online}
              onClose={() => setPanel(null)}
              onNavigatePanel={selectPanel}
              onRetryErrors={retryErrors}
              onAddBookmark={addBookmark}
              onGoBookmark={(bookmark) => void goBookmark(bookmark)}
              onDeleteBookmark={deleteBookmark}
              onQueryAttributes={queryAttributes}
              onExportWorkspace={exportWorkspace}
              onImportWorkspace={importWorkspace}
            />
          ) : null}
        </ViewTransition>
      </div>

      {activeTool && (
        <aside className="map-tool-panel">
          <div className="map-tool-header"><strong>{toolTitle(activeTool)}</strong><button type="button" className="icon-ghost" onClick={() => setActiveTool(null)}><Icon name="close" /></button></div>
          <div ref={toolHostRef} className="map-tool-host" />
        </aside>
      )}

      <DetailsPanel result={identify} onClose={() => setIdentify(null)} />
      <StatusBar telemetry={telemetry} services={services} performance={effectivePerformance} />
      <CommandPalette open={commandOpen} services={services} onClose={() => setCommandOpen(false)} onLayer={(service) => void toggleLayer(service, !service.visible)} onTool={selectTool} onPanel={selectPanel} onHome={() => void runtimeRef.current?.goHome()} onScreenshot={() => void takeScreenshot()} />
      <ToastStack items={toasts} onDismiss={(id) => setToasts((items) => items.filter((item) => item.id !== id))} />

      {!ready && !bootError && <div className="boot-screen"><div className="boot-logo"><span>3B</span><i /></div><div><strong>Başkent 3B CBS hazırlanıyor</strong><span>Harita motoru ve servis kataloğu yükleniyor…</span></div><div className="boot-progress"><i /></div></div>}
      {bootError && <div className="fatal-screen"><Icon name="warning" size={34} /><h1>Uygulama başlatılamadı</h1><p>{bootError}</p><button type="button" className="primary-button" onClick={() => location.reload()}><Icon name="refresh" /> Yeniden yükle</button></div>}
    </main>
  );
}

function toolTitle(tool: Exclude<ToolId, null>): string {
  const labels: Record<Exclude<ToolId, null>, string> = {
    legend: "Lejant", basemap: "Altlık Galerisi", distance: "3B Mesafe", area: "3B Alan", daylight: "Gün Işığı",
    slice: "Kesit", lineOfSight: "Görüş Hattı", elevation: "Yükseklik Profili"
  };
  return labels[tool];
}

function createId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function mapWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index];
      if (item !== undefined) await worker(item);
    }
  });
  await Promise.all(runners);
}
