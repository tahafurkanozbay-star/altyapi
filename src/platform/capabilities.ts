import type { BrowserCapabilities } from "../types";

type NetworkInformation = {
  effectiveType?: string;
  saveData?: boolean;
};

type NavigatorWithNetwork = Navigator & {
  connection?: NetworkInformation;
  deviceMemory?: number;
};

export function collectBrowserCapabilities(): BrowserCapabilities {
  const extendedNavigator = navigator as NavigatorWithNetwork;
  const canvas = document.createElement("canvas");
  const webgl2 = Boolean(canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: true }));
  canvas.width = 0;
  canvas.height = 0;

  return {
    webgl2,
    secureContext: window.isSecureContext,
    online: navigator.onLine,
    hardwareConcurrency: Math.max(1, navigator.hardwareConcurrency || 1),
    deviceMemory: extendedNavigator.deviceMemory,
    maxTouchPoints: navigator.maxTouchPoints || 0,
    devicePixelRatio: Number.isFinite(window.devicePixelRatio) ? window.devicePixelRatio : 1,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    colorGamut: detectColorGamut(),
    connectionType: extendedNavigator.connection?.effectiveType,
    saveData: extendedNavigator.connection?.saveData
  };
}

export function capabilityScore(capabilities: BrowserCapabilities): number {
  let score = 100;
  if (!capabilities.webgl2) score -= 70;
  if (!capabilities.secureContext) score -= 10;
  if (!capabilities.online) score -= 15;
  if (capabilities.hardwareConcurrency <= 2) score -= 20;
  else if (capabilities.hardwareConcurrency <= 4) score -= 10;
  if ((capabilities.deviceMemory ?? 4) <= 2) score -= 20;
  else if ((capabilities.deviceMemory ?? 4) <= 4) score -= 8;
  if (capabilities.saveData) score -= 10;
  return Math.max(0, Math.min(100, score));
}

export function capabilityLabel(score: number): string {
  if (score >= 85) return "Yüksek kapasite";
  if (score >= 65) return "Dengeli";
  if (score >= 40) return "Sınırlı";
  return "Kritik";
}

function detectColorGamut(): BrowserCapabilities["colorGamut"] {
  if (matchMedia("(color-gamut: rec2020)").matches) return "rec2020";
  if (matchMedia("(color-gamut: p3)").matches) return "p3";
  return "srgb";
}
