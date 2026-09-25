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
import type { ServiceAvailability, ServiceDefinition, ServiceKind } from "../types";
import { Icon } from "./Icon";

interface Props {
  services: ServiceDefinition[];
  currentScale?: number;
  onToggle: (service: ServiceDefinition, visible: boolean) => Promise<void>;
  onOpacity: (service: ServiceDefinition, opacity: number) => void;
  onFavorite: (service: ServiceDefinition) => void;
  onZoom: (service: ServiceDefinition) => void;
  onRetry: (service: ServiceDefinition) => Promise<void>;
}

const kinds: Array<{ value: ServiceKind | "all"; label: string }> = [
  { value: "all", label: "Tümü" },
  { value: "SceneServer", label: "3B" },
  { value: "FeatureServer", label: "Feature" },
  { value: "MapServer", label: "Map" },
  { value: "WMS", label: "WMS" },
  { value: "WFS", label: "WFS" }
];

export const LayerExplorer = memo(function LayerExplorer({ services, currentScale, onToggle, onOpacity, onFavorite, onZoom, onRetry }: Props) {
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

  const groups = useMemo(
    () => groupServicesInStableOrder(filtered),
    [filtered]
  );

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
    <section className="panel-content layer-explorer" aria-label="Katman kataloğu">
      <div className="panel-heading panel-heading-rich">
        <div>
          <span className="eyebrow">CBS OPERASYON KATALOĞU</span>
          <h2>Katmanlar</h2>
          <p>Ankara 3B sahnesindeki veri servislerini yönetin.</p>
        </div>
        <div className="metric-badge"><strong>{metrics.active}</strong><span>aktif</span></div>
      </div>

      <div className="catalog-overview catalog-overview-v9" aria-label="Katalog özeti">
        <div className="catalog-stat is-active"><strong>{metrics.active}</strong><span>Aktif</span></div>
        <div className="catalog-stat is-ready"><strong>{metrics.verified}</strong><span>Doğrulandı</span></div>
        <div className={`catalog-stat ${metrics.degraded ? "is-warn" : ""}`}><strong>{metrics.degraded}</strong><span>Kısıtlı</span></div>
        <div className={`catalog-stat ${metrics.unavailable ? "is-error" : ""}`}><strong>{metrics.unavailable}</strong><span>Ulaşılamıyor</span></div>
        <div className="catalog-stat"><strong>{services.length}</strong><span>Servis</span></div>
      </div>

      <div className="catalog-actions">
        <button type="button" className="catalog-action" onClick={() => void deactivateVisible()} disabled={metrics.active === 0 || bulkBusy}>
          <Icon name="eyeOff" size={14} /> Aktifleri kapat
        </button>
        <button
          type="button"
          className={`catalog-action ${actionableErrors ? "has-error" : ""}`}
          onClick={() => void retryErrors()}
          disabled={actionableErrors === 0 || bulkBusy || services.every((service) => !isRetryableFailure(service, renderHealth[service.id]))}
        >
          <Icon name="refresh" size={14} /> Uygun hataları dene
        </button>
      </div>

      <label className="search-field">
        <Icon name="search" size={16} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Katman, kurum veya servis ara…" />
        {query && <button type="button" className="icon-ghost" onClick={() => setQuery("")} aria-label="Aramayı temizle"><Icon name="close" size={14} /></button>}
      </label>

      <div className="filter-row" role="group" aria-label="Servis türü filtresi">
        {kinds.map((item) => (
          <button key={item.value} type="button" className={`filter-chip ${kind === item.value ? "is-active" : ""}`} onClick={() => setKind(item.value)}>{item.label}</button>
        ))}
      </div>

      <div className="availability-filter" role="group" aria-label="Doğrulama durumu filtresi">
        {([
          ["all", "Tüm durumlar"],
          ["verified", "Doğrulandı"],
          ["degraded", "Kısıtlı"],
          ["unavailable", "Ulaşılamıyor"],
          ["unknown", "Doğrulanmadı"]
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`availability-chip availability-${value} ${availability === value ? "is-active" : ""}`}
            onClick={() => setAvailability(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="toggle-filters">
        <label><input type="checkbox" checked={activeOnly} onChange={(event) => setActiveOnly(event.target.checked)} /> <span>Sadece aktif</span></label>
        <label><input type="checkbox" checked={favoriteOnly} onChange={(event) => setFavoriteOnly(event.target.checked)} /> <span>Favoriler</span></label>
        {metrics.active > 0 && <span className="filter-circuit-count">{metrics.renderReady}/{metrics.active} render hazır</span>}
        {metrics.cooling > 0 && <span className="filter-circuit-count">{metrics.cooling} devre kesici</span>}
        <span className="filter-result-count">{filtered.length} / {services.length}</span>
      </div>

      <div className="layer-groups">
        {groups.length === 0 && <div className="empty-state"><Icon name="layers" size={28} /><strong>Katman bulunamadı</strong><span>Arama veya filtreyi değiştirin.</span></div>}
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
                  >
                    <div className="layer-card-main">
                      <button
                        type="button"
                        className={`visibility-button ${service.visible ? "is-on" : ""}`}
                        onClick={() => void onToggle(service, !service.visible)}
                        aria-label={`${service.displayName} görünürlüğü`}
                        aria-pressed={service.visible}
                        disabled={service.status === "loading"}
                      >
                        <Icon name={service.visible ? "eye" : "eyeOff"} size={16} />
                      </button>

                      <div className="layer-card-title">
                        <strong title={service.displayName}>{service.displayName}</strong>
                        <div className="layer-meta-row">
                          <span className={`kind-pill kind-${service.kind.toLowerCase()}`}>{service.kind === "SceneServer" ? "3B SCENE" : service.kind}</span>
                          <span className={`status-dot status-${visualStatus}`} />
                          <span>{statusLabel(service, currentScale, layerRender)}</span>
                          <span className={`availability-badge availability-${service.availability}`}>{availabilityLabel(service)}</span>
                          {service.latencyMs !== undefined && <span className="layer-latency" title={latencyLabel(service.latencyMs)}>{service.latencyMs} ms</span>}
                        </div>
                      </div>

                      <button type="button" className={`favorite-button ${service.favorite ? "is-on" : ""}`} onClick={() => onFavorite(service)} aria-label="Favori" aria-pressed={service.favorite}><Icon name="star" size={15} /></button>
                    </div>

                    <div className="layer-owner-line">
                      <span>{service.owner}</span>
                      {service.favorite && <em>Favori</em>}
                    </div>

                    <div className="layer-actions">
                      <div className="opacity-control" title="Saydamlık">
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
                        title={service.operationalExtent ? "Doğrulanmış çalışma kapsamına git" : "Katmana yaklaş"}
                      >
                        <Icon name="zoom" size={15} />
                      </button>
                      <button type="button" className="icon-ghost" onClick={() => setOpenInfo(openInfo === service.id ? null : service.id)} title="Servis bilgisi" aria-expanded={openInfo === service.id}><Icon name="info" size={15} /></button>
                      {(service.status === "error" || renderFailed) && (
                        <button
                          type="button"
                          className="icon-ghost is-danger"
                          onClick={() => void retryService(service)}
                          title={retryTitle(service, renderFailed)}
                          disabled={(service.status === "error" && service.availability === "unavailable") || isServiceCoolingDown(service)}
                        >
                          <Icon name="refresh" size={15} />
                        </button>
                      )}
                    </div>

                    {openInfo === service.id && (
                      <div className="layer-info-box">
                        <dl>
                          <div><dt>Veri sahibi</dt><dd>{service.owner}</dd></div>
                          <div><dt>Servis</dt><dd>{hostLabel(service.url)}</dd></div>
                          <div><dt>Canlı durum</dt><dd>{service.error ?? statusLabel(service, currentScale, layerRender)}</dd></div>
                          <div><dt>Canlı render</dt><dd>{service.visible ? (layerRenderHealthLabel(layerRender) ?? "LayerView bekleniyor") : "Kapalı"}</dd></div>
                          <div><dt>Doğrulama</dt><dd>{availabilityLabel(service)}</dd></div>
                          <div><dt>Erişim profili</dt><dd>{accessLabel(service)}</dd></div>
                          <div><dt>Doğrulama notu</dt><dd>{service.verificationReason ?? "Henüz harici doğrulama kaydı yok."}</dd></div>
                          <div><dt>Doğrulama zamanı</dt><dd>{service.verifiedAt ? new Date(service.verifiedAt).toLocaleString("tr-TR") : "—"}</dd></div>
                          <div><dt>Harici doğrulama gecikmesi</dt><dd>{service.verificationLatencyMs !== undefined ? `${service.verificationLatencyMs} ms` : "—"}</dd></div>
                          <div><dt>Çalışma ölçeği</dt><dd>{operationalScaleLabel(service)}</dd></div>
                          <div><dt>Önerilen açılış ölçeği</dt><dd>{service.recommendedScale ? `1:${formatScale(service.recommendedScale)}` : "—"}</dd></div>
                          <div><dt>Çalışma kapsamı kaynağı</dt><dd>{navigationSourceLabel(service)}</dd></div>
                          <div><dt>Kapsam doğrulaması</dt><dd>{service.navigationVerifiedAt ? new Date(service.navigationVerifiedAt).toLocaleString("tr-TR") : "—"}</dd></div>
                          <div><dt>Geniş görünüm politikası</dt><dd>{service.renderScaleSensitive ? "Sunucu yükünü azaltmak için doğrulanmış çalışma ölçeği uygulanır." : "Ek ölçek kısıtı yok."}</dd></div>
                          <div><dt>Devre kesici</dt><dd>{cooldownRemaining(service) ? `${cooldownRemaining(service)} bekleme` : "Açık"}</dd></div>
                          <div><dt>Açılış süresi</dt><dd>{service.latencyMs !== undefined ? `${service.latencyMs} ms · ${latencyLabel(service.latencyMs)}` : "Ölçülmedi"}</dd></div>
                          <div><dt>Son canlı ölçüm</dt><dd>{service.lastLoadedAt ? new Date(service.lastLoadedAt).toLocaleString("tr-TR") : "—"}</dd></div>
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
  if (service.status === "loading") return "Bağlanıyor";
  if (service.status === "error") {
    const remaining = cooldownRemaining(service);
    return remaining ? `Beklemede · ${remaining}` : "Hata";
  }
  if (service.visible) {
    const renderLabel = layerRenderHealthLabel(renderHealth);
    if (renderLabel) return renderLabel;
    if (service.renderScaleSensitive && !isOperationalScale(service, currentScale)) return "Ölçek dışında";
    if (service.status === "ready") return "Render bekleniyor";
  }
  if (service.status === "ready") return "Hazır";
  return service.visible ? "Bekliyor" : "Kapalı";
}

function isRetryableFailure(service: ServiceDefinition, renderHealth?: LayerRenderHealthState): boolean {
  if (isServiceCoolingDown(service)) return false;
  if (isLayerRenderFailure(renderHealth)) return true;
  return service.status === "error" && service.availability !== "unavailable";
}

function retryTitle(service: ServiceDefinition, renderFailed: boolean): string {
  if (isServiceCoolingDown(service)) return `Devre kesici: ${cooldownRemaining(service) ?? "beklemede"}`;
  if (renderFailed) return "Render katmanını yeniden oluştur";
  if (service.availability === "unavailable") return "Harici doğrulamada ulaşılamıyor";
  return "Yeniden dene";
}

function accessLabel(service: ServiceDefinition): string {
  if (service.access === "public-browser") return "Tarayıcıdan doğrulandı";
  if (service.access === "browser-blocked") return "Tarayıcı CORS erişimi engelli";
  if (service.access === "network-restricted") return "Ağ / kurum erişimi gerekebilir";
  if (service.access === "server-error") return "Sunucu protokol hatası";
  return "Bilinmiyor";
}
