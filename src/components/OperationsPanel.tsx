import { useMemo, useRef, useState } from "react";
import { capabilityLabel, capabilityScore, collectBrowserCapabilities } from "../platform/capabilities";
import { latencyLabel, summarizeServiceHealth } from "../lib/serviceMetrics";
import { availabilityLabel, cooldownRemaining, isServiceCoolingDown } from "../lib/serviceHealth";
import { DataWorkbench } from "./DataWorkbench";
import { incidentJournalToJson } from "../lib/incidentJournal";
import { filterIncidents, reliabilityTrendLabel, summarizeIncidentReliability } from "../lib/sessionReliability";
import { OperationsOverview } from "./OperationsOverview";
import type { AttributeQueryOptions, AttributeTableResult, Bookmark, PanelId, PerformanceProfile, RuntimeIncident, ServiceDefinition } from "../types";
import { Icon } from "./Icon";

interface Props {
  panel: Exclude<PanelId, null | "layers">;
  services: ServiceDefinition[];
  bookmarks: Bookmark[];
  incidents: RuntimeIncident[];
  performance: PerformanceProfile;
  online: boolean;
  onClose: () => void;
  onNavigatePanel: (panel: Exclude<PanelId, null>) => void;
  onClearIncidents: () => void;
  onStabilizeWorkspace: () => Promise<void>;
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
      {props.panel === "overview" && (
        <OperationsOverview
          services={props.services}
          online={props.online}
          performance={props.performance}
          incidents={props.incidents}
          onPanel={props.onNavigatePanel}
          onStabilize={props.onStabilizeWorkspace}
        />
      )}
      {props.panel === "health" && <HealthPanel {...props} />}
      {props.panel === "incidents" && <IncidentPanel {...props} />}
      {props.panel === "data" && <DataWorkbench services={props.services} onQuery={props.onQueryAttributes} />}
      {props.panel === "workspace" && <WorkspacePanel {...props} />}
      {props.panel === "bookmarks" && <BookmarksPanel {...props} />}
      {props.panel === "diagnostics" && <DiagnosticsPanel services={props.services} performance={props.performance} incidents={props.incidents} />}
      {props.panel === "help" && <HelpPanel performance={props.performance} />}
    </aside>
  );
}

function HealthPanel({ services, onRetryErrors }: Props) {
  const counts = summarizeServiceHealth(services);
  const errors = services.filter((service) => service.status === "error");
  const retryableErrors = errors.filter((service) => service.availability !== "unavailable" && !isServiceCoolingDown(service));
  const measured = services
    .filter((service) => Number.isFinite(service.latencyMs))
    .sort((a, b) => (b.latencyMs ?? 0) - (a.latencyMs ?? 0))
    .slice(0, 5);
  const latestVerification = services
    .map((service) => service.verifiedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const staleVerification = services.some((service) => service.verificationStale);

  return (
    <div className="operations-body">
      <div className="health-section-title">
        <span>HARİCİ DOĞRULAMA</span>
        <strong>
          {latestVerification
            ? `${staleVerification ? "Eski snapshot · " : ""}${new Date(latestVerification).toLocaleString("tr-TR")}`
            : "Snapshot yok"}
        </strong>
      </div>
      <div className="health-grid health-grid-verification">
        <Metric label="Doğrulandı" value={counts.verified} tone="good" />
        <Metric label="Kısıtlı" value={counts.degraded} tone="warn" />
        <Metric label="Ulaşılamıyor" value={counts.unavailable} tone="bad" />
        <Metric label="Bilinmiyor" value={counts.unknown} tone="neutral" />
      </div>

      <div className="health-note health-note-policy">
        <Icon name="health" />
        <div>
          <strong>Akıllı servis orkestrasyonu</strong>
          <span>
            {staleVerification
              ? "Harici doğrulama 72 saatten eski olduğu için negatif durumlar başlangıcı engellemez; canlı tarayıcı sonucu öncelik kazanır."
              : "Doğrulanmış servisler otomatik yüklenebilir. Kısıtlı veya ulaşılamayan servisler başlangıçta zorlanmaz; kullanıcı isterse manuel deneyebilir."}
            {" "}Tekrarlayan hatalarda devre kesici gereksiz ağ yükünü azaltır.
          </span>
        </div>
      </div>

      <div className="health-section-title">
        <span>CANLI TARAYICI DURUMU</span>
        <strong>{counts.coolingDown ? `${counts.coolingDown} devre kesici` : "Normal"}</strong>
      </div>
      <div className="health-grid">
        <Metric label="Hazır" value={counts.ready} tone="good" />
        <Metric label="Bağlanıyor" value={counts.loading} tone="warn" />
        <Metric label="Hata" value={counts.error} tone="bad" />
        <Metric label="Beklemede" value={counts.idle} tone="neutral" />
      </div>

      <div className="health-latency-grid">
        <div><span>Ortalama katman açılışı</span><strong>{counts.averageLatencyMs !== undefined ? `${counts.averageLatencyMs} ms` : "—"}</strong></div>
        <div><span>P95 açılış süresi</span><strong>{counts.p95LatencyMs !== undefined ? `${counts.p95LatencyMs} ms` : "—"}</strong></div>
      </div>

      {measured.length > 0 && (
        <div className="latency-list" aria-label="Servis gecikme ölçümleri">
          {measured.map((service) => (
            <div key={service.id}>
              <span>
                <strong>{service.displayName}</strong>
                <small>{availabilityLabel(service)} · {latencyLabel(service.latencyMs)}</small>
              </span>
              <em>{service.latencyMs} ms</em>
            </div>
          ))}
        </div>
      )}

      {errors.length > 0 ? (
        <>
          <button
            type="button"
            className="primary-button full"
            onClick={() => void onRetryErrors()}
            disabled={retryableErrors.length === 0}
          >
            <Icon name="refresh" /> Uygun hataları yeniden dene ({retryableErrors.length})
          </button>
          <div className="health-errors">
            {errors.map((service) => {
              const cooldown = cooldownRemaining(service);
              return (
                <article key={service.id} className={`availability-${service.availability}`}>
                  <span className="status-dot status-error" />
                  <div>
                    <strong>{service.displayName}</strong>
                    <p>{service.error ?? "Servis yüklenemedi."}</p>
                    <small>{availabilityLabel(service)}{cooldown ? ` · devre kesici ${cooldown}` : ""}</small>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      ) : (
        <div className="empty-state"><Icon name="check" size={28} /><strong>Aktif çalışma zamanı hatası yok</strong><span>Açılan servislerin canlı sonuçları burada izlenir.</span></div>
      )}
    </div>
  );
}

function IncidentPanel({ incidents, onClearIncidents }: Props) {
  const [severity, setSeverity] = useState<RuntimeIncident["severity"] | "all">("all");
  const [kind, setKind] = useState<RuntimeIncident["kind"] | "all">("all");
  const [windowMs, setWindowMs] = useState<number>(24 * 60 * 60 * 1000);
  const summary = useMemo(() => summarizeIncidentReliability(incidents, Date.now(), windowMs), [incidents, windowMs]);
  const filteredIncidents = useMemo(
    () => filterIncidents(incidents, { severity, kind, sinceMs: windowMs }),
    [incidents, severity, kind, windowMs]
  );
  const errors = incidents.filter((incident) => incident.severity === "error").length;
  const warnings = incidents.filter((incident) => incident.severity === "warning").length;
  const recovered = incidents.filter((incident) => incident.recovered).length;

  const download = () => {
    const blob = new Blob([incidentJournalToJson(incidents)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `baskent-3b-incidents-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="operations-body incident-panel-body">
      <div className="health-grid">
        <Metric label="Toplam" value={incidents.length} tone="neutral" />
        <Metric label="Hata" value={errors} tone={errors ? "bad" : "neutral"} />
        <Metric label="Uyarı" value={warnings} tone={warnings ? "warn" : "neutral"} />
        <Metric label="Toparlandı" value={recovered} tone={recovered ? "good" : "neutral"} />
      </div>

      <div className="health-note">
        <Icon name="activity" />
        <div>
          <strong>Sanitizasyonlu çalışma zamanı günlüğü</strong>
          <span>Katman yükleme, retry, sorgu ve ağ olayları tutulur. URL/token benzeri değerler kaydedilmeden önce maskelenir; en fazla 80 olay saklanır.</span>
        </div>
      </div>

      <div className="incident-reliability-summary">
        <div><span>Güvenilirlik</span><strong>{summary.score}/100</strong><small>{reliabilityTrendLabel(summary.trend)}</small></div>
        <div><span>Toparlanma</span><strong>{summary.recoveryRate}%</strong><small>{summary.recovered} kayıt</small></div>
        <div><span>P95 süre</span><strong>{summary.p95DurationMs !== undefined ? `${summary.p95DurationMs} ms` : "—"}</strong><small>{summary.total} olay</small></div>
      </div>

      <div className="incident-filter-bar">
        <select value={String(windowMs)} onChange={(event) => setWindowMs(Number(event.target.value))} aria-label="Olay zaman aralığı">
          <option value={60 * 60 * 1000}>Son 1 saat</option>
          <option value={6 * 60 * 60 * 1000}>Son 6 saat</option>
          <option value={24 * 60 * 60 * 1000}>Son 24 saat</option>
          <option value={7 * 24 * 60 * 60 * 1000}>Son 7 gün</option>
        </select>
        <select value={severity} onChange={(event) => setSeverity(event.target.value as RuntimeIncident["severity"] | "all")} aria-label="Olay önem filtresi">
          <option value="all">Tüm önemler</option>
          <option value="error">Hata</option>
          <option value="warning">Uyarı</option>
          <option value="info">Bilgi</option>
        </select>
        <select value={kind} onChange={(event) => setKind(event.target.value as RuntimeIncident["kind"] | "all")} aria-label="Olay türü filtresi">
          <option value="all">Tüm türler</option>
          <option value="layer-load">Katman yükleme</option>
          <option value="layer-retry">Retry</option>
          <option value="query">Sorgu</option>
          <option value="network">Ağ</option>
          <option value="boot">Başlangıç</option>
          <option value="system">Sistem</option>
        </select>
        <span>{filteredIncidents.length} kayıt</span>
      </div>

      <div className="incident-actions">
        <button type="button" className="catalog-action" onClick={download} disabled={incidents.length === 0}>
          <Icon name="download" size={14} /> JSON dışa aktar
        </button>
        <button type="button" className="catalog-action is-danger" onClick={onClearIncidents} disabled={incidents.length === 0}>
          <Icon name="trash" size={14} /> Günlüğü temizle
        </button>
      </div>

      <div className="incident-list">
        {filteredIncidents.length === 0 && (
          <div className="empty-state">
            <Icon name="check" size={28} />
            <strong>Filtreye uyan olay yok</strong>
            <span>Zaman aralığını veya filtreleri değiştirin.</span>
          </div>
        )}
        {filteredIncidents.map((incident) => (
          <article key={incident.id} className={`incident-card severity-${incident.severity}`}>
            <span className="incident-icon"><Icon name={incident.recovered ? "check" : incident.severity === "error" ? "warning" : "activity"} size={15} /></span>
            <div>
              <strong>{incident.serviceName ?? incidentKindLabel(incident.kind)}</strong>
              <p>{incident.message}</p>
              <small>
                {new Date(incident.occurredAt).toLocaleString("tr-TR")}
                {incident.durationMs !== undefined ? ` · ${incident.durationMs} ms` : ""}
                {incident.recovered ? " · toparlandı" : ""}
              </small>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function DiagnosticsPanel({ services, performance, incidents }: { services: ServiceDefinition[]; performance: PerformanceProfile; incidents: RuntimeIncident[] }) {
  const capabilities = useMemo(() => collectBrowserCapabilities(), []);
  const score = capabilityScore(capabilities);
  const ready = services.filter((service) => service.status === "ready").length;
  const errors = services.filter((service) => service.status === "error").length;

  const downloadReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      application: "Başkent 3B CBS",
      version: "13.0.0",
      runtime: "React 19.3 + View Transitions + TypeScript 7 + Vite 8.3 + ArcGIS 5.1 component-first Scene + adaptive operations reliability",
      performanceProfile: performance,
      capabilityScore: score,
      capabilities,
      incidentSummary: {
        total: incidents.length,
        errors: incidents.filter((incident) => incident.severity === "error").length,
        warnings: incidents.filter((incident) => incident.severity === "warning").length,
        recovered: incidents.filter((incident) => incident.recovered).length
      },
      recentIncidents: incidents.slice(0, 20),
      services: services.map((service) => ({
        id: service.id,
        name: service.displayName,
        kind: service.kind,
        status: service.status,
        visible: service.visible,
        error: service.error ?? null,
        availability: service.availability,
        access: service.access,
        browserCompatible: service.browserCompatible ?? null,
        verifiedAt: service.verifiedAt ?? null,
        failureCount: service.failureCount,
        cooldownUntil: service.cooldownUntil ?? null,
        verificationStale: service.verificationStale ?? false,
        verificationLatencyMs: service.verificationLatencyMs ?? null
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
      <div className="health-note"><Icon name="activity" /><div><strong>Runtime reliability</strong><span>{incidents.length} sanitizasyonlu olay · {incidents.filter((incident) => incident.severity === "error").length} hata · {incidents.filter((incident) => incident.recovered).length} toparlanma kaydı</span></div></div>
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
        <h3>Başkent 3B CBS v13 · Component-First Scene</h3>
        <p>React 19.3, TypeScript 7 ve ArcGIS 5.1 arcgis-scene Web Component üzerinde çalışan; referenceElement bağlantılı araçlar, otomatik WebGL kurtarma, adaptif güvenli mod ve ölçek-duyarlı katman orkestrasyonunu birleştiren Ankara 3B CBS platformu.</p>
      </div>
      <div className="shortcut-list">
        <Shortcut keyName="⌘ K" label="Komut paleti" />
        <Shortcut keyName="O" label="Operasyon özeti" />
        <Shortcut keyName="I" label="Olay günlüğü" />
        <Shortcut keyName="L" label="Katman paneli" />
        <Shortcut keyName="D" label="Sorgu stüdyosu" />
        <Shortcut keyName="W" label="Çalışma alanı paketi" />
        <Shortcut keyName="H" label="Başlangıç görünümü" />
        <Shortcut keyName="F" label="Tam ekran" />
        <Shortcut keyName="M" label="Harita odak modu" />
        <Shortcut keyName="Esc" label="Açık aracı / paneli kapat" />
      </div>
      <div className="health-note"><Icon name="speed" /><div><strong>Aktif performans profili: {performance}</strong><span>GPU kalitesi, gölge ayrıntısı ve katman önbelleği cihaz kapasitesine göre ayarlanır.</span></div></div>
      <div className="health-note"><Icon name="health" /><div><strong>Dayanıklı servis katmanı</strong><span>Harici doğrulama snapshot'ı, canlı tarayıcı telemetrisi ve üstel geri çekilmeli devre kesici birlikte çalışır; problemli servisler uygulamanın geri kalanını kilitlemez.</span></div></div>
      <div className="health-note"><Icon name="activity" /><div><strong>Adaptif operasyon</strong><span>Stabilizasyon planı riskli görünür katmanları izole eder, gerekirse en uygun doğrulanmış servisleri sınırlı sayıda devreye alır; olay günlüğü son saatler için güvenilirlik trendi üretir.</span></div></div>
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
  if (panel === "overview") return "Operasyon Özeti";
  if (panel === "health") return "Servis Sağlığı";
  if (panel === "incidents") return "Olay Günlüğü";
  if (panel === "data") return "Sorgu Stüdyosu";
  if (panel === "workspace") return "Çalışma Alanı Paketi";
  if (panel === "bookmarks") return "Yer İmleri";
  if (panel === "diagnostics") return "Sistem Tanılama";
  return "Yardım & Kısayollar";
}


function incidentKindLabel(kind: RuntimeIncident["kind"]): string {
  if (kind === "boot") return "Uygulama başlangıcı";
  if (kind === "network") return "Ağ bağlantısı";
  if (kind === "layer-load") return "Katman yükleme";
  if (kind === "layer-retry") return "Servis yeniden deneme";
  if (kind === "query") return "Öznitelik sorgusu";
  return "Sistem olayı";
}
