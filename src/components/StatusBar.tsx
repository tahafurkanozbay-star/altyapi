import { summarizeServiceHealth } from "../lib/serviceMetrics";
import { readinessLabel, summarizeOperationalReadiness } from "../lib/operationsIntelligence";
import type { PerformanceProfile, SceneTelemetry, ServiceDefinition } from "../types";
import { Icon } from "./Icon";

export function StatusBar({ telemetry, services, performance }: { telemetry: SceneTelemetry; services: ServiceDefinition[]; performance: PerformanceProfile }) {
  const health = summarizeServiceHealth(services);
  const readiness = summarizeOperationalReadiness(services);
  const { active, ready, error: errors } = health;
  const scale = Number.isFinite(telemetry.scale) && telemetry.scale ? `1:${Math.round(telemetry.scale).toLocaleString("tr-TR")}` : "—";

  return (
    <footer className="status-bar" aria-label="Sahne telemetrisi">
      <div className="status-segment status-coordinate">
        <span className="status-label">Konum</span>
        <strong>{coordinate(telemetry)}</strong>
      </div>
      <div className="status-segment">
        <span className="status-label">Kamera</span>
        <strong>{Math.round(telemetry.altitude).toLocaleString("tr-TR")} m</strong>
        <span className="status-secondary">{Math.round(telemetry.tilt)}° eğim</span>
      </div>
      <div className="status-segment status-scale">
        <span className="status-label">Ölçek</span>
        <strong>{scale}</strong>
      </div>
      <div className="status-segment status-readiness" title={`Operasyon hazırlığı: ${readinessLabel(readiness.grade)}`}>
        <span className="status-label">Hazırlık</span>
        <strong>{readiness.score}/100</strong>
      </div>
      <div className="status-segment status-service-summary">
        <span><i className="status-indicator is-active" /> <strong>{active}</strong> aktif</span>
        <span><i className="status-indicator is-ready" /> <strong>{ready}</strong> hazır</span>
        {errors > 0 && <span className="status-error"><i className="status-indicator is-error" /> <strong>{errors}</strong> hata</span>}
        <span className="status-verified"><i className="status-indicator is-verified" /> <strong>{health.verified}</strong> doğrulandı</span>
        {(health.degraded + health.unavailable) > 0 && <span className="status-risk"><i className="status-indicator is-risk" /> <strong>{health.degraded + health.unavailable}</strong> riskli</span>}
        {health.coolingDown > 0 && <span className="status-circuit"><Icon name="refresh" size={11} /> <strong>{health.coolingDown}</strong> bekliyor</span>}
        {health.averageLatencyMs !== undefined && <span className="status-latency"><Icon name="speed" size={12} /> <strong>{health.averageLatencyMs}</strong> ms</span>}
      </div>
      <div className={`performance-pill performance-${performance}`}><Icon name="speed" size={13} /><span>{performanceLabel(performance)}</span></div>
    </footer>
  );
}

function coordinate(telemetry: SceneTelemetry): string {
  if (!Number.isFinite(telemetry.latitude) || !Number.isFinite(telemetry.longitude)) return "39.92080° N · 32.85420° E";
  return `${telemetry.latitude!.toFixed(5)}° N · ${telemetry.longitude!.toFixed(5)}° E`;
}

function performanceLabel(profile: PerformanceProfile): string {
  if (profile === "high") return "Yüksek kalite";
  if (profile === "balanced") return "Dengeli GPU";
  return "Eco GPU";
}
