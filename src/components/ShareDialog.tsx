import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./Icon";

export interface SharedView {
  url: string;
  layerCount: number;
  basemapLabel: string;
}

export function ShareDialog({ view, onClose }: { view: SharedView | null; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const linkRef = useRef<HTMLTextAreaElement>(null);
  const generationRef = useRef(0);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const generation = ++generationRef.current;
    busyRef.current = false; setBusy(false); setStatus(null);
    if (!dialog) return;
    if (!view) { if (dialog.open) dialog.close(); else dialog.removeAttribute("open"); return; }
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    const frame = requestAnimationFrame(() => {
      if (generation !== generationRef.current) return;
      linkRef.current?.focus({ preventScroll: true }); linkRef.current?.select();
    });
    return () => { generationRef.current += 1; cancelAnimationFrame(frame); };
  }, [view]);

  const selectLink = () => { linkRef.current?.focus(); linkRef.current?.select(); };
  const perform = async (action: "copy" | "native") => {
    if (!view || busyRef.current) return;
    const generation = generationRef.current;
    const current = () => generation === generationRef.current;
    busyRef.current = true; setBusy(true); setStatus(null);
    try {
      if (action === "copy") {
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(view.url);
        if (current()) setStatus("Bağlantı panoya kopyalandı.");
      } else {
        await navigator.share({ title: "Ankara Kent Rehberi", text: "Ankara Kent Rehberi harita görünümü", url: view.url });
        if (current()) setStatus("Harita görünümü paylaşıldı.");
      }
    } catch (reason) {
      if (!current()) return;
      if (reason && typeof reason === "object" && "name" in reason && reason.name === "AbortError") setStatus("Paylaşım iptal edildi. Bağlantıyı kopyalayabilirsiniz.");
      else {
        setStatus(action === "copy" ? "Otomatik kopyalama kullanılamıyor. Seçili bağlantıyı kopyalayın veya mobilde basılı tutun." : "Cihaz paylaşımı açılamadı. Bağlantıyı kopyalayabilirsiniz.");
        selectLink();
      }
    } finally {
      if (current()) { busyRef.current = false; setBusy(false); }
    }
  };

  return <dialog ref={dialogRef} className="workspace-dialog share-dialog" aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="workspace-dialog-card">
      <div className="workspace-dialog-heading">
        <span className="workspace-dialog-icon" aria-hidden="true"><Icon name="share" /></span>
        <div><span className="eyebrow">ÇALIŞMA GÖRÜNÜMÜ</span><h2 id={titleId}>Harita görünümünü paylaş</h2></div>
        <button type="button" className="icon-ghost" aria-label="Paylaşım penceresini kapat" onClick={onClose}><Icon name="close" /></button>
      </div>
      <p id={descriptionId}>Kamera, harita görünümü, açık katmanların çizim sırası ve saydamlıkları bu bağlantıda korunur.</p>
      {view && <p className="share-view-summary">{view.layerCount} açık katman · {view.basemapLabel}</p>}
      <label className="workspace-dialog-field"><span>Paylaşım bağlantısı</span><textarea ref={linkRef} readOnly rows={3} value={view?.url ?? ""} spellCheck={false} /></label>
      <div className="share-feedback" role="status" aria-live="polite" aria-atomic="true">{busy ? "Paylaşım işlemi sürüyor…" : status}</div>
      <div className="workspace-dialog-actions share-dialog-actions">
        <button type="button" className="catalog-action" onClick={selectLink}>Bağlantıyı seç</button>
        {typeof navigator.share === "function" && <button type="button" className="catalog-action" disabled={busy} onClick={() => void perform("native")}><Icon name="share" size={15} /> Cihazla paylaş</button>}
        <button type="button" className="primary-button" disabled={busy} onClick={() => void perform("copy")}><Icon name="share" size={15} /> Bağlantıyı kopyala</button>
      </div>
    </div>
  </dialog>;
}
