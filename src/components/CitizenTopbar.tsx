import type { RefObject } from "react";
import { Icon } from "./Icon";

const BASEMAPS = [
  ["hybrid", "Hibrit"],
  ["satellite", "Uydu"],
  ["topo-vector", "Topoğrafik"],
  ["streets-vector", "Sokak"],
  ["dark-gray-vector", "Koyu Gri"],
  ["gray-vector", "Açık Gri"]
] as const;

export interface CitizenShellMetrics {
  active: number;
  loading: number;
  error: number;
}

interface Props {
  online: boolean;
  mobilePanelExpanded: boolean;
  onToggleMobilePanels: () => void;
  metrics: CitizenShellMetrics;
  searchRef: RefObject<HTMLDivElement | null>;
  basemap: string;
  onBasemapChange: (basemap: string) => void;
  focusMode: boolean;
  onToggleFocusMode: () => void;
  onShare: () => void;
}

export function CitizenTopbar({
  online,
  mobilePanelExpanded,
  onToggleMobilePanels,
  metrics,
  searchRef,
  basemap,
  onBasemapChange,
  focusMode,
  onToggleFocusMode,
  onShare
}: Props) {
  return (
    <header className="topbar" aria-label="Kent Rehberi üst menüsü">
      <button
        type="button"
        className="mobile-menu"
        onClick={onToggleMobilePanels}
        aria-label="Katman ve araç panelini aç veya kapat"
        aria-controls="kent-rehberi-panels"
        aria-expanded={mobilePanelExpanded}
      >
        <Icon name="menu" />
      </button>

      <div className="brand" aria-label="Ankara Kent Rehberi">
        <div className="brand-symbol" aria-hidden="true"><span>3B</span><i /></div>
        <div><strong>Ankara Kent Rehberi</strong><span>Ankara Büyükşehir Belediyesi · 3B Kent Haritası</span></div>
      </div>

      <div
        className={`live-chip ${online ? "" : "is-offline"}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        title={online ? "İnternet bağlantısı mevcut" : "İnternet bağlantısı yok"}
      >
        <i aria-hidden="true" /> {online ? "CANLI HARİTA" : "ÇEVRİMDIŞI"}
      </div>

      <div className="workspace-summary" role="group" aria-label="Katman çalışma özeti">
        <span><strong>{metrics.active}</strong> açık</span>
        {metrics.loading > 0 && <span className="is-loading"><strong>{metrics.loading}</strong> hazırlanıyor</span>}
        {metrics.error > 0 && <span className="is-error"><strong>{metrics.error}</strong> sorunlu</span>}
      </div>

      <div ref={searchRef} className="global-search" role="search" aria-label="Adres ve yer arama" tabIndex={-1} />

      <div className="top-actions">
        <label className="visually-hidden" htmlFor="kent-rehberi-basemap">Harita görünümü</label>
        <select
          id="kent-rehberi-basemap"
          className="compact-select"
          value={basemap}
          onChange={(event) => onBasemapChange(event.target.value)}
          aria-label="Harita görünümü"
        >
          {BASEMAPS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button
          type="button"
          className="top-icon-button"
          onClick={onToggleFocusMode}
          title="Haritaya odaklan"
          aria-label={focusMode ? "Odak modundan çık" : "Haritaya odaklan"}
          aria-pressed={focusMode}
        >
          <Icon name={focusMode ? "close" : "eye"} />
        </button>
        <button type="button" className="primary-button share-button" onClick={onShare} aria-label="Mevcut harita görünümünü paylaş">
          <Icon name="share" /> Paylaş
        </button>
      </div>
    </header>
  );
}
