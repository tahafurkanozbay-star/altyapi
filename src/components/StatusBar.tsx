import { useSyncExternalStore } from "react";
import {
  getLayerRenderHealthSnapshot,
  getServerLayerRenderHealthSnapshot,
  subscribeLayerRenderHealth
} from "../lib/layerRenderHealth";
import { deriveCitizenReadiness } from "../lib/citizenReadiness";
import type { SceneTelemetry, ServiceDefinition } from "../types";

export function StatusBar({ telemetry, services }: { telemetry: SceneTelemetry; services: ServiceDefinition[] }) {
  const renderHealth = useSyncExternalStore(
    subscribeLayerRenderHealth,
    getLayerRenderHealthSnapshot,
    getServerLayerRenderHealthSnapshot
  );
  const online = useSyncExternalStore(subscribeOnline, readOnline, () => true);
  const readiness = deriveCitizenReadiness(services, renderHealth, online);
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
      <div
        className="status-segment status-readiness"
        data-tone={readiness.tone}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        title={readiness.detail}
      >
        <i className="status-readiness-dot" aria-hidden="true" />
        <span className="status-readiness-copy">
          <strong>{readiness.label}</strong>
          <span>{readiness.detail}</span>
        </span>
      </div>
      <div className="status-segment status-service-summary" aria-label={`${readiness.active} açık katman`}>
        <span><strong>{readiness.active}</strong> açık katman</span>
        {readiness.loading > 0 && <span><strong>{readiness.loading}</strong> yükleniyor</span>}
        {readiness.failed > 0 && <span><strong>{readiness.failed}</strong> sorunlu</span>}
      </div>
    </footer>
  );
}

function subscribeOnline(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

function readOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

function coordinate(telemetry: SceneTelemetry): string {
  if (!Number.isFinite(telemetry.latitude) || !Number.isFinite(telemetry.longitude)) return "39.92080° N · 32.85420° E";
  return `${telemetry.latitude!.toFixed(5)}° N · ${telemetry.longitude!.toFixed(5)}° E`;
}
