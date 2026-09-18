import { useRef, useState } from "react";
import { Icon } from "./Icon";

interface Props {
  onExport: () => void;
  onImport: (file: File) => Promise<void>;
  onReset: () => void;
}

export function WorkspacePanel({ onExport, onImport, onReset }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const chooseFile = () => inputRef.current?.click();

  const importFile = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    setFileName(file.name);
    try {
      await onImport(file);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="operations-body workspace-panel">
      <div className="workspace-hero">
        <span className="workspace-hero-icon"><Icon name="workspace" size={22} /></span>
        <div>
          <strong>Çalışma Alanı Yöneticisi</strong>
          <span>Katman görünürlüğü, saydamlık, favoriler, kamera, altlık ve yer imlerini tek taşınabilir JSON belgesinde yönetin.</span>
        </div>
      </div>

      <div className="workspace-grid">
        <article className="workspace-card">
          <span className="workspace-card-icon"><Icon name="download" /></span>
          <div>
            <strong>Dışa aktar</strong>
            <p>Geçerli CBS çalışma alanını yedekleyin veya başka bilgisayara taşıyın.</p>
          </div>
          <button type="button" className="primary-button" onClick={onExport}>
            <Icon name="download" size={15} /> JSON indir
          </button>
        </article>

        <article className="workspace-card">
          <span className="workspace-card-icon"><Icon name="upload" /></span>
          <div>
            <strong>İçe aktar</strong>
            <p>Daha önce dışa aktarılan Başkent 3B çalışma alanını güvenli doğrulamayla geri yükleyin.</p>
            {fileName && <small>Son dosya: {fileName}</small>}
          </div>
          <button type="button" className="catalog-action workspace-action" onClick={chooseFile} disabled={busy}>
            <Icon name="upload" size={15} /> {busy ? "Doğrulanıyor…" : "JSON seç"}
          </button>
          <input
            ref={inputRef}
            className="workspace-file-input"
            type="file"
            accept="application/json,.json"
            onChange={(event) => void importFile(event.target.files?.[0])}
          />
        </article>

        <article className="workspace-card workspace-card-danger">
          <span className="workspace-card-icon"><Icon name="refresh" /></span>
          <div>
            <strong>Yerel ayarları sıfırla</strong>
            <p>Tarayıcıda saklanan görünüm, favori, kamera ve yer imlerini temizleyip varsayılan beyaz çalışma alanına dönün.</p>
          </div>
          <button type="button" className="catalog-action is-danger workspace-action" onClick={onReset}>
            <Icon name="refresh" size={15} /> Sıfırla
          </button>
        </article>
      </div>

      <div className="workspace-security">
        <Icon name="check" />
        <div>
          <strong>Gizli servis bilgisi dışa aktarılmaz</strong>
          <span>Çalışma alanı belgesi kullanıcı tercihlerini ve güvenli katman kimliklerini taşır; servis tokenı veya katalog URL sorgu parametrelerini eklemez.</span>
        </div>
      </div>
    </div>
  );
}
