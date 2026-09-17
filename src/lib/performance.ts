import type { PerformanceProfile } from "../types";

export interface PerformanceHints {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  reducedMotion?: boolean;
  mobile?: boolean;
}

export function detectPerformanceProfile(hints: PerformanceHints = {}): PerformanceProfile {
  const cores = hints.hardwareConcurrency ?? navigator.hardwareConcurrency ?? 4;
  const memory = hints.deviceMemory ?? navigator.deviceMemory ?? 4;
  const reduced = hints.reducedMotion ?? matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mobile = hints.mobile ?? matchMedia("(pointer: coarse) and (max-width: 900px)").matches;

  if (reduced || memory <= 2 || cores <= 2) return "eco";
  if (mobile || memory <= 4 || cores <= 6) return "balanced";
  return "high";
}

export function profileToSceneQuality(profile: PerformanceProfile): "high" | "medium" | "low" {
  if (profile === "high") return "high";
  if (profile === "balanced") return "medium";
  return "low";
}
