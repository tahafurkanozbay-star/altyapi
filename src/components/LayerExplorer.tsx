import { memo, useDeferredValue, useMemo, useState } from "react";
import { hostLabel, serviceMatches } from "../lib/catalog";
import type { ServiceDefinition, ServiceKind } from "../types";
import { Icon } from "./Icon";

interface Props {
  services: ServiceDefinition[];
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

export const LayerExplorer = memo(function LayerExplorer({ services, onToggle, onOpacity, onFavorite, onZoom, onRetry }: Props) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [kind, setKind] = useState<ServiceKind | "all">("all");
  const [activeOnly, setActiveOnly] = useState(false);
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [openInfo, setOpenInfo] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => services.filter((service) => {
    if (kind !== "all" && service.kind !== kind) return false;
    if (activeOnly && !service.visible) return false;
    if (favoriteOnly && !service.favorite) return false;
    return serviceMatches(service, deferredQuery);
  }), [services, kind, activeOnly, favoriteOnly, deferredQuery]);

  const groups = useMemo(() => {
    const map = new Map<string, ServiceDefinition[]>();
    for (const service of filtered) {
      const list = map.get(service.organization) ?? [];
      list.push(service);
      map.set(service.organization, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => Number(b.visible) - Number(a.visible) || Number(b.favorite) - Number(a.favorite) || a.displayName.localeCompare(b.displayName, "tr"));
    }
    return [...map.entries()];
  }, [filtered]);

  const activeCount = services.filter((service) => service.visible).length;

  return (
    <section className="panel-content layer-explorer" aria-label="Katman kataloğu">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">CBS KATALOĞU</span>
          <h2>Katmanlar</h2>
        </div>
        <div className="metric-badge"><strong>{activeCount}</strong><span>aktif</span></div>
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
      <div className="toggle-filters">
        <label><input type="checkbox" checked={activeOnly} onChange={(event) => setActiveOnly(event.target.checked)} /> Sadece aktif</label>
        <label><input type="checkbox" checked={favoriteOnly} onChange={(event) => setFavoriteOnly(event.target.checked)} /> Favoriler</label>
        <span>{filtered.length} / {services.length}</span>
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
              {!collapsed && items.map((service) => (
                <article key={service.id} className={`layer-card ${service.visible ? "is-active" : ""}`}>
                  <div className="layer-card-main">
                    <button
                      type="button"
                      className={`visibility-button ${service.visible ? "is-on" : ""}`}
                      onClick={() => void onToggle(service, !service.visible)}
                      aria-label={`${service.displayName} görünürlüğü`}
                      disabled={service.status === "loading"}
                    >
                      <Icon name={service.visible ? "eye" : "eyeOff"} size={16} />
                    </button>
                    <div className="layer-card-title">
                      <strong title={service.displayName}>{service.displayName}</strong>
                      <div className="layer-meta-row">
                        <span className={`kind-pill kind-${service.kind.toLowerCase()}`}>{service.kind === "SceneServer" ? "3B SCENE" : service.kind}</span>
                        <span className={`status-dot status-${service.status}`} />
                        <span>{statusLabel(service)}</span>
                      </div>
                    </div>
                    <button type="button" className={`favorite-button ${service.favorite ? "is-on" : ""}`} onClick={() => onFavorite(service)} aria-label="Favori"><Icon name="star" size={15} /></button>
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
                    <button type="button" className="icon-ghost" onClick={() => onZoom(service)} disabled={!service.visible} title="Katmana yaklaş"><Icon name="zoom" size={15} /></button>
                    <button type="button" className="icon-ghost" onClick={() => setOpenInfo(openInfo === service.id ? null : service.id)} title="Servis bilgisi"><Icon name="info" size={15} /></button>
                    {service.status === "error" && <button type="button" className="icon-ghost is-danger" onClick={() => void onRetry(service)} title="Yeniden dene"><Icon name="refresh" size={15} /></button>}
                  </div>

                  {openInfo === service.id && (
                    <div className="layer-info-box">
                      <dl>
                        <div><dt>Veri sahibi</dt><dd>{service.owner}</dd></div>
                        <div><dt>Servis</dt><dd>{hostLabel(service.url)}</dd></div>
                        <div><dt>Durum</dt><dd>{service.error ?? statusLabel(service)}</dd></div>
                      </dl>
                    </div>
                  )}
                </article>
              ))}
            </section>
          );
        })}
      </div>
    </section>
  );
});

function statusLabel(service: ServiceDefinition): string {
  if (service.status === "loading") return "Bağlanıyor";
  if (service.status === "ready") return "Hazır";
  if (service.status === "error") return "Hata";
  return service.visible ? "Bekliyor" : "Kapalı";
}
