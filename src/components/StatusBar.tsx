import type { SceneTelemetry, ServiceDefinition } from "../types";

export function StatusBar({ telemetry, services }: { telemetry: SceneTelemetry; services: ServiceDefinition[] }) {
  const active = services.filter((service) => service.visible).length;
  const scale = Number.isFinite(telemetry.scale) && telemetry.scale
    ? `1:${Math.round(telemetry.scale).toLocaleString("tr-TR")}`
    : "—";

  return (
    <footer className="status-bar" aria-label="Harita bilgileri">
      <div className="status-segment status-coordinate">
        <span className="status-label">Konum</span>
        <strong>{coordinate(telemetry)}</strong>
      </div>
      <div className="status-segment status-scale">
        <span className="status-label">Ölçek</span>
        <strong>{scale}</strong>
      </div>
      <div className="status-segment status-service-summary">
        <span><i className="status-indicator is-active" /> <strong>{active}</strong> açık katman</span>
      </div>
    </footer>
  );
}

function coordinate(telemetry: SceneTelemetry): string {
  const { latitude, longitude } = telemetry;
  if (typeof latitude !== "number" || typeof longitude !== "number") return "—";
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "—";
  return `${latitude.toFixed(5)}° N · ${longitude.toFixed(5)}° E`;
}
