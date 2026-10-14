import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { AttributeQueryOptions, AttributeTableResult, Bookmark, PanelId, ServiceDefinition } from "../types";
import { CITIZEN_SHORTCUTS, STATIC_HELP_SHORTCUTS, panelLabel } from "../platform/citizenActions";
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
  onQueryAttributes: (service: ServiceDefinition, options: AttributeQueryOptions, signal?: AbortSignal) => Promise<AttributeTableResult>;
}

export function OperationsPanel(props: Props) {
  if (props.panel !== "data" && props.panel !== "bookmarks" && props.panel !== "help") return null;
  const headingId = `operations-panel-title-${props.panel}`;
  const title = panelLabel(props.panel);

  return (
    <aside className="operations-panel" aria-labelledby={headingId}>
      <div className="operations-heading">
        <div>
          <span className="eyebrow">ANKARA KENT REHBERİ</span>
          <h2 id={headingId}>{title}</h2>
        </div>
        <button
          type="button"
          className="icon-ghost mobile-panel-close"
          data-panel-close
          onClick={props.onClose}
          aria-label={`${title} panelini kapat`}
        >
          <Icon name="close" />
        </button>
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
    <div className="panel-loading" role="status" aria-live="polite" aria-busy="true">
      <span className="panel-loading-spinner" aria-hidden="true" />
      <strong>{label}</strong>
      <span>Bu bölüm yalnız gerektiğinde yüklenir.</span>
    </div>
  );
}

function BookmarksPanel({ bookmarks, onAddBookmark, onGoBookmark, onDeleteBookmark }: Props) {
  const [search, setSearch] = useState("");
  const normalized = search.trim().normalize("NFKC").toLocaleLowerCase("tr-TR");
  const visibleBookmarks = bookmarks.filter((bookmark) => bookmark.name.normalize("NFKC").toLocaleLowerCase("tr-TR").includes(normalized));
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const deletedIndexRef = useRef<number | null>(null);
  const previousIdsRef = useRef(new Set(bookmarks.map((bookmark) => bookmark.id)));

  useEffect(() => {
    if (bookmarks.some((bookmark) => !previousIdsRef.current.has(bookmark.id))) setSearch("");
    previousIdsRef.current = new Set(bookmarks.map((bookmark) => bookmark.id));
    const index = deletedIndexRef.current;
    if (index === null) return;
    deletedIndexRef.current = null;
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>(".bookmark-main");
    const next = buttons?.[Math.min(index, buttons.length - 1)] ?? (bookmarks.length ? searchRef.current : addRef.current);
    next?.focus();
  }, [bookmarks]);

  const clearSearch = () => {
    setSearch("");
    searchRef.current?.focus();
  };

  return (
    <div className="bookmarks-workspace">
      <div className="bookmarks-controls">
        <button ref={addRef} type="button" className="primary-button full" onClick={onAddBookmark}><Icon name="plus" /> Bu çalışma görünümünü kaydet</button>
        {bookmarks.length > 0 && <label className="search-field bookmarks-search">
          <Icon name="search" size={15} />
          <input ref={searchRef} type="search" aria-label="Kayıtlı görünümlerde ara" placeholder="Görünüm adı ara…" value={search} onChange={(event) => setSearch(event.target.value)} />
          {search && <button type="button" className="icon-ghost" onClick={clearSearch} aria-label="Görünüm aramasını temizle"><Icon name="close" size={15} /></button>}
        </label>}
        <span className="bookmarks-count" role="status" aria-live="polite" aria-atomic="true">{visibleBookmarks.length} / {bookmarks.length} kayıtlı görünüm</span>
      </div>
      <div ref={listRef} className="bookmark-list">
        <p className="section-note">Konum, açık katmanlar, saydamlıklar, katman çizim sırası ve harita görünümünü birlikte kaydedin; daha sonra tek dokunuşla aynı çalışma alanına dönün.</p>
        {bookmarks.length === 0 && (
          <div className="empty-state">
            <Icon name="bookmark" size={28} />
            <strong>Henüz kayıtlı görünüm yok</strong>
            <span>Haritada istediğiniz görünümü hazırlayın ve mevcut çalışma alanını kaydedin.</span>
          </div>
        )}
        {bookmarks.length > 0 && visibleBookmarks.length === 0 && <div className="empty-state">
          <Icon name="search" size={28} />
          <strong>Görünüm bulunamadı</strong>
          <span>Aramanızla eşleşen kayıtlı görünüm yok.</span>
          <button type="button" className="catalog-action" onClick={clearSearch}>Aramayı temizle</button>
        </div>}
        {visibleBookmarks.map((bookmark, index) => (
          <BookmarkCard
            key={bookmark.id}
            bookmark={bookmark}
            onGo={() => onGoBookmark(bookmark)}
            onDelete={() => { deletedIndexRef.current = index; onDeleteBookmark(bookmark); }}
          />
        ))}
      </div>
    </div>
  );
}

function BookmarkCard({ bookmark, onGo, onDelete }: { bookmark: Bookmark; onGo: () => void; onDelete: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirmDelete) cancelRef.current?.focus();
  }, [confirmDelete]);

  const cancelDelete = () => {
    setConfirmDelete(false);
    requestAnimationFrame(() => deleteRef.current?.focus());
  };

  return (
    <article className={`bookmark-card ${confirmDelete ? "is-confirming-delete" : ""}`}>
      <button type="button" className="bookmark-main" onClick={onGo} aria-label={`${bookmark.name} çalışma görünümüne git`}>
        <span className="bookmark-icon"><Icon name="bookmark" /></span>
        <span>
          <strong>{bookmark.name}</strong>
          <small>{bookmarkMetadata(bookmark)}</small>
        </span>
      </button>
      {confirmDelete ? (
        <div className="bookmark-delete-confirm" role="group" aria-label={`${bookmark.name} silme onayı`}>
          <span role="status">Silme işlemini onaylayın veya vazgeçin.</span>
          <button type="button" className="catalog-action is-danger" onClick={onDelete}>Sil</button>
          <button ref={cancelRef} type="button" className="catalog-action" data-bookmark-cancel onClick={cancelDelete} aria-label="Silmekten vazgeç">Vazgeç</button>
        </div>
      ) : (
        <button
          ref={deleteRef}
          type="button"
          className="icon-ghost is-danger"
          onClick={() => setConfirmDelete(true)}
          aria-label={`${bookmark.name} kayıtlı görünümünü sil`}
        >
          <Icon name="trash" size={15} />
        </button>
      )}
    </article>
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
          {CITIZEN_SHORTCUTS.map((shortcut) => (
            <Shortcut key={shortcut.command} keyName={shortcut.display} label={shortcut.label} />
          ))}
          {STATIC_HELP_SHORTCUTS.map((shortcut) => (
            <Shortcut key={shortcut.display} keyName={shortcut.display} label={shortcut.label} />
          ))}
        </div>
        <p className="section-note">Çıplak tek-harf kısayolları kullanılmaz. Kısayollar metin alanlarında çalışmaz; tarayıcı, ekran okuyucu ve konuşma ile giriş komutlarıyla çakışmaması için açık modifier kombinasyonları kullanılır.</p>
      </section>

      <section className="help-section" aria-labelledby="help-accessibility">
        <h4 id="help-accessibility">Erişilebilir kullanım</h4>
        <div className="health-note"><Icon name="info" /><div><strong>Klavye ve ekran okuyucu</strong><span>Tab ile ana bölgelere ilerleyebilir, araç dock'unda ok tuşlarını kullanabilir ve sayfanın başındaki hızlı erişim bağlantılarıyla doğrudan haritaya veya panellere geçebilirsiniz.</span></div></div>
        <div className="health-note"><Icon name="eye" /><div><strong>Görsel tercihler</strong><span>Azaltılmış hareket, azaltılmış saydamlık, yüksek kontrast, zorunlu renkler ve büyük metin tercihleri mümkün olduğunca işletim sistemi ayarlarını takip eder.</span></div></div>
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
