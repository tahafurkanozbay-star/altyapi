import { useEffect, useMemo, useState } from "react";
import {
  INCIDENT_JOURNAL_EVENT,
  clearIncidentJournal,
  incidentJournalToJson,
  loadIncidentJournal
} from "../lib/incidentJournal";
import { availabilityLabel, cooldownRemaining } from "../lib/serviceHealth";
import { summarizeServiceHealth } from "../lib/serviceMetrics";
import type { RuntimeIncident, ServiceDefinition } from "../types";
import { Icon } from "./Icon";

interface Props {
  services: ServiceDefinition[];
}

export function CitizenStatusCenter({ services }: Props) {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [incidents, setIncidents] = useState<RuntimeIncident[]>(() => loadIncidentJournal());
  const [confirmClear, setConfirmClear] = useState(false);
  const health = useMemo(() => summarizeServiceHealth(services), [services]);
  const latestVerification = useMemo(
    () => services
      .map((service) => service.verifiedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1),
    [services]
  );
  const staleVerification = services.some((service) => service.verificationStale);
  const attention = useMemo(
    () => services
      .filter((service) => service.status === "error" || service.availability === "unavailable" || service.availability === "degraded")
      .sort((a, b) => issueWeight(b) - issueWeight(a))
      .slice(0, 8),
    [services]
  );

  useEffect(() => {
    const refreshJournal = () => setIncidents(loadIncidentJournal());
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener(INCIDENT_JOURNAL_EVENT, refreshJournal);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener(INCIDENT_JOURNAL_EVENT, refreshJournal);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const exportJournal = () => {
    const blob = new Blob([incidentJournalToJson(incidents)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ankara-kent-rehberi-durum-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const clearJournal = () => {
    clearIncidentJournal();
    setIncidents([]);
    setConfirmClear(false);
  };

  return (
    <div className="operations-body citizen-status-center">
      <section className={`citizen-status-hero ${online ? "is-online" : "is-offline"}`} aria-labelledby="citizen-status-heading">
        <span className="citizen-status-hero-icon" aria-hidden="true"><Icon name={online ? "check" : "warning"} size={24} /></span>
        <div>
          <span className="eyebrow">BAĞLANTI VE HARİTA DURUMU</span>
          <h3 id="citizen-status-heading">{online ? "Kent Rehberi çevrimiçi" : "İnternet bağlantısı yok"}</h3>
          <p>
            {online
              ? "Harita kabuğu ve canlı servisler kullanılabilir. Sorun yaşayan katmanlar aşağıda ayrı gösterilir."
              : "Önbellekteki uygulama kullanılabilir; canlı harita katmanları bağlantı geri gelene kadar açılamayabilir."}
          </p>
        </div>
      </section>

      <section className="citizen-status-metrics" aria-label="Harita servis özeti">
        <StatusMetric label="Açık" value={health.active} tone="neutral" />
        <StatusMetric label="Hazır" value={health.ready} tone="good" />
        <StatusMetric label="Sorunlu" value={health.error} tone={health.error ? "bad" : "good"} />
        <StatusMetric label="Doğrulandı" value={health.verified} tone="good" />
      </section>

      <div className="citizen-status-verification">
        <Icon name="health" size={16} />
        <div>
          <strong>Servis doğrulaması</strong>
          <span>
            {latestVerification
              ? `${staleVerification ? "Son doğrulama eski · " : "Son doğrulama · "}${new Date(latestVerification).toLocaleString("tr-TR")}`
              : "Henüz harici doğrulama zamanı yok."}
          </span>
        </div>
        <em>{health.unavailable + health.degraded > 0 ? `${health.unavailable + health.degraded} dikkat` : "Normal"}</em>
      </div>

      <section className="citizen-status-section" aria-labelledby="citizen-service-attention">
        <div className="citizen-status-section-heading">
          <div><span className="eyebrow">KATMAN DURUMU</span><h4 id="citizen-service-attention">Dikkat gerektiren katmanlar</h4></div>
          <span>{attention.length ? `${attention.length} gösteriliyor` : "Sorun yok"}</span>
        </div>
        {attention.length === 0 ? (
          <div className="empty-state compact"><Icon name="check" size={24} /><strong>Görünen bir servis sorunu yok</strong><span>Katmanlar normal durumda.</span></div>
        ) : (
          <div className="citizen-service-issues">
            {attention.map((service) => {
              const cooldown = cooldownRemaining(service);
              return (
                <article key={service.id}>
                  <span className={`citizen-issue-indicator ${service.status === "error" ? "is-error" : "is-warning"}`} aria-hidden="true" />
                  <div>
                    <strong>{service.displayName}</strong>
                    <span>{service.kind} · {availabilityLabel(service)}</span>
                    <small>{service.error ? friendlyIssue(service.error) : service.verificationReason ?? "Servis bağlantısı sınırlı olabilir."}</small>
                  </div>
                  {cooldown && <em>{cooldown}</em>}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="citizen-status-section" aria-labelledby="citizen-incident-history">
        <div className="citizen-status-section-heading">
          <div><span className="eyebrow">BU TARAYICIDAKİ GEÇMİŞ</span><h4 id="citizen-incident-history">Son bağlantı olayları</h4></div>
          <span>{incidents.length} kayıt</span>
        </div>

        {incidents.length === 0 ? (
          <div className="empty-state compact"><Icon name="check" size={24} /><strong>Kayıtlı sorun yok</strong><span>Yeni bağlantı veya katman olayları burada görünür.</span></div>
        ) : (
          <div className="citizen-incident-list">
            {incidents.slice(0, 20).map((incident) => (
              <article key={incident.id} className={`severity-${incident.severity}`}>
                <span className="citizen-incident-icon" aria-hidden="true"><Icon name={incident.recovered ? "check" : incident.severity === "error" ? "warning" : "info"} size={14} /></span>
                <div>
                  <strong>{incident.serviceName ?? incidentKindLabel(incident.kind)}</strong>
                  <p>{incident.message}</p>
                  <small>{new Date(incident.occurredAt).toLocaleString("tr-TR")}{incident.durationMs !== undefined ? ` · ${incident.durationMs} ms` : ""}</small>
                </div>
                {(incident.occurrences ?? 1) > 1 && <em aria-label={`${incident.occurrences} tekrar`}>×{incident.occurrences}</em>}
              </article>
            ))}
          </div>
        )}

        <div className="citizen-status-actions">
          <button type="button" className="catalog-action" onClick={exportJournal} disabled={incidents.length === 0}><Icon name="download" size={15} /> Güvenli raporu indir</button>
          {confirmClear ? (
            <span className="citizen-clear-confirm">
              <button type="button" className="catalog-action is-danger" onClick={clearJournal}>Evet, temizle</button>
              <button type="button" className="catalog-action" onClick={() => setConfirmClear(false)}>Vazgeç</button>
            </span>
          ) : (
            <button type="button" className="catalog-action" onClick={() => setConfirmClear(true)} disabled={incidents.length === 0}><Icon name="trash" size={15} /> Geçmişi temizle</button>
          )}
        </div>
        <p className="section-note">Bu geçmiş yalnız bu tarayıcıda tutulur. Dışa aktarılan raporda servis URL'si veya erişim anahtarı bulunmaz; tekrar eden aynı olaylar 30 saniyelik pencerede tek satırda birleştirilir.</p>
      </section>
    </div>
  );
}

function StatusMetric({ label, value, tone }: { label: string; value: number; tone: "good" | "bad" | "neutral" }) {
  return <div className={`citizen-status-metric tone-${tone}`}><strong>{value}</strong><span>{label}</span></div>;
}

function incidentKindLabel(kind: RuntimeIncident["kind"]): string {
  if (kind === "network") return "İnternet bağlantısı";
  if (kind === "layer-load") return "Katman açma";
  if (kind === "layer-retry") return "Katman yeniden deneme";
  if (kind === "query") return "Harita verisi sorgusu";
  if (kind === "boot") return "Uygulama başlangıcı";
  return "Harita sistemi";
}

function friendlyIssue(value: string): string {
  const safe = String(value).replace(/https?:\/\/\S+/gi, "[adres gizlendi]");
  if (/timeout|timed out|zaman aş/i.test(safe)) return "Servis zamanında yanıt vermedi.";
  if (/401|403|unauthor|forbidden|yetki/i.test(safe)) return "Servis erişim izni gerektiriyor.";
  if (/network|fetch|bağlant/i.test(safe)) return "Servise ağ üzerinden ulaşılamadı.";
  return safe.slice(0, 180);
}

function issueWeight(service: ServiceDefinition): number {
  let value = 0;
  if (service.status === "error") value += 8;
  if (service.availability === "unavailable") value += 6;
  if (service.availability === "degraded") value += 3;
  if (service.failureCount > 0) value += Math.min(5, service.failureCount);
  return value;
}
