import { useMemo, useRef, useState } from "react";
import { capabilityLabel, capabilityScore, collectBrowserCapabilities } from "../platform/capabilities";
import { latencyLabel, summarizeServiceHealth } from "../lib/serviceMetrics";
import { DataWorkbench } from "./DataWorkbench";
import type { AttributeQueryOptions, AttributeTableResult, Bookmark, PanelId, PerformanceProfile, ServiceDefinition } from "../types";
import { Icon } from "./Icon";

interface Props {
  panel: Exclude<PanelId, null | "layers">;
  services: ServiceDefinition[];
  bookmarks: Bookmark[];
  performance: PerformanceProfile;
  onClose: () => void;
  onRetryErrors: () => Promise<void>;
  onAddBookmark: () => void;
  onGoBookmark: (bookmark: Bookmark) => void;
  onDeleteBookmark: (bookmark: Bookmark) => void;
  onQueryAttributes: (service: ServiceDefinition, options: AttributeQueryOptions) => Promise<AttributeTableResult>;
  onExportWorkspace: () => void;
  onImportWorkspace: (value: unknown) => Promise<void>;
}

export function OperationsPanel(props: Props) {
  return (
    <aside className="operations-panel">
      <div className="operations-heading">
        <div>
          <span className="eyebrow">OPERASYON MERKEZİ</span>
          <h2>{panelTitle(props.panel)}</h2>
        </div>
        <button type="button" className="icon-ghost" onClick={props.onClose} aria-label="Paneli kapat"><Icon name="close" /></button>
      </div>
      {props.panel === "health" && <HealthPanel {...props} />}
      {props.panel === "data" && <DataWorkbench services={props.services} onQuery={props.onQueryAttributes} />}
      {props.panel === "workspace" && <WorkspacePanel {...props} />}
      {props.panel === "bookmarks" && <BookmarksPanel {...props} />}
      {props.panel === "diagnostics" && <DiagnosticsPanel services={props.services} performance={props.performance} />}
      {props.panel === "help" && <HelpPanel performance={props.performance} />}
    </aside>
  );
}

function HealthPanel({ services, onRetryErrors }: Props) {
  const counts = summarizeServiceHealth(services);
  const errors = services.filter((service) => service.status === "error");
  const measured = services
    .filter((service) => Number.isFinite(service.latencyMs))
    .sort((a, b) => (b.latencyMs ?? 0) - (a.latencyMs ?? 0))
    .slice(0, 5);
  return (
    <div className="operations-body">
      <div className="health-grid">
        <Metric label="Hazır" value={counts.ready} tone="good" />
        <Metric label="Bağlanıyor" value={counts.loading} tone="warn" />
        <Metric label="Hata" value={counts.error} tone="bad" />
        <Metric label="Beklemede" value={counts.idle} tone="neutral" />
      </div>
      <div className="health-note">
        <Icon name="health" />
        <div><strong>Canlı servis telemetrisi</strong><span>Durumlar gerçek ArcGIS layer yükleme sonucundan üretilir. Böylece yalnızca URL varlığı değil, tarayıcıdan kullanılabilirlik de görünür.</span></div>
      </div>
      <div className="health-latency-grid">
        <div><span>Ortalama katman açılışı</span><strong>{counts.averageLatencyMs !== undefined ? `${counts.averageLatencyMs} ms` : "—"}</strong></div>
        <div><span>P95 açılış süresi</span><strong>{counts.p95LatencyMs !== undefined ? `${counts.p95LatencyMs} ms` : "—"}</strong></div>
      </div>
      {measured.length > 0 && (
        <div className="latency-list" aria-label="Servis gecikme ölçümleri">
          {measured.map((service) => (
            <div key={service.id}>
              <span><strong>{service.displayName}</strong><small>{latencyLabel(service.latencyMs)}</small></span>
              <em>{service.latencyMs} ms</em>
            </div>
          ))}
        </div>
      )}
      {errors.length > 0 ? (
        <>
          <button type="button" className="primary-button full" onClick={() => void onRetryErrors()}><Icon name="refresh" /> Hatalı servisleri yeniden dene</button>
          <div className="health-errors">
            {errors.map((service) => (
              <article key={service.id}>
                <span className="status-dot status-error" />
                <div><strong>{service.displayName}</strong><p>{service.error ?? "Servis yüklenemedi."}</p></div>
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="empty-state"><Icon name="check" size={28} /><strong>Aktif hata yok</strong><span>Açılan servisler burada canlı olarak izlenir.</span></div>
      )}
    </div>
  );
}

function DiagnosticsPanel({ services, performance }: { services: ServiceDefinition[]; performance: PerformanceProfile }) {
  const capabilities = useMemo(() => collectBrowserCapabilities(), []);
  const score = capabilityScore(capabilities);
  const ready = services.filter((service) => service.status === "ready").length;
  const errors = services.filter((service) => service.status === "error").length;

  const downloadReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      application: "Başkent 3B CBS",
      version: "8.0.0",
      runtime: "React 19.3 + View Transitions + TypeScript 7 + Vite 8.3 + ArcGIS 5.1 Web Components + @arcgis/core ESM",
      performanceProfile: performance,
      capabilityScore: score,
      capabilities,
      services: services.map((service) => ({
        id: service.id,
        name: service.displayName,
        kind: service.kind,
        status: service.status,
        visible: service.visible,
        error: service.error ?? null
      }))
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `baskent-3b-diagnostics-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="operations-body help-body">
      <div className="help-hero">
        <div className="help-orbit"><span /><span /><span /></div>
        <h3>{score}/100 · {capabilityLabel(score)}</h3>
        <p>Tarayıcı, grafik altyapısı ve cihaz kapasitesi ArcGIS 3B çalışma koşulları açısından yerel olarak değerlendirilir.</p>
      </div>
      <div className="health-grid">
        <Metric label="WebGL2" value={capabilities.webgl2 ? 1 : 0} tone={capabilities.webgl2 ? "good" : "bad"} />
        <Metric label="CPU çekirdeği" value={capabilities.hardwareConcurrency} tone="neutral" />
        <Metric label="Hazır servis" value={ready} tone="good" />
        <Metric label="Servis hatası" value={errors} tone={errors > 0 ? "bad" : "neutral"} />
      </div>
      <div className="health-note"><Icon name="speed" /><div><strong>Grafik çalışma zamanı</strong><span>WebGL2: {capabilities.webgl2 ? "hazır" : "desteklenmiyor"} · DPR {capabilities.devicePixelRatio.toFixed(1)} · renk gamı {capabilities.colorGamut.toUpperCase()}</span></div></div>
      <div className="health-note"><Icon name="info" /><div><strong>Cihaz ve ağ</strong><span>{capabilities.deviceMemory ? `${capabilities.deviceMemory} GB tahmini bellek · ` : ""}{capabilities.connectionType ? `${capabilities.connectionType} bağlantı · ` : ""}{capabilities.saveData ? "Veri tasarrufu açık" : "Normal veri modu"}</span></div></div>
      <div className="health-note"><Icon name={capabilities.secureContext ? "check" : "warning"} /><div><strong>Güvenli bağlam</strong><span>{capabilities.secureContext ? "HTTPS/localhost güvenli bağlamı kullanılabilir." : "Bazı tarayıcı yetenekleri güvenli bağlam olmadığı için sınırlanabilir."}</span></div></div>
      <button type="button" className="primary-button full" onClick={downloadReport}><Icon name="download" /> Tanılama raporunu indir</button>
    </div>
  );
}

function WorkspacePanel({ onExportWorkspace, onImportWorkspace }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const importFile = async (file?: File) => {
    if (!file || busy) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      if (file.size > 1_000_000) throw new Error("Çalışma alanı dosyası 1 MB sınırını aşıyor.");
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      await onImportWorkspace(parsed);
      setMessage("Çalışma alanı başarıyla uygulandı.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Çalışma alanı içe aktarılamadı.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="operations-body workspace-panel-body">
      <div className="help-hero workspace-hero">
        <div className="workspace-hero-icon"><Icon name="archive" size={26} /></div>
        <h3>Taşınabilir çalışma alanı</h3>
        <p>Kamera, altlık, görünürlük, saydamlık, favoriler ve yer imlerini tek bir güvenli JSON paketiyle yedekleyin veya başka bir tarayıcıya taşıyın.</p>
      </div>

      <div className="workspace-actions">
        <button type="button" className="primary-button full" onClick={onExportWorkspace}>
          <Icon name="download" /> Çalışma alanını dışa aktar
        </button>
        <input
          ref={inputRef}
          className="workspace-file-input"
          type="file"
          accept="application/json,.json"
          onChange={(event) => void importFile(event.target.files?.[0])}
        />
        <button type="button" className="catalog-action workspace-import-button" disabled={busy} onClick={() => inputRef.current?.click()}>
          <Icon name="archive" size={15} /> {busy ? "Uygulanıyor…" : "JSON paketini içe aktar"}
        </button>
      </div>

      {message && <div className="workspace-message is-success"><Icon name="check" /><span>{message}</span></div>}
      {error && <div className="workspace-message is-error"><Icon name="warning" /><span>{error}</span></div>}

      <div className="health-note"><Icon name="check" /><div><strong>Güvenli içe aktarma</strong><span>Paket yalnız mevcut katalogdaki servis kimliklerini kabul eder. Bilinmeyen katmanlar ve geçersiz değerler otomatik olarak atılır.</span></div></div>
      <div className="health-note"><Icon name="info" /><div><strong>Gizli bilgi içermez</strong><span>Çalışma alanı paketine servis tokenı veya katalog URL'si yazılmaz; yalnız görünüm ve kullanıcı çalışma tercihleri taşınır.</span></div></div>
    </div>
  );
}

function BookmarksPanel({ bookmarks, onAddBookmark, onGoBookmark, onDeleteBookmark }: Props) {
  return (
    <div className="operations-body">
      <button type="button" className="primary-button full" onClick={onAddBookmark}><Icon name="plus" /> Geçerli görünümü kaydet</button>
      <p className="section-note">Yer imi; kamera konumu, açı ve o anda açık olan katmanları birlikte saklar. Saha incelemeleri arasında aynı operasyon görünümüne hızlıca dönmek için kullanın.</p>
      <div className="bookmark-list">
        {bookmarks.length === 0 && <div className="empty-state"><Icon name="bookmark" size={28} /><strong>Henüz yer imi yok</strong><span>Önemli saha görünüşlerini tek tıkla saklayın.</span></div>}
        {bookmarks.map((bookmark) => (
          <article className="bookmark-card" key={bookmark.id}>
            <button type="button" className="bookmark-main" onClick={() => onGoBookmark(bookmark)}>
              <span className="bookmark-icon"><Icon name="bookmark" /></span>
              <span><strong>{bookmark.name}</strong><small>{new Date(bookmark.createdAt).toLocaleString("tr-TR")} · {bookmark.layerIds.length} katman</small></span>
            </button>
            <button type="button" className="icon-ghost is-danger" onClick={() => onDeleteBookmark(bookmark)} aria-label="Yer imini sil"><Icon name="trash" size={15} /></button>
          </article>
        ))}
      </div>
    </div>
  );
}

function HelpPanel({ performance }: { performance: PerformanceProfile }) {
  return (
    <div className="operations-body help-body">
      <div className="help-hero">
        <div className="help-orbit"><span /><span /><span /></div>
        <h3>Başkent 3B CBS v8 · Query Studio Platform</h3>
        <p>React 19.3 View Transitions, ArcGIS 5.1 Web Components ve native @arcgis/core ESM ile çalışan; beyaz arayüz, sunucu tarafı öznitelik sorguları, sayfalama ve servis telemetrisini birleştiren Ankara CBS istemcisi.</p>
      </div>
      <div className="shortcut-list">
        <Shortcut keyName="⌘ K" label="Komut paleti" />
        <Shortcut keyName="L" label="Katman paneli" />
        <Shortcut keyName="D" label="Sorgu stüdyosu" />
        <Shortcut keyName="H" label="Başlangıç görünümü" />
        <Shortcut keyName="F" label="Tam ekran" />
        <Shortcut keyName="M" label="Harita odak modu" />
        <Shortcut keyName="Esc" label="Açık aracı / paneli kapat" />
      </div>
      <div className="health-note"><Icon name="speed" /><div><strong>Aktif performans profili: {performance}</strong><span>GPU kalitesi, gölge ayrıntısı ve katman önbelleği cihaz kapasitesine göre ayarlanır.</span></div></div>
      <div className="health-note"><Icon name="command" /><div><strong>Komuta odaklı kullanım</strong><span>Katman, sunucu sorgusu, çalışma alanı paketi, analiz aracı, sistem tanılama, servis sağlığı ve ekran görüntüsü işlemlerine sol komuta rayı veya Ctrl/Cmd + K üzerinden erişebilirsiniz. M tuşu panelleri geri çekip haritaya odaklanır.</span></div></div>
      <div className="health-note"><Icon name="info" /><div><strong>Yerel geliştirme</strong><span>Kaynak TSX dosyaları Vite ile çalıştırılır: npm run dev. Live Server yalnızca npm run build sonrasındaki dist/ çıktısını servis etmelidir.</span></div></div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className={`health-metric tone-${tone}`}><strong>{value}</strong><span>{label}</span></div>;
}

function Shortcut({ keyName, label }: { keyName: string; label: string }) {
  return <div><kbd>{keyName}</kbd><span>{label}</span></div>;
}

function panelTitle(panel: Props["panel"]): string {
  if (panel === "health") return "Servis Sağlığı";
  if (panel === "data") return "Sorgu Stüdyosu";
  if (panel === "workspace") return "Çalışma Alanı Paketi";
  if (panel === "bookmarks") return "Yer İmleri";
  if (panel === "diagnostics") return "Sistem Tanılama";
  return "Yardım & Kısayollar";
}
