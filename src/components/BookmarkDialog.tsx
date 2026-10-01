import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./Icon";

interface Props {
  open: boolean;
  suggestedName: string;
  onCancel: () => void;
  onSave: (name: string) => void;
}

export function BookmarkDialog({ open, suggestedName, onCancel, onSave }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [name, setName] = useState(suggestedName);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (!open) {
      if (dialog.open) dialog.close();
      else dialog.removeAttribute("open");
      return;
    }

    setName(suggestedName);
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }

    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [open, suggestedName]);

  const submit = () => {
    const clean = name.trim().replace(/\s+/g, " ").slice(0, 120);
    if (!clean) {
      inputRef.current?.focus();
      return;
    }
    onSave(clean);
  };

  return (
    <dialog
      ref={dialogRef}
      className="workspace-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <form
        className="workspace-dialog-card"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="workspace-dialog-heading">
          <span className="workspace-dialog-icon" aria-hidden="true"><Icon name="bookmark" /></span>
          <div>
            <span className="eyebrow">ÇALIŞMA GÖRÜNÜMÜ</span>
            <h2 id={titleId}>Bu görünümü kaydet</h2>
          </div>
          <button type="button" className="icon-ghost" onClick={onCancel} aria-label="Pencereyi kapat"><Icon name="close" /></button>
        </div>

        <p id={descriptionId}>
          Kamera konumu, açık katmanlar, katman saydamlıkları, çizim sırası ve harita görünümü birlikte kaydedilir.
        </p>

        <label className="workspace-dialog-field">
          <span>Görünüm adı</span>
          <input
            ref={inputRef}
            type="text"
            value={name}
            maxLength={120}
            autoComplete="off"
            enterKeyHint="done"
            onChange={(event) => setName(event.target.value)}
            placeholder="Örn. Çankaya altyapı görünümü"
          />
        </label>

        <div className="workspace-dialog-actions">
          <button type="button" className="catalog-action" onClick={onCancel}>Vazgeç</button>
          <button type="submit" className="primary-button" disabled={!name.trim()}><Icon name="bookmark" size={15} /> Görünümü kaydet</button>
        </div>
      </form>
    </dialog>
  );
}
