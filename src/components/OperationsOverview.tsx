import { useMemo } from "react";
import {
  operationalRecommendations,
  rankServicesByReadiness,
  readinessLabel,
  summarizeOperationalReadiness
} from "../lib/operationsIntelligence";
import { availabilityLabel } from "../lib/serviceHealth";
import type { PanelId, PerformanceProfile, ServiceDefinition } from "../types";
import { Icon } from "./Icon";

interface Props {
  services: ServiceDefinition[];
  online: boolean;
  performance: PerformanceProfile;
  onPanel: (panel: Exclude<PanelId, null>) => void;
}

export function OperationsOverview({ services, online, performance, onPanel }: Props) {
  const summary = useMemo(() => summarizeOperationalReadiness(services), [services]);
  const recommendations = useMemo(() => operationalRecommendations(services), [services]);
  const weakest = useMemo(() => rankServicesByReadiness(services, "worst").slice(0, 5), [services]);
  const strongest = useMemo(() => rankServicesByReadiness(services, "best").slice(0, 3), [services]);
  const verifiedAt = useMemo(
    () => services
      .map((service) => service.verifiedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1),
    [services]
  );
  const stale = services.some((service) => service.verificationStale);

  return (
    <div className="operations-body operations-overview">
      <section className={`overview-hero grade-${summary.grade}`}>
        <div className="readiness-score" aria-label={`Operasyon hazırlık puanı ${summary.score}/100`}>
          <strong>{summary.score}</strong>
          <span>/100</span>
        </div>
        <div className="overview-hero-copy">
          <span className="eyebrow">OPERASYON HAZIRLIK ENDEKSİ</span>
          <h3>{readinessLabel(summary.grade)}</h3>
          <p>
            {online
              ? "Tarayıcı çevrimiçi. Harici doğrulama, canlı çalışma zamanı ve devre kesici sinyalleri birlikte değerlendiriliyor."
              : "Tarayıcı çevrimdışı. Son bilinen servis durumu korunuyor; yeni ağ istekleri başarısız olabilir."}
          </p>
          <div className="overview-context">
            <span><Icon name="speed" size={13} /> {performance}</span>
            <span><Icon name="health" size={13} /> {verifiedAt ? `${stale ? "Eski · " : ""}${new Date(verifiedAt).toLocaleString("tr-TR")}` : "Doğrulama yok"}</span>
          </div>
        </div>
      </section>

      <section className="overview-metrics" aria-label="Operasyon metrikleri">
        <OverviewMetric label="Doğrulandı" value={summary.verified} sub={`${summary.total} servisten`} tone="good" />
        <OverviewMetric label="Riskli" value={summary.risky} sub="kısıtlı / ulaşılamıyor" tone={summary.risky ? "warn" : "good"} />
        <OverviewMetric label="Aktif" value={summary.active} sub={`${summary.ready} hazır`} tone="neutral" />
        <OverviewMetric label="Canlı hata" value={summary.runtimeErrors} sub={summary.coolingDown ? `${summary.coolingDown} devre kesici` : "devre kesici yok"} tone={summary.runtimeErrors ? "bad" : "good"} />
      </section>

      <section className="overview-quick-actions">
        <button type="button" onClick={() => onPanel("layers")}><Icon name="layers" /><span><strong>Katmanları yönet</strong><small>Doğrulama durumuna göre filtrele</small></span><Icon name="chevron" size={14} /></button>
        <button type="button" onClick={() => onPanel("health")}><Icon name="health" /><span><strong>Servis sağlığı</strong><small>Hata ve devre kesici ayrıntıları</small></span><Icon name="chevron" size={14} /></button>
        <button type="button" onClick={() => onPanel("data")}><Icon name="table" /><span><strong>Sorgu stüdyosu</strong><small>Sunucu tarafı filtre ve sayfalama</small></span><Icon name="chevron" size={14} /></button>
        <button type="button" onClick={() => onPanel("workspace")}><Icon name="archive" /><span><strong>Çalışma alanı</strong><small>Güvenli JSON içe / dışa aktarma</small></span><Icon name="chevron" size={14} /></button>
      </section>

      <section className="overview-section">
        <div className="overview-section-heading">
          <div><span className="eyebrow">ÖNCELİKLİ SİNYALLER</span><strong>İlgilenilmesi gereken servisler</strong></div>
          <button type="button" className="catalog-action" onClick={() => onPanel("health")}>Tümünü gör</button>
        </div>
        <div className="readiness-list">
          {weakest.map(({ service, readiness }) => (
            <article key={service.id}>
              <div className={`readiness-dot grade-${readiness.grade}`} />
              <div className="readiness-main">
                <strong>{service.displayName}</strong>
                <span>{availabilityLabel(service)} · {service.kind}</span>
                {readiness.signals[0] && <small>{readiness.signals[0]}</small>}
              </div>
              <div className="readiness-value"><strong>{readiness.score}</strong><span>/100</span></div>
            </article>
          ))}
          {weakest.length === 0 && <div className="empty-state compact">Servis kataloğu henüz hazır değil.</div>}
        </div>
      </section>

      <section className="overview-section">
        <div className="overview-section-heading">
          <div><span className="eyebrow">ÖNERİLER</span><strong>Operasyon aksiyonları</strong></div>
        </div>
        <div className="recommendation-list">
          {recommendations.map((item, index) => (
            <div key={item}><span>{String(index + 1).padStart(2, "0")}</span><p>{item}</p></div>
          ))}
        </div>
      </section>

      <section className="overview-section">
        <div className="overview-section-heading">
          <div><span className="eyebrow">EN GÜÇLÜ SERVİSLER</span><strong>Hazırlık puanı yüksek katmanlar</strong></div>
        </div>
        <div className="overview-top-services">
          {strongest.map(({ service, readiness }) => (
            <button key={service.id} type="button" onClick={() => onPanel("layers")}>
              <span><Icon name="check" size={14} /></span>
              <div><strong>{service.displayName}</strong><small>{service.kind} · {readiness.score}/100</small></div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function OverviewMetric({ label, value, sub, tone }: { label: string; value: number; sub: string; tone: "good" | "warn" | "bad" | "neutral" }) {
  return (
    <div className={`overview-metric tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </div>
  );
}
