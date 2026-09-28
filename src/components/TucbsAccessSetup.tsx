import { useEffect, useRef, useState } from "react";
import {
  parseTucbsEndpointImport,
  saveTucbsEndpoints,
  saveTucbsScaleProfiles
} from "../lib/tucbsAccess";
import {
  describeTucbsVerificationFailure,
  selectVerifiedTucbsEndpoints,
  verifyTucbsBrowserAccess
} from "../lib/tucbsBrowserVerification";
import {
  discoverTucbsCoverageProfiles,
  saveTucbsCoverageProfiles
} from "../lib/tucbsCoverage";
import { Icon } from "./Icon";

interface Props {
  open: boolean;
  onClose: () => void;
  onApplied: (count: number) => void;
}

export function TucbsAccessSetupHost() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const openSetup = () => setOpen(true);
    window.addEventListener("altyapi:tucbs-access-required", openSetup);
    return () => window.removeEventListener("altyapi:tucbs-access-required", openSetup);
  }, []);

  return (
    <TucbsAccessSetup
      open={open}
      onClose={() => setOpen(false)}
      onApplied={() => window.location.reload()}
    />
  );
}

export function TucbsAccessSetup({ open, onClose, onApplied }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const applyText = async (value: string) => {
    setBusy(true);
    setError(null);
    setStatus("Yetkili servisler, katman ölçekleri ve veri kapsamları bu bağlantı üzerinden doğrulanıyor…");
    try {
      const endpoints = parseTucbsEndpointImport(value);
      const report = await verifyTucbsBrowserAccess(endpoints);
      if (report.verified === 0) {
        throw new Error(describeTucbsVerificationFailure(report));
      }

      // Failed endpoints are deliberately not persisted. A partial verification
      // must not turn into a later layer-load failure with a known-bad URL.
      const verifiedEndpoints = selectVerifiedTucbsEndpoints(endpoints, report);

      // Coverage discovery is deliberately second-stage: only a proven
      // approved-IP TUCBS connection earns the additional WMS metadata pass.
      const coverageReport = await discoverTucbsCoverageProfiles(verifiedEndpoints);
      saveTucbsEndpoints(verifiedEndpoints, remember);
      saveTucbsScaleProfiles(report.scaleProfiles, remember);
      saveTucbsCoverageProfiles(coverageReport.profiles, remember);
      const scaleCount = Object.keys(report.scaleProfiles).length;
      const coverageCount = Object.keys(coverageReport.profiles).length;
      const learned: string[] = [];
      if (scaleCount > 0) learned.push(`${scaleCount} katmana ölçek profili`);
      if (coverageCount > 0) learned.push(`${coverageCount} katmana coğrafi kapsam`);
      if (report.failed > 0) learned.push(`${report.failed} doğrulanamayan servis kaydedilmedi`);
      setStatus(
        learned.length > 0
          ? `${report.verified}/${report.total} TUCBS servisi doğrulandı; ${learned.join("; ")}. Harita yenileniyor…`
          : `${report.verified}/${report.total} TUCBS servisi doğrulandı. Harita yenileniyor…`
      );
      onApplied(Object.keys(verifiedEndpoints).length);
    } catch (cause) {
      setStatus(null);
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
      if (event.currentTarget === event.target && !busy) onClose();
    }}>
      <section className="tucbs-access-dialog" role="dialog" aria-modal="true" aria-labelledby="tucbs-access-title">
        <header>
          <div className="tucbs-access-icon"><Icon name="layers" size={20} /></div>
          <div>
            <strong id="tucbs-access-title">TUCBS yetkili erişimi</strong>
            <span>Onaylı dış IP üzerinden doğrudan WMS/WFS bağlantısı</span>
          </div>
          <button type="button" className="icon-ghost" onClick={onClose} disabled={busy} aria-label="Kapat"><Icon name="close" size={15} /></button>
        </header>

        <div className="tucbs-access-body">
          <p>
            TUCBS servis adreslerini içeren JSON dosyanızı bu tarayıcıya tanımlayın. Bilgiler GitHub'a veya başka bir sunucuya gönderilmez;
            servisler doğrudan <strong>ucbp-api.tucbs.gov.tr</strong> üzerinden ve mevcut dış IP'nizle doğrulanır. WMS servisinin ilan ettiği
            ölçek aralığı ve coğrafi veri kapsamı varsa aynı veri kümesinin WMS/WFS katmanlarına otomatik uygulanır. Doğrulanamayan servis
            adresleri runtime'a kaydedilmez; böylece kısmi erişim daha sonra bilinen bir katman hatasına dönüşmez.
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
              disabled={busy}
            />
          </label>

          <label className="tucbs-remember">
            <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} disabled={busy} />
            <span>Bu cihazda hatırla</span>
          </label>

          {status && <div className="tucbs-access-status" role="status"><Icon name="layers" size={15} /><span>{status}</span></div>}
          {error && <div className="tucbs-access-error" role="alert"><Icon name="warning" size={15} /><span>{error}</span></div>}
        </div>

        <footer>
          <button type="button" className="catalog-action" onClick={onClose} disabled={busy}>Vazgeç</button>
          <button type="button" className="primary-button" onClick={() => void applyText(text)} disabled={busy || !text.trim()}>
            {busy ? "Servisler doğrulanıyor…" : "Bağlantıyı etkinleştir"}
          </button>
        </footer>
      </section>
    </div>
  );
}
