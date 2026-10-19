import { useRef, useState } from "react";
import {
  parseTucbsEndpointImport,
  saveTucbsEndpoints,
  saveTucbsScaleProfiles
} from "../lib/tucbsAccess";
import {
  describeTucbsVerificationFailure,
  selectVerifiedTucbsEndpoints
} from "../lib/tucbsBrowserVerification";
import {
  clientHealthProfilesFromVerification,
  saveTucbsClientHealthProfiles
} from "../lib/tucbsClientHealth";
import { saveTucbsCoverageProfiles } from "../lib/tucbsCoverage";
import { inspectTucbsBrowserServices as verifyTucbsEndpoints } from "../lib/tucbsInspection";
import { Icon } from "./Icon";

interface Props {
  onApplied: (count: number) => void;
}

/**
 * Inline setup keeps protected TUCBS URLs out of source control and avoids
 * interrupting normal layer clicks with a blocking modal.
 */
export function TucbsAccessSetupPanel({ onApplied }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const applyText = async (value: string) => {
    setBusy(true);
    setError(null);
    setStatus("Yetkili servisler ve katman metaverileri bu tarayıcıdan doğrulanıyor…");
    try {
      const endpoints = parseTucbsEndpointImport(value);
      const report = await verifyTucbsEndpoints(endpoints);
      if (report.verified === 0) {
        throw new Error(describeTucbsVerificationFailure(report));
      }

      // Store only endpoints verified by this browser's current network.
      const verifiedEndpoints = selectVerifiedTucbsEndpoints(endpoints, report);
      saveTucbsEndpoints(verifiedEndpoints, remember);
      saveTucbsScaleProfiles(report.scaleProfiles, remember);
      saveTucbsCoverageProfiles(report.coverageProfiles, remember);
      saveTucbsClientHealthProfiles(clientHealthProfilesFromVerification(report), remember);

      const learned: string[] = [];
      const scaleCount = Object.keys(report.scaleProfiles).length;
      const coverageCount = Object.keys(report.coverageProfiles).length;
      if (scaleCount > 0) learned.push(`${scaleCount} katmana ölçek profili`);
      if (coverageCount > 0) learned.push(`${coverageCount} katmana coğrafi kapsam`);
      if (report.failed > 0) learned.push(`${report.failed} doğrulanamayan servis kaydedilmedi`);
      setStatus(
        learned.length > 0
          ? `${report.verified}/${report.total} TUCBS servisi doğrulandı; ${learned.join("; ")}. Harita yenileniyor…`
          : `${report.verified}/${report.total} TUCBS servisi doğrulandı. Harita yenileniyor…`
      );
      onApplied(Object.keys(verifiedEndpoints).length);
    } catch {
      setStatus(null);
      setError("TUCBS servis bilgileri doğrulanamadı. JSON biçimini ve yetkili ağ erişimini kontrol edin.");
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
    <section className="tucbs-access-inline" aria-labelledby="tucbs-access-title">
      <header>
        <div className="tucbs-access-icon"><Icon name="layers" size={18} /></div>
        <div className="tucbs-access-inline-heading">
          <strong id="tucbs-access-title">TUCBS servis erişimi</strong>
          <span>Bu alan yalnızca servis adreslerini bu tarayıcıya tanımlar; katman seçerken pencere açılmaz.</span>
        </div>
      </header>
      <div className="tucbs-access-body">
        <p>
          Yetkili servis JSON dosyanızı bir kez ekleyin. Adresler GitHub'a veya uygulama sunucusuna gönderilmez;
          doğrulama mevcut tarayıcı ve ağ bağlantısı üzerinden yapılır. Yalnızca doğrulanan servisler kaydedilir.
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
        <div className="tucbs-access-or"><span>veya JSON içeriğini yapıştırın</span></div>
        <label className="tucbs-access-paste">
          <span>Servis JSON içeriği</span>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={'{"services":[{"cografiVeriKatmanAdi":"DOĞALGAZ HATTI","servisTuruAdi":"WMS","tokenUrl":"https://ucbp-api.tucbs.gov.tr/..."}]}'}
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
        <button type="button" className="primary-button" onClick={() => void applyText(text)} disabled={busy || !text.trim()}>
          {busy ? "Servisler doğrulanıyor…" : "Bağlantıyı etkinleştir"}
        </button>
      </footer>
    </section>
  );
}
