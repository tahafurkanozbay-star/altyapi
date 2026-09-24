import { DataWorkbench } from "./DataWorkbench";
import type { AttributeQueryOptions, AttributeTableResult, Bookmark, PanelId, ServiceDefinition } from "../types";
import { Icon } from "./Icon";

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

  return (
    <aside className="operations-panel">
      <div className="operations-heading">
        <div>
          <span className="eyebrow">KENT REHBERİ</span>
          <h2>{panelTitle(props.panel)}</h2>
        </div>
        <button type="button" className="icon-ghost" onClick={props.onClose} aria-label="Paneli kapat"><Icon name="close" /></button>
      </div>
      {props.panel === "data" && <DataWorkbench services={props.services} onQuery={props.onQueryAttributes} />}
      {props.panel === "bookmarks" && <BookmarksPanel {...props} />}
      {props.panel === "help" && <HelpPanel />}
    </aside>
  );
}

function BookmarksPanel({ bookmarks, onAddBookmark, onGoBookmark, onDeleteBookmark }: Props) {
  return (
    <div className="operations-body">
      <button type="button" className="primary-button full" onClick={onAddBookmark}><Icon name="plus" /> Bu görünümü kaydet</button>
      <p className="section-note">Sık baktığınız konumları ve açık katmanları kaydedip daha sonra tek tıkla geri dönebilirsiniz.</p>
      <div className="bookmark-list">
        {bookmarks.length === 0 && (
          <div className="empty-state">
            <Icon name="bookmark" size={28} />
            <strong>Henüz yer imi yok</strong>
            <span>Haritada istediğiniz yere gidin ve mevcut görünümü kaydedin.</span>
          </div>
        )}
        {bookmarks.map((bookmark) => (
          <article className="bookmark-card" key={bookmark.id}>
            <button type="button" className="bookmark-main" onClick={() => onGoBookmark(bookmark)}>
              <span className="bookmark-icon"><Icon name="bookmark" /></span>
              <span>
                <strong>{bookmark.name}</strong>
                <small>{new Date(bookmark.createdAt).toLocaleString("tr-TR")} · {bookmark.layerIds.length} katman</small>
              </span>
            </button>
            <button type="button" className="icon-ghost is-danger" onClick={() => onDeleteBookmark(bookmark)} aria-label="Yer imini sil">
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
        <div className="help-orbit"><span /><span /><span /></div>
        <h3>Ankara Kent Rehberi</h3>
        <p>Adres arayın, istediğiniz katmanları açın, haritayı 3B inceleyin ve mesafe veya alan ölçümü gibi harita araçlarını kullanın.</p>
      </div>
      <div className="shortcut-list">
        <Shortcut keyName="L" label="Katmanlar" />
        <Shortcut keyName="D" label="Harita verisi" />
        <Shortcut keyName="H" label="Başlangıç görünümü" />
        <Shortcut keyName="F" label="Tam ekran" />
        <Shortcut keyName="M" label="Haritaya odaklan" />
        <Shortcut keyName="Esc" label="Açık aracı veya paneli kapat" />
      </div>
      <div className="health-note"><Icon name="layers" /><div><strong>Katmanlar</strong><span>Sol menüden ulaşım, altyapı, sınır ve diğer harita katmanlarını açıp kapatabilirsiniz.</span></div></div>
      <div className="health-note"><Icon name="search" /><div><strong>Arama</strong><span>Üst bölümdeki arama alanını kullanarak adres ve yer arayabilirsiniz.</span></div></div>
      <div className="health-note"><Icon name="info" /><div><strong>Akıcı kullanım</strong><span>Harita kalitesi ve servis bağlantıları cihazınıza göre otomatik yönetilir; teknik ayar yapmanız gerekmez.</span></div></div>
    </div>
  );
}

function Shortcut({ keyName, label }: { keyName: string; label: string }) {
  return <div><kbd>{keyName}</kbd><span>{label}</span></div>;
}

function panelTitle(panel: Props["panel"]): string {
  if (panel === "data") return "Harita Verisi";
  if (panel === "bookmarks") return "Yer İmleri";
  return "Yardım";
}
