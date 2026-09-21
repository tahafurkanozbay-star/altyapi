import { isServiceCoolingDown } from "./serviceHealth";
import { serviceReadiness } from "./operationsIntelligence";
import type { ServiceDefinition } from "../types";

export interface StabilizationPlan {
  hideIds: string[];
  activateIds: string[];
  alreadyStable: string[];
}

export function buildStabilizationPlan(
  services: ServiceDefinition[],
  options: { maxActivations?: number; now?: number } = {}
): StabilizationPlan {
  const now = options.now ?? Date.now();
  const maxActivations = Math.max(0, Math.min(4, options.maxActivations ?? 2));

  const unstableVisible = services.filter((service) =>
    service.visible && (
      service.availability !== "verified" ||
      service.status === "error" ||
      isServiceCoolingDown(service, now)
    )
  );

  const alreadyStable = services.filter((service) =>
    service.visible &&
    service.availability === "verified" &&
    service.status !== "error" &&
    !isServiceCoolingDown(service, now)
  );

  const activateIds = alreadyStable.length
    ? []
    : services
        .filter((service) =>
          !service.visible &&
          service.availability === "verified" &&
          service.status !== "error" &&
          !isServiceCoolingDown(service, now)
        )
        .map((service) => ({ service, readiness: serviceReadiness(service, now).score }))
        .sort((a, b) =>
          Number(b.service.favorite) - Number(a.service.favorite) ||
          kindPriority(a.service.kind) - kindPriority(b.service.kind) ||
          b.readiness - a.readiness ||
          a.service.displayName.localeCompare(b.service.displayName, "tr")
        )
        .slice(0, maxActivations)
        .map(({ service }) => service.id);

  return {
    hideIds: unstableVisible.map((service) => service.id),
    activateIds,
    alreadyStable: alreadyStable.map((service) => service.id)
  };
}

function kindPriority(kind: ServiceDefinition["kind"]): number {
  if (kind === "SceneServer") return 0;
  if (kind === "FeatureServer") return 1;
  if (kind === "MapServer") return 2;
  if (kind === "WMS") return 3;
  return 4;
}
