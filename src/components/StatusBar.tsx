import type { PerformanceProfile, SceneTelemetry, ServiceDefinition } from "../types";
import { Icon } from "./Icon";

export function StatusBar({ telemetry, services, performance }: { telemetry: SceneTelemetry; services: ServiceDefinition[]; performance: PerformanceProfile }) {
  const active = services.filter((service) => service.visible).length;
  const ready = services.filter((service) => service.status === "ready").length;
  const errors = services.filter((service) => service.status === "error").length;
  return (
    <footer className="status-bar">
      <span className="status-coordinate">{coordinate(telemetry)}</span>
      <span>Yükseklik <strong>{Math.round(telemetry.altitude).toLocaleString("tr-TR")} m</strong></span>
      <span>Eğim <strong>{Math.round(telemetry.tilt)}°</strong></span>
      <span>Katman <strong>{active}</strong></span>
      <span>Hazır <strong>{ready}</strong></span>
      {errors > 0 && <span className="status-error">Hata <strong>{errors}</strong></span>}
      <span className={`performance-pill performance-${performance}`}><Icon name="speed" size={13} /> {performanceLabel(performance)}</span>
    </footer>
  );
}

function coordinate(telemetry: SceneTelemetry): string {
  if (!Number.isFinite(telemetry.latitude) || !Number.isFinite(telemetry.longitude)) return "39.9208° N · 32.8542° E";
  return `${telemetry.latitude!.toFixed(5)}° N · ${telemetry.longitude!.toFixed(5)}° E`;
}

function performanceLabel(profile: PerformanceProfile): string {
  if (profile === "high") return "Yüksek kalite";
  if (profile === "balanced") return "Dengeli";
  return "Eco GPU";
}
