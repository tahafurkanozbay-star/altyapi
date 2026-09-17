import type { Bookmark, PanelId, PerformanceProfile, ServiceDefinition } from "../types";
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
      {props.panel === "bookmarks" && <BookmarksPanel {...props} />}
      {props.panel === "help" && <HelpPanel performance={props.performance} />}
    </aside>
  );
}

function HealthPanel({ services, onRetryErrors }: Props) {
  const counts = {
    ready: services.filter((service) => service.status === "ready").length,
    loading: services.filter((service) => service.status === "loading").length,
    error: services.filter((service) => service.status === "error").length,
    idle: services.filter((service) => service.status === "idle").length
  };
  const errors = services.filter((service) => service.status === "error");
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
        <h3>Başkent 3B CBS v4 · Command Center</h3>
        <p>React + TypeScript + Vite + ArcGIS tabanlı, servis sağlığını ve 3B analiz araçlarını tek operasyon yüzeyinde birleştiren Ankara CBS istemcisi.</p>
      </div>
      <div className="shortcut-list">
        <Shortcut keyName="⌘ K" label="Komut paleti" />
        <Shortcut keyName="L" label="Katman paneli" />
        <Shortcut keyName="H" label="Başlangıç görünümü" />
        <Shortcut keyName="F" label="Tam ekran" />
        <Shortcut keyName="Esc" label="Açık aracı / paneli kapat" />
      </div>
      <div className="health-note"><Icon name="speed" /><div><strong>Aktif performans profili: {performance}</strong><span>GPU kalitesi, gölge ayrıntısı ve katman önbelleği cihaz kapasitesine göre ayarlanır.</span></div></div>
      <div className="health-note"><Icon name="command" /><div><strong>Komuta odaklı kullanım</strong><span>Katman, analiz aracı, servis sağlığı ve ekran görüntüsü işlemlerine sol komuta rayı veya Ctrl/Cmd + K üzerinden erişebilirsiniz.</span></div></div>
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
  if (panel === "bookmarks") return "Yer İmleri";
  return "Yardım & Kısayollar";
}
