import { lazy, Suspense } from "react";
import type { AttributeQueryOptions, AttributeTableResult, Bookmark, PanelId, ServiceDefinition } from "../types";
import { Icon } from "./Icon";

const LazyDataWorkbench = lazy(async () => {
  const module = await import("./DataWorkbench");
  return { default: module.DataWorkbench };
});

interface Props {
  panel: Exclude<PanelId, null | "layers">;
  services: ServiceDefinition[];
  bookmarks: Bookmark[];
  onClose: () => void;
  onAddBookmark: () => void;
  onGoBookmark: (bookmark: Bookmark) => void;
  onDeleteBookmark: (bookmark: Bookmark) => void;
  onQueryAttributes: (service: ServiceDefinition, options: AttributeQueryOptions) => Promise<AttributeTableResult>;
}

export function OperationsPanel(props: Props) {
  if (props.panel !== "data" && props.panel !== "bookmarks" && props.panel !== "help") return null;
  const headingId = `operations-panel-title-${props.panel}`;

  return (
    <aside className="operations-panel" aria-labelledby={headingId}>
      <div className="operations-heading">
        <div>
          <span className="eyebrow">ANKARA KENT REHBERİ</span>
          <h2 id={headingId}>{panelTitle(props.panel)}</h2>
        </div>
        <button type="button" className="icon-ghost" onClick={props.onClose} aria-label={`${panelTitle(props.panel)} panelini kapat`}><Icon name="close" /></button>
      </div>
      {props.panel === "data" && (
        <Suspense fallback={<PanelLoading label="Harita verisi hazırlanıyor…" />}>
          <LazyDataWorkbench services={props.services} onQuery={props.onQueryAttributes} />
        </Suspense>
      )}
      {props.panel === "bookmarks" && <BookmarksPanel {...props} />}
      {props.panel === "help" && <HelpPanel />}
    </aside>
  );
}

function PanelLoading({ label }: { label: string }) {
  return (
    <div className="panel-loading" role="status" aria-live="polite">
      <span className="panel-loading-spinner" aria-hidden="true" />
      <strong>{label}</strong>
      <span>Bu bölüm yalnız gerektiğinde yüklenir.</span>
    </div>
  );
}

function BookmarksPanel({ bookmarks, onAddBookmark, onGoBookmark, onDeleteBookmark }: Props) {
  return (
    <div className="operations-body">
      <button type="button" className="primary-button full" onClick={onAddBookmark}><Icon name="plus" /> Bu çalışma görünümünü kaydet</button>
      <p className="section-note">Konum, açık katmanlar, saydamlıklar, katman çizim sırası ve harita görünümünü birlikte kaydedin; daha sonra tek dokunuşla aynı çalışma alanına dönün.</p>
      <div className="bookmark-list" aria-live="polite">
        {bookmarks.length === 0 && (
          <div className="empty-state">
            <Icon name="bookmark" size={28} />
            <strong>Henüz kayıtlı görünüm yok</strong>
            <span>Haritada istediğiniz görünümü hazırlayın ve mevcut çalışma alanını kaydedin.</span>
          </div>
        )}
        {bookmarks.map((bookmark) => (
          <article className="bookmark-card" key={bookmark.id}>
            <button type="button" className="bookmark-main" onClick={() => onGoBookmark(bookmark)} aria-label={`${bookmark.name} çalışma görünümüne git`}>
              <span className="bookmark-icon"><Icon name="bookmark" /></span>
              <span>
                <strong>{bookmark.name}</strong>
                <small>{bookmarkMetadata(bookmark)}</small>
              </span>
            </button>
            <button type="button" className="icon-ghost is-danger" onClick={() => onDeleteBookmark(bookmark)} aria-label={`${bookmark.name} kayıtlı görünümünü sil`}>
              <Icon name="trash" size={15} />
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

function HelpPanel() {
  return (
    <div className="operations-body help-body">
      <div className="help-hero">
        <div className="help-orbit" aria-hidden="true"><span /><span /><span /></div>
        <h3>Ankara Kent Rehberi</h3>
        <p>Adres arayın, görmek istediğiniz katmanları açın, çizim sırasını yönetin, 3B haritada inceleyin ve çalışma görünümünüzü kaydedin.</p>
      </div>

      <section className="help-section" aria-labelledby="help-first-steps">
        <h4 id="help-first-steps">Hızlı başlangıç</h4>
        <ol className="help-steps">
          <li><strong>Katman seçin.</strong><span>Katmanlar bölümünden görmek istediğiniz veriyi açın; gerekli zoom otomatik ayarlanır.</span></li>
          <li><strong>Görünümü düzenleyin.</strong><span>Açık katmanlarda yukarı/aşağı kontrolleriyle hangi verinin üstte çizileceğini belirleyin ve saydamlığı ayarlayın.</span></li>
          <li><strong>Çalışmanızı kaydedin.</strong><span>Yer İmleri bölümünde kamera, açık katmanlar, harita görünümü, saydamlıklar ve çizim sırası birlikte saklanır.</span></li>
        </ol>
      </section>

      <section className="help-section" aria-labelledby="help-shortcuts">
        <h4 id="help-shortcuts">Klavye kısayolları</h4>
        <div className="shortcut-list">
          <Shortcut keyName="L" label="Katmanlar" />
          <Shortcut keyName="D" label="Harita verisi" />
          <Shortcut keyName="H" label="Başlangıç görünümü" />
          <Shortcut keyName="/" label="Arama alanına git" />
          <Shortcut keyName="?" label="Yardımı aç" />
          <Shortcut keyName="F" label="Tam ekran" />
          <Shortcut keyName="M" label="Haritaya odaklan" />
          <Shortcut keyName="Esc" label="Açık aracı veya paneli kapat" />
        </div>
      </section>

      <div className="health-note"><Icon name="layers" /><div><strong>Katmanlar</strong><span>Bir katmanı açtığınızda Kent Rehberi servis kapsamını ve uygun zoom aralığını otomatik uygular; açık katmanların çizim sırası sizin kontrolünüzdedir.</span></div></div>
      <div className="health-note"><Icon name="search" /><div><strong>Arama</strong><span>Üst bölümdeki arama alanını kullanarak adres ve yer arayabilirsiniz.</span></div></div>
      <div className="health-note"><Icon name="info" /><div><strong>Bağlantı ve performans</strong><span>Harita kalitesi, servis tekrar denemeleri ve bağlantı kurtarma işlemleri cihazınıza göre arka planda yönetilir.</span></div></div>
    </div>
  );
}

function bookmarkMetadata(bookmark: Bookmark): string {
  const date = new Date(bookmark.createdAt).toLocaleString("tr-TR");
  const parts = [`${bookmark.layerIds.length} katman`];
  if (bookmark.basemap) parts.push("tam görünüm");
  return `${date} · ${parts.join(" · ")}`;
}

function Shortcut({ keyName, label }: { keyName: string; label: string }) {
  return <div><kbd>{keyName}</kbd><span>{label}</span></div>;
}

function panelTitle(panel: Props["panel"]): string {
  if (panel === "data") return "Harita Verisi";
  if (panel === "bookmarks") return "Yer İmleri";
  return "Yardım ve Kısayollar";
}
