import { isServiceCoolingDown } from "./serviceHealth";
import type {
  OperationalGrade,
  OperationalReadinessSummary,
  ServiceDefinition,
  ServiceReadiness
} from "../types";

export function serviceReadiness(service: ServiceDefinition, now = Date.now()): ServiceReadiness {
  let score = availabilityBase(service);
  const signals: string[] = [];

  if (service.availability === "verified") signals.push("Harici doğrulama başarılı");
  if (service.verificationStale) {
    score -= 6;
    signals.push("Harici doğrulama eski");
  }

  if (service.access === "public-browser") score += 12;
  else if (service.access === "browser-blocked") {
    score -= 12;
    signals.push("Tarayıcı CORS erişimi engelli");
  } else if (service.access === "network-restricted") {
    score -= 8;
    signals.push("Ağ/kurum erişimi gerekebilir");
  } else if (service.access === "server-error") {
    score -= 18;
    signals.push("Sunucu protokol hatası");
  }

  if (service.status === "ready") score += 10;
  else if (service.status === "loading") score += 2;
  else if (service.status === "error") {
    score -= 18;
    signals.push("Canlı çalışma zamanı hatası");
  }

  if (service.visible) score += 2;
  if (Number.isFinite(service.latencyMs)) {
    if (service.latencyMs! < 500) score += 5;
    else if (service.latencyMs! < 1500) score += 2;
    else if (service.latencyMs! > 3000) {
      score -= 7;
      signals.push("Yüksek canlı gecikme");
    }
  }

  if (Number.isFinite(service.verificationLatencyMs)) {
    if (service.verificationLatencyMs! > 3000) {
      score -= 5;
      signals.push("Harici doğrulama gecikmesi yüksek");
    }
  }

  if ((service.failureCount ?? 0) > 0) {
    score -= Math.min(18, (service.failureCount ?? 0) * 4);
    signals.push(`${service.failureCount} ardışık hata`);
  }

  if (isServiceCoolingDown(service, now)) {
    score -= 12;
    signals.push("Devre kesici beklemede");
  }

  const normalized = clamp(Math.round(score), 0, 100);
  return {
    serviceId: service.id,
    score: normalized,
    grade: readinessGrade(normalized),
    signals: signals.slice(0, 4)
  };
}

export function summarizeOperationalReadiness(
  services: ServiceDefinition[],
  now = Date.now()
): OperationalReadinessSummary {
  const scores = services.map((service) => serviceReadiness(service, now).score);
  const score = scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : 0;
  return {
    score,
    grade: readinessGrade(score),
    verified: services.filter((service) => service.availability === "verified").length,
    risky: services.filter((service) => service.availability === "degraded" || service.availability === "unavailable").length,
    runtimeErrors: services.filter((service) => service.status === "error").length,
    coolingDown: services.filter((service) => isServiceCoolingDown(service, now)).length,
    active: services.filter((service) => service.visible).length,
    ready: services.filter((service) => service.status === "ready").length,
    total: services.length
  };
}

export function operationalRecommendations(services: ServiceDefinition[], now = Date.now()): string[] {
  const summary = summarizeOperationalReadiness(services, now);
  const recommendations: string[] = [];

  if (summary.runtimeErrors > 0) {
    recommendations.push(`${summary.runtimeErrors} servis canlı çalışma zamanında hata veriyor; Servis Sağlığı panelinden uygun olanları yeniden deneyin.`);
  }
  if (summary.coolingDown > 0) {
    recommendations.push(`${summary.coolingDown} servis devre kesici beklemesinde; otomatik tekrar yüklemeyi zorlamayın.`);
  }
  const stale = services.filter((service) => service.verificationStale).length;
  if (stale > 0) {
    recommendations.push(`${stale} servisin harici doğrulaması eski; bir sonraki production health refresh sonucu güncelleyecek.`);
  }
  const blocked = services.filter((service) => service.access === "browser-blocked").length;
  if (blocked > 0) {
    recommendations.push(`${blocked} servis tarayıcı CORS erişimine kapalı; same-origin proxy gerekebilir.`);
  }
  const networkRestricted = services.filter((service) => service.access === "network-restricted").length;
  if (networkRestricted > 0) {
    recommendations.push(`${networkRestricted} servis kurum ağı veya özel erişim gerektirebilir.`);
  }
  if (summary.risky === 0 && summary.runtimeErrors === 0 && summary.total > 0) {
    recommendations.push("Katalogda aktif kritik sinyal yok; doğrulanmış servislerle çalışmaya devam edebilirsiniz.");
  }

  return recommendations.slice(0, 4);
}

export function rankServicesByReadiness(
  services: ServiceDefinition[],
  direction: "best" | "worst" = "worst",
  now = Date.now()
): Array<{ service: ServiceDefinition; readiness: ServiceReadiness }> {
  return services
    .map((service) => ({ service, readiness: serviceReadiness(service, now) }))
    .sort((a, b) => direction === "best"
      ? b.readiness.score - a.readiness.score
      : a.readiness.score - b.readiness.score
    );
}

export function readinessGrade(score: number): OperationalGrade {
  if (score >= 85) return "excellent";
  if (score >= 65) return "good";
  if (score >= 40) return "attention";
  return "critical";
}

export function readinessLabel(grade: OperationalGrade): string {
  if (grade === "excellent") return "Çok iyi";
  if (grade === "good") return "İyi";
  if (grade === "attention") return "Dikkat";
  return "Kritik";
}

function availabilityBase(service: ServiceDefinition): number {
  if (service.availability === "verified") return 68;
  if (service.availability === "degraded") return 48;
  if (service.availability === "unavailable") return 18;
  return 42;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
