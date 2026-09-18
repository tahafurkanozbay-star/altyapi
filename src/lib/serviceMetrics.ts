import { isServiceCoolingDown } from "./serviceHealth";
import type { ServiceDefinition, ServiceHealthSummary } from "../types";

export function summarizeServiceHealth(services: ServiceDefinition[]): ServiceHealthSummary {
  const latencies = services
    .map((service) => service.latencyMs)
    .filter((value): value is number => Number.isFinite(value) && value! >= 0)
    .sort((a, b) => a - b);

  return {
    ready: services.filter((service) => service.status === "ready").length,
    loading: services.filter((service) => service.status === "loading").length,
    error: services.filter((service) => service.status === "error").length,
    idle: services.filter((service) => service.status === "idle").length,
    active: services.filter((service) => service.visible).length,
    averageLatencyMs: latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : undefined,
    p95LatencyMs: latencies.length ? percentile(latencies, 0.95) : undefined,
    verified: services.filter((service) => service.availability === "verified").length,
    degraded: services.filter((service) => service.availability === "degraded").length,
    unavailable: services.filter((service) => service.availability === "unavailable").length,
    unknown: services.filter((service) => service.availability === "unknown").length,
    coolingDown: services.filter((service) => isServiceCoolingDown(service)).length
  };
}

export function latencyLabel(value?: number): string {
  if (!Number.isFinite(value)) return "Ölçülmedi";
  if (value! < 400) return "Hızlı";
  if (value! < 1200) return "Normal";
  if (value! < 3000) return "Yavaş";
  return "Çok yavaş";
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return Math.round(sorted[index]!);
}
