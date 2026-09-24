import { useRef, useState } from "react";
import { parseTucbsEndpointImport, saveTucbsEndpoints } from "../lib/tucbsAccess";
import { Icon } from "./Icon";

interface Props {
  open: boolean;
  onClose: () => void;
  onApplied: (count: number) => void;
}

export function TucbsAccessSetup({ open, onClose, onApplied }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const applyText = async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      const endpoints = parseTucbsEndpointImport(value);
      saveTucbsEndpoints(endpoints, remember);
      onApplied(Object.keys(endpoints).length);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "TUCBS servis bilgileri okunamadı.");
    } finally {
      setBusy(false);
    }
  };

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 128_000) {
      setError("TUCBS servis dosyası beklenenden büyük.");
      return;
    }
    try {
      const value = await file.text();
      setText(value);
      await applyText(value);
    } catch {
      setError("TUCBS servis dosyası okunamadı.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="tucbs-access-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <section className="tucbs-access-dialog" role="dialog" aria-modal="true" aria-labelledby="tucbs-access-title">
        <header>
          <div className="tucbs-access-icon"><Icon name="layers" size={20} /></div>
          <div>
            <strong id="tucbs-access-title">TUCBS yetkili erişimi</strong>
            <span>Onaylı dış IP üzerinden doğrudan WMS/WFS bağlantısı</span>
          </div>
          <button type="button" className="icon-ghost" onClick={onClose} aria-label="Kapat"><Icon name="close" size={15} /></button>
        </header>

        <div className="tucbs-access-body">
          <p>
            TUCBS servis adreslerini içeren JSON dosyanızı bu tarayıcıya tanımlayın. Bilgiler GitHub'a veya başka bir sunucuya gönderilmez;
            yalnızca bu tarayıcıda kullanılır ve istekler doğrudan <strong>ucbp-api.tucbs.gov.tr</strong> adresine gider.
          </p>

          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => void readFile(event.target.files?.[0])}
          />
          <button type="button" className="primary-button tucbs-file-button" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Icon name="layers" size={15} /> TUCBS servis JSON dosyasını seç
          </button>

          <div className="tucbs-access-or"><span>veya</span></div>

          <label className="tucbs-access-paste">
            <span>Servis JSON içeriği</span>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={'{"services":[{"cografiVeriKatmanAdi":"DOĞALGAZ HATTI","servisTuruAdi":"WMS","tokenUrl":"https://ucbp-api.tucbs.gov.tr/..."}]}' }
              spellCheck={false}
            />
          </label>

          <label className="tucbs-remember">
            <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
            <span>Bu cihazda hatırla</span>
          </label>

          {error && <div className="tucbs-access-error"><Icon name="warning" size={15} /><span>{error}</span></div>}
        </div>

        <footer>
          <button type="button" className="catalog-action" onClick={onClose}>Vazgeç</button>
          <button type="button" className="primary-button" onClick={() => void applyText(text)} disabled={busy || !text.trim()}>
            {busy ? "Doğrulanıyor…" : "Bağlantıyı etkinleştir"}
          </button>
        </footer>
      </section>
    </div>
  );
}
