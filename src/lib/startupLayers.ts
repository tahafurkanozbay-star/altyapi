import type { ServiceDefinition } from "../types";
import { shouldAutoLoadService } from "./serviceHealth";

/** Respect explicit empty views; a fresh session starts with light boundaries. */
export function chooseStartupLayers(
  services: ServiceDefinition[],
  explicitSelection: boolean
): ServiceDefinition[] {
  if (explicitSelection || services.some((service) => service.visible)) return services;
  const boundary = services.find((service) =>
    service.kind === "FeatureServer" && /s[ıi]n[ıi]r/i.test(service.displayName) && shouldAutoLoadService(service)
  );
  return services.map((service) => ({ ...service, visible: service.id === boundary?.id }));
}
