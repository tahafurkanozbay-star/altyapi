import type { ServiceDefinition } from "../types";
import { isUnconfiguredTucbsUrl } from "./tucbsAccess";

/**
 * Produces deterministic transport candidates for one logical catalogue row.
 * The catalogue transport keeps priority when it is configured. If its TUCBS
 * runtime sentinel has not been configured but an equivalent WMS/WFS peer has,
 * the configured peer is promoted so opening either catalogue row can still
 * reach the logical dataset from an approved client IP.
 *
 * Alternate representations keep the original service id so UI state, scale
 * guards and layer cache semantics stay atomic while transport changes beneath.
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

  return candidates
    .map((candidate, index) => ({ candidate, index, unconfigured: isUnconfiguredTucbsUrl(candidate.url) }))
    .sort((left, right) => Number(left.unconfigured) - Number(right.unconfigured) || left.index - right.index)
    .map(({ candidate }) => candidate);
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
