import { memo, useDeferredValue, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { hostLabel, serviceMatches } from "../lib/catalog";
import { latencyLabel } from "../lib/serviceMetrics";
import { groupServicesInStableOrder } from "../lib/layerOrdering";
import { availabilityLabel, cooldownRemaining, isServiceCoolingDown } from "../lib/serviceHealth";
import {
  getLayerRenderHealthSnapshot,
  getServerLayerRenderHealthSnapshot,
  isLayerRenderFailure,
  layerRenderHealthLabel,
  layerRenderHealthVisualStatus,
  pruneLayerRenderHealth,
  setLayerRenderHealthPreparing,
  subscribeLayerRenderHealth,
  type LayerRenderHealthState
} from "../lib/layerRenderHealth";
import {
  formatScale,
  isOperationalScale,
  navigationSourceLabel,
  operationalScaleLabel
} from "../lib/serviceNavigation";
import type { LayerOrderDirection, ServiceAvailability, ServiceDefinition, ServiceKind } from "../types";
import { Icon } from "./Icon";

interface Props {
  services: ServiceDefinition[];
  currentScale?: number;
  layerOrder: string[];
  onToggle: (service: ServiceDefinition, visible: boolean) => Promise<void>;
  onOpacity: (service: ServiceDefinition, opacity: number) => void;
  onFavorite: (service: ServiceDefinition) => void;
  onZoom: (service: ServiceDefinition) => void;
  onRetry: (service: ServiceDefinition) => Promise<void>;
  onMoveLayer: (serviceId: string, direction: LayerOrderDirection) => void;
}

const kinds: Array<{ value: ServiceKind | "all"; label: string }> = [
  { value: "all", label: "Tümü" },
  { value: "SceneServer", label: "3B" },
  { value: "FeatureServer", label: "Detay" },
  { value: "MapServer", label: "Harita" },
  { value: "WMS", label: "WMS" },
  { value: "WFS", label: "WFS" }
];

export const LayerExplorer = memo(function LayerExplorer({
  services,
  currentScale,
  layerOrder,
  onToggle,
  onOpacity,
  onFavorite,
  onZoom,
  onRetry,
  onMoveLayer
}: Props) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [kind, setKind] = useState<ServiceKind | "all">("all");
  const [activeOnly, setActiveOnly] = useState(false);
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [availability, setAvailability] = useState<ServiceAvailability | "all">("all");
  const [openInfo, setOpenInfo] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const renderHealth = useSyncExternalStore(
    subscribeLayerRenderHealth,
    getLayerRenderHealthSnapshot,
    getServerLayerRenderHealthSnapshot
  );

  useEffect(() => {
    const visibleIds = new Set(services.filter((service) => service.visible).map((service) => service.id));
    pruneLayerRenderHealth(visibleIds);
  }, [services]);

  const filtered = useMemo(() => services.filter((service) => {
    if (kind !== "all" && service.kind !== kind) return false;
    if (activeOnly && !service.visible) return false;
    if (favoriteOnly && !service.favorite) return false;
    if (availability !== "all" && service.availability !== availability) return false;
    return serviceMatches(service, deferredQuery);
  }), [services, kind, activeOnly, favoriteOnly, availability, deferredQuery]);

  const groups = useMemo(() => groupServicesInStableOrder(filtered), [filtered]);
  const activeStack = useMemo(() => {
    const rank = new Map(layerOrder.map((id, index) => [id, index]));
    return services
      .filter((service) => service.visible)
      .sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  }, [layerOrder, services]);

  const metrics = useMemo(() => ({
    active: services.filter((service) => service.visible).length,
    ready: services.filter((service) => service.status === "ready").length,
    loading: services.filter((service) => service.status === "loading").length,
    error: services.filter((service) => service.status === "error").length,
    renderFailed: services.filter((service) => service.visible && isLayerRenderFailure(renderHealth[service.id])).length,
    renderReady: services.filter((service) => service.visible && renderHealth[service.id]?.state === "ready").length,
    favorite: services.filter((service) => service.favorite).length,
    verified: services.filter((service) => service.availability === "verified").length,
    degraded: services.filter((service) => service.availability === "degraded").length,
    unavailable: services.filter((service) => service.availability === "unavailable").length,
    cooling: services.filter((service) => isServiceCoolingDown(service)).length
  }), [services, renderHealth]);

  const filtersActive = query.length > 0 || kind !== "all" || activeOnly || favoriteOnly || availability !== "all";

  const resetFilters = () => {
    setQuery("");
    setKind("all");
    setActiveOnly(false);
    setFavoriteOnly(false);
    setAvailability("all");
  };

  const deactivateVisible = async () => {
    const visible = services.filter((service) => service.visible);
    if (visible.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      for (const service of visible) await onToggle(service, false);
    } finally {
      setBulkBusy(false);
    }
  };

  const retryService = async (service: ServiceDefinition) => {
    setLayerRenderHealthPreparing(service.id);
    await onRetry(service);
  };

  const retryErrors = async () => {
    const errors = services.filter((service) => isRetryableFailure(service, renderHealth[service.id]));
    if (errors.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      for (const service of errors) await retryService(service);
    } finally {
      setBulkBusy(false);
    }
  };

  const actionableErrors = metrics.error + metrics.renderFailed;

  return (
    <section className="panel-content layer-explorer" aria-label="Harita katmanları" aria-busy={bulkBusy}>
      <div className="panel-heading panel-heading-rich">
        <div>
          <span className="eyebrow">HARİTA KATMANLARI</span>
          <h2>Katmanlar</h2>
          <p>Görmek istediğiniz verileri açın; uygun konum ve zoom gerektiğinde otomatik ayarlanır.</p>
        </div>
        <div className="metric-badge" aria-label={`${metrics.active} açık katman`}><strong>{metrics.active}</strong><span>açık</span></div>
      </div>

      <div className="catalog-overview catalog-overview-v9" aria-label="Katman özeti">
        <div className="catalog-stat is-active"><strong>{metrics.active}</strong><span>Açık</span></div>
        <div className="catalog-stat is-ready"><strong>{metrics.verified}</strong><span>Erişilebilir</span></div>
        <div className={`catalog-stat ${metrics.degraded ? "is-warn" : ""}`}><strong>{metrics.degraded}</strong><span>Kısıtlı</span></div>
        <div className={`catalog-stat ${metrics.unavailable ? "is-error" : ""}`}><strong>{metrics.unavailable}</strong><span>Sorunlu</span></div>
        <div className="catalog-stat"><strong>{services.length}</strong><span>Toplam</span></div>
      </div>

      <div className="catalog-actions">
        <button type="button" className="catalog-action" onClick={() => void deactivateVisible()} disabled={metrics.active === 0 || bulkBusy}>
          <Icon name="eyeOff" size={14} /> Açık katmanları kapat
        </button>
        <button
          type="button"
          className={`catalog-action ${actionableErrors ? "has-error" : ""}`}
          onClick={() => void retryErrors()}
          disabled={actionableErrors === 0 || bulkBusy || services.every((service) => !isRetryableFailure(service, renderHealth[service.id]))}
        >
          <Icon name="refresh" size={14} /> Sorunlu katmanları dene
        </button>
      </div>

      {activeStack.length > 0 && (
        <section className="layer-stack-editor" aria-labelledby="layer-stack-title">
          <div className="layer-stack-heading">
            <div>
              <span className="eyebrow">ÇİZİM SIRASI</span>
              <strong id="layer-stack-title">Açık katman yığını</strong>
            </div>
            <span>{activeStack.length} katman</span>
          </div>
          <p className="layer-stack-note">Listenin üstündeki katman haritada da üstte çizilir.</p>
          <ol className="layer-stack-list">
            {activeStack.map((service, index) => (
              <li key={service.id} className="layer-stack-item">
                <span className="layer-stack-rank" aria-hidden="true">{index + 1}</span>
                <span className="layer-stack-name" title={service.displayName}>{service.displayName}</span>
                <span className={`kind-pill kind-${service.kind.toLowerCase()}`}>{serviceKindLabel(service.kind)}</span>
                <div className="layer-stack-buttons" role="group" aria-label={`${service.displayName} çizim sırası`}>
                  <button
                    type="button"
                    className="icon-ghost"
                    onClick={() => onMoveLayer(service.id, "up")}
                    disabled={index === 0}
                    aria-label={`${service.displayName} katmanını üste taşı`}
                    title="Üste taşı"
                  >
                    <span aria-hidden="true">↑</span>
                  </button>
                  <button
                    type="button"
                    className="icon-ghost"
                    onClick={() => onMoveLayer(service.id, "down")}
                    disabled={index === activeStack.length - 1}
                    aria-label={`${service.displayName} katmanını alta taşı`}
                    title="Alta taşı"
                  >
                    <span aria-hidden="true">↓</span>
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <label className="search-field">
        <Icon name="search" size={16} />
        <input
          type="search"
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Katman veya kurum ara…"
          aria-label="Katman veya kurum ara"
        />
        {query && <button type="button" className="icon-ghost" onClick={() => setQuery("")} aria-label="Aramayı temizle"><Icon name="close" size={14} /></button>}
      </label>

      <div className="filter-row" role="group" aria-label="Katman türü filtresi">
        {kinds.map((item) => (
          <button
            key={item.value}
            type="button"
            className={`filter-chip ${kind === item.value ? "is-active" : ""}`}
            aria-pressed={kind === item.value}
            onClick={() => setKind(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="availability-filter" role="group" aria-label="Bağlantı durumu filtresi">
        {([
          ["all", "Tüm durumlar"],
          ["verified", "Erişilebilir"],
          ["degraded", "Kısıtlı"],
          ["unavailable", "Sorunlu"],
          ["unknown", "Bekleniyor"]
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`availability-chip availability-${value} ${availability === value ? "is-active" : ""}`}
            aria-pressed={availability === value}
            onClick={() => setAvailability(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="toggle-filters">
        <label><input type="checkbox" checked={activeOnly} onChange={(event) => setActiveOnly(event.target.checked)} /> <span>Sadece açık</span></label>
        <label><input type="checkbox" checked={favoriteOnly} onChange={(event) => setFavoriteOnly(event.target.checked)} /> <span>Favoriler</span></label>
        {metrics.active > 0 && <span className="filter-circuit-count">{metrics.renderReady}/{metrics.active} haritada hazır</span>}
        {metrics.cooling > 0 && <span className="filter-circuit-count">{metrics.cooling} geçici beklemede</span>}
        <span className="filter-result-count" aria-live="polite">{filtered.length} / {services.length}</span>
        {filtersActive && <button type="button" className="filter-reset" onClick={resetFilters}>Filtreleri temizle</button>}
      </div>

      <div className="layer-groups">
        {groups.length === 0 && (
          <div className="empty-state">
            <Icon name="layers" size={28} />
            <strong>Katman bulunamadı</strong>
            <span>Arama veya filtreleri değiştirin.</span>
            {filtersActive && <button type="button" className="catalog-action" onClick={resetFilters}>Tüm katmanları göster</button>}
          </div>
        )}
        {groups.map(([organization, items]) => {
          const collapsed = collapsedGroups.has(organization);
          return (
            <section className="layer-group" key={organization}>
              <button
                type="button"
                className="group-heading"
                aria-expanded={!collapsed}
                onClick={() => setCollapsedGroups((current) => {
                  const next = new Set(current);
                  collapsed ? next.delete(organization) : next.add(organization);
                  return next;
                })}
              >
                <span className={`chevron ${collapsed ? "" : "is-open"}`}><Icon name="chevron" size={14} /></span>
                <span title={organization}>{organization}</span>
                <em>{items.length}</em>
              </button>

              {!collapsed && items.map((service) => {
                const layerRender = service.visible ? renderHealth[service.id] : undefined;
                const visualStatus = service.status === "error"
                  ? "error"
                  : service.status === "loading"
                    ? "loading"
                    : (layerRenderHealthVisualStatus(layerRender) ?? service.status);
                const renderFailed = isLayerRenderFailure(layerRender);
                return (
                  <article
                    key={service.id}
                    className={`layer-card ${service.visible ? "is-active" : ""} status-${visualStatus} availability-${service.availability}`}
                    data-kind={service.kind}
                    data-availability={service.availability}
                    data-render-state={layerRender?.state ?? "none"}
                    aria-label={service.displayName}
                  >
                    <div className="layer-card-main">
                      <button
                        type="button"
                        className={`visibility-button ${service.visible ? "is-on" : ""}`}
                        onClick={() => void onToggle(service, !service.visible)}
                        aria-label={`${service.displayName} katmanını ${service.visible ? "kapat" : "aç"}`}
                        aria-pressed={service.visible}
                        disabled={service.status === "loading"}
                      >
                        <Icon name={service.visible ? "eye" : "eyeOff"} size={16} />
                      </button>

                      <div className="layer-card-title">
                        <strong title={service.displayName}>{service.displayName}</strong>
                        <div className="layer-meta-row">
                          <span className={`kind-pill kind-${service.kind.toLowerCase()}`}>{serviceKindLabel(service.kind)}</span>
                          <span className={`status-dot status-${visualStatus}`} aria-hidden="true" />
                          <span>{statusLabel(service, currentScale, layerRender)}</span>
                          <span className={`availability-badge availability-${service.availability}`}>{availabilityLabel(service)}</span>
                          {service.latencyMs !== undefined && <span className="layer-latency" title={latencyLabel(service.latencyMs)}>{service.latencyMs} ms</span>}
                        </div>
                      </div>

                      <button
                        type="button"
                        className={`favorite-button ${service.favorite ? "is-on" : ""}`}
                        onClick={() => onFavorite(service)}
                        aria-label={`${service.displayName} ${service.favorite ? "favorilerden çıkar" : "favorilere ekle"}`}
                        aria-pressed={service.favorite}
                      >
                        <Icon name="star" size={15} />
                      </button>
                    </div>

                    <div className="layer-owner-line">
                      <span>{service.owner}</span>
                      {service.favorite && <em>Favori</em>}
                    </div>

                    <div className="layer-actions">
                      <div className="opacity-control" title="Katman saydamlığı">
                        <input
                          type="range" min="0" max="1" step="0.05" value={service.opacity}
                          onChange={(event) => onOpacity(service, Number(event.target.value))}
                          disabled={!service.visible}
                          aria-label={`${service.displayName} saydamlığı`}
                        />
                        <span>{Math.round(service.opacity * 100)}%</span>
                      </div>
                      <button
                        type="button"
                        className="icon-ghost"
                        onClick={() => onZoom(service)}
                        disabled={!service.visible && !service.operationalExtent}
                        aria-label={`${service.displayName} katmanına git`}
                        title={service.operationalExtent ? "Katmanın çalışma alanına git" : "Katmana yaklaş"}
                      >
                        <Icon name="zoom" size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-ghost"
                        onClick={() => setOpenInfo(openInfo === service.id ? null : service.id)}
                        title="Katman bilgisi"
                        aria-label={`${service.displayName} katman bilgisini ${openInfo === service.id ? "kapat" : "aç"}`}
                        aria-expanded={openInfo === service.id}
                      >
                        <Icon name="info" size={15} />
                      </button>
                      {(service.status === "error" || renderFailed) && (
                        <button
                          type="button"
                          className="icon-ghost is-danger"
                          onClick={() => void retryService(service)}
                          title={retryTitle(service, renderFailed)}
                          aria-label={`${service.displayName} katmanını yeniden dene`}
                          disabled={(service.status === "error" && service.availability === "unavailable") || isServiceCoolingDown(service)}
                        >
                          <Icon name="refresh" size={15} />
                        </button>
                      )}
                    </div>

                    {openInfo === service.id && (
                      <div className="layer-info-box" role="region" aria-label={`${service.displayName} ayrıntıları`}>
                        <dl>
                          <div><dt>Veri sahibi</dt><dd>{service.owner}</dd></div>
                          <div><dt>Servis kaynağı</dt><dd>{hostLabel(service.url)}</dd></div>
                          <div><dt>Katman durumu</dt><dd>{service.error ?? statusLabel(service, currentScale, layerRender)}</dd></div>
                          <div><dt>Haritada görünüm</dt><dd>{service.visible ? (layerRenderHealthLabel(layerRender) ?? "Hazırlanıyor") : "Kapalı"}</dd></div>
                          <div><dt>Bağlantı doğrulaması</dt><dd>{availabilityLabel(service)}</dd></div>
                          <div><dt>Erişim</dt><dd>{accessLabel(service)}</dd></div>
                          <div><dt>Bağlantı notu</dt><dd>{service.verificationReason ?? "Henüz harici doğrulama kaydı yok."}</dd></div>
                          <div><dt>Son doğrulama</dt><dd>{service.verifiedAt ? new Date(service.verifiedAt).toLocaleString("tr-TR") : "—"}</dd></div>
                          <div><dt>Bağlantı gecikmesi</dt><dd>{service.verificationLatencyMs !== undefined ? `${service.verificationLatencyMs} ms` : "—"}</dd></div>
                          <div><dt>Çalışma ölçeği</dt><dd>{operationalScaleLabel(service)}</dd></div>
                          <div><dt>Önerilen açılış ölçeği</dt><dd>{service.recommendedScale ? `1:${formatScale(service.recommendedScale)}` : "—"}</dd></div>
                          <div><dt>Kapsam bilgisi</dt><dd>{navigationSourceLabel(service)}</dd></div>
                          <div><dt>Kapsam doğrulaması</dt><dd>{service.navigationVerifiedAt ? new Date(service.navigationVerifiedAt).toLocaleString("tr-TR") : "—"}</dd></div>
                          <div><dt>Zoom davranışı</dt><dd>{service.renderScaleSensitive ? "Katman açıkken doğrulanmış çalışma ölçeği korunur." : "Ek zoom kısıtı yok."}</dd></div>
                          <div><dt>Geçici koruma</dt><dd>{cooldownRemaining(service) ? `${cooldownRemaining(service)} bekleme` : "Hazır"}</dd></div>
                          <div><dt>Açılış süresi</dt><dd>{service.latencyMs !== undefined ? `${service.latencyMs} ms · ${latencyLabel(service.latencyMs)}` : "Ölçülmedi"}</dd></div>
                          <div><dt>Son başarılı açılış</dt><dd>{service.lastLoadedAt ? new Date(service.lastLoadedAt).toLocaleString("tr-TR") : "—"}</dd></div>
                        </dl>
                      </div>
                    )}
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
    </section>
  );
});

function statusLabel(service: ServiceDefinition, currentScale?: number, renderHealth?: LayerRenderHealthState): string {
  if (service.status === "loading") return "Açılıyor";
  if (service.status === "error") {
    const remaining = cooldownRemaining(service);
    return remaining ? `Beklemede · ${remaining}` : "Açılamadı";
  }
  if (service.visible) {
    const renderLabel = layerRenderHealthLabel(renderHealth);
    if (renderLabel) return renderLabel;
    if (service.renderScaleSensitive && !isOperationalScale(service, currentScale)) return "Zoom ayarlanıyor";
    if (service.status === "ready") return "Haritada hazırlanıyor";
  }
  if (service.status === "ready") return "Hazır";
  return service.visible ? "Hazırlanıyor" : "Kapalı";
}

function isRetryableFailure(service: ServiceDefinition, renderHealth?: LayerRenderHealthState): boolean {
  if (isServiceCoolingDown(service)) return false;
  if (isLayerRenderFailure(renderHealth)) return true;
  return service.status === "error" && service.availability !== "unavailable";
}

function retryTitle(service: ServiceDefinition, renderFailed: boolean): string {
  if (isServiceCoolingDown(service)) return `Geçici bekleme: ${cooldownRemaining(service) ?? "beklemede"}`;
  if (renderFailed) return "Harita görünümünü yeniden hazırla";
  if (service.availability === "unavailable") return "Servis şu anda erişilemiyor";
  return "Yeniden dene";
}

function accessLabel(service: ServiceDefinition): string {
  if (service.access === "public-browser") return "Doğrudan erişilebilir";
  if (service.access === "browser-blocked") return "Tarayıcı erişimi sağlayıcı tarafından kısıtlı";
  if (service.access === "network-restricted") return "Onaylı ağ / kurum erişimi gerekli";
  if (service.access === "server-error") return "Servis yanıtında protokol sorunu var";
  return "Henüz doğrulanmadı";
}

function serviceKindLabel(kind: ServiceKind): string {
  if (kind === "SceneServer") return "3B";
  if (kind === "FeatureServer") return "DETAY";
  if (kind === "MapServer") return "HARİTA";
  return kind;
}
