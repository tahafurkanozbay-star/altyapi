import type { ServiceDefinition } from "../types";

/**
 * Produces deterministic transport candidates for one logical catalogue row.
 * The original service is always first. Alternate WMS/WFS representations keep
 * the original service id so UI state, scale guards and layer cache semantics
 * stay atomic while the transport changes underneath.
 */
export function serviceAttemptCandidates(service: ServiceDefinition): ServiceDefinition[] {
  const candidates: ServiceDefinition[] = [service];
  const seen = new Set([candidateIdentity(service.kind, service.url)]);

  for (const alternate of service.alternateEndpoints ?? []) {
    const identity = candidateIdentity(alternate.kind, alternate.url);
    if (seen.has(identity)) continue;
    seen.add(identity);
    candidates.push({
      ...service,
      kind: alternate.kind,
      url: alternate.url,
      tokenUrl: alternate.url,
      alternateEndpoints: []
    });
  }

  return candidates;
}

export function serviceCandidateForAttempt(service: ServiceDefinition, attempt: number): ServiceDefinition {
  const candidates = serviceAttemptCandidates(service);
  if (candidates.length === 1) return service;
  const safeAttempt = Math.max(1, Math.floor(attempt));
  return candidates[(safeAttempt - 1) % candidates.length] ?? service;
}

export function hasSemanticFailover(service: ServiceDefinition): boolean {
  return serviceAttemptCandidates(service).length > 1;
}

function candidateIdentity(kind: string, url: string): string {
  try {
    const parsed = new URL(url);
    return `${kind}|${parsed.origin}${parsed.pathname}${parsed.search}`;
  } catch {
    return `${kind}|${url}`;
  }
}
