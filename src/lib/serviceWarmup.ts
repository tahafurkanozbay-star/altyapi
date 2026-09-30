import type { PerformanceProfile, ServiceKind } from "../types";
import { detectPerformanceProfile } from "./performance";

const WARMUP_LATENCY_THRESHOLD_MS = 1_500;
const WARMUP_TIMEOUT_MS = 9_000;
const WARMUP_SESSION_KEY = "altyapi:public-service-warmup-v2";
const WARMUP_LOCK_NAME = "altyapi:public-service-warmup";
const TUCBS_HOST = "ucbp-api.tucbs.gov.tr";
const ARCGIS_KINDS = new Set<ServiceKind>(["MapServer", "FeatureServer", "SceneServer"]);
const SENSITIVE_QUERY_KEYS = /^(?:token|access_token|api_?key|apikey|secret|password|pass|signature|sig|auth|authorization)$/i;

interface PublicCatalogEntry {
  servisTuruAdi?: string;
  tokenUrl?: string;
}

interface HealthEntry {
  index?: number;
  kind?: string;
  availability?: string;
  access?: string;
  browserCompatible?: boolean | null;
  latencyMs?: number;
}

interface HealthDocument {
  generatedAt?: string;
  services?: HealthEntry[];
}

export interface ServiceWarmupCandidate {
  index: number;
  kind: ServiceKind;
  url: string;
  latencyMs: number;
}

type ConnectionHints = {
  saveData?: boolean;
  effectiveType?: string;
};

type WarmupLockManager = {
  request(
    name: string,
    options: { mode: "exclusive"; ifAvailable: true; signal?: AbortSignal },
    callback: (lock: { name: string } | null) => Promise<void>
  ): Promise<void>;
};

type NavigatorWithConnection = Pick<Navigator, "onLine"> & {
  connection?: ConnectionHints;
  mozConnection?: ConnectionHints;
  webkitConnection?: ConnectionHints;
  locks?: WarmupLockManager;
};

type WindowWithIdleCallback = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
};

export function serviceWarmupBudget(profile: PerformanceProfile): { maxCandidates: number; concurrency: number } {
  if (profile === "eco") return { maxCandidates: 1, concurrency: 1 };
  if (profile === "balanced") return { maxCandidates: 3, concurrency: 1 };
  return { maxCandidates: 4, concurrency: 2 };
}

export function isSafePublicArcGisWarmupUrl(value: string): boolean {
  try {
    const target = new URL(value);
    if (target.protocol !== "https:") return false;
    if (target.username || target.password) return false;
    if (target.hostname.toLowerCase() === TUCBS_HOST) return false;
    if (/\/__runtime__\//i.test(target.pathname)) return false;
    for (const key of target.searchParams.keys()) {
      if (SENSITIVE_QUERY_KEYS.test(key)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function selectPublicServiceWarmupCandidates(
  catalog: unknown,
  health: unknown,
  profile: PerformanceProfile
): ServiceWarmupCandidate[] {
  const rawServices = catalog && typeof catalog === "object" && Array.isArray((catalog as { services?: unknown }).services)
    ? (catalog as { services: PublicCatalogEntry[] }).services
    : [];
  const healthEntries = health && typeof health === "object" && Array.isArray((health as HealthDocument).services)
    ? (health as HealthDocument).services ?? []
    : [];
  const { maxCandidates } = serviceWarmupBudget(profile);

  return healthEntries.flatMap((entry): ServiceWarmupCandidate[] => {
    const index = entry.index;
    const latencyMs = entry.latencyMs;
    if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= rawServices.length) return [];
    if (entry.availability !== "verified" || entry.access !== "public-browser" || entry.browserCompatible !== true) return [];
    if (typeof latencyMs !== "number" || !Number.isFinite(latencyMs) || latencyMs < WARMUP_LATENCY_THRESHOLD_MS) return [];

    const raw = rawServices[index];
    const kind = raw?.servisTuruAdi as ServiceKind | undefined;
    const url = raw?.tokenUrl;
    if (!kind || !ARCGIS_KINDS.has(kind) || typeof url !== "string" || !isSafePublicArcGisWarmupUrl(url)) return [];

    return [{ index, kind, url, latencyMs: Math.round(latencyMs) }];
  })
    .sort((left, right) => right.latencyMs - left.latencyMs || left.index - right.index)
    .slice(0, maxCandidates);
}

export function shouldRunPublicServiceWarmup(navigatorLike: NavigatorWithConnection = navigator as NavigatorWithConnection): boolean {
  if (navigatorLike.onLine === false) return false;
  const connection = navigatorLike.connection ?? navigatorLike.mozConnection ?? navigatorLike.webkitConnection;
  if (connection?.saveData) return false;
  const effectiveType = connection?.effectiveType?.toLowerCase();
  if (effectiveType === "slow-2g" || effectiveType === "2g") return false;
  return true;
}

export function installPublicServiceWarmup(): void {
  if (typeof window === "undefined" || typeof document === "undefined" || typeof navigator === "undefined") return;
  if (!shouldRunPublicServiceWarmup()) return;

  const lifecycle = new AbortController();
  const abortWarmup = () => lifecycle.abort();
  window.addEventListener("pagehide", abortWarmup, { once: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") abortWarmup();
  }, { once: true });

  const start = () => {
    const windowWithIdle = window as WindowWithIdleCallback;
    const run = () => void runCoordinatedWarmup(lifecycle.signal).catch(() => undefined);
    window.setTimeout(() => {
      if (lifecycle.signal.aborted) return;
      if (windowWithIdle.requestIdleCallback) windowWithIdle.requestIdleCallback(run, { timeout: 5_000 });
      else window.setTimeout(run, 900);
    }, 2_000);
  };

  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}

async function runCoordinatedWarmup(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  const lockManager = (navigator as NavigatorWithConnection).locks;
  if (!lockManager) {
    await warmSlowPublicServices(signal);
    return;
  }

  await lockManager.request(
    WARMUP_LOCK_NAME,
    { mode: "exclusive", ifAvailable: true, signal },
    async (lock) => {
      if (!lock || signal.aborted) return;
      await warmSlowPublicServices(signal);
    }
  );
}

async function warmSlowPublicServices(signal: AbortSignal): Promise<void> {
  if (signal.aborted || !shouldRunPublicServiceWarmup()) return;

  const [catalogResponse, healthResponse] = await Promise.all([
    fetch("./services.json", { cache: "no-store", credentials: "same-origin", signal }),
    fetch("./service-health.json", { cache: "no-store", credentials: "same-origin", signal })
  ]);
  if (!catalogResponse.ok || !healthResponse.ok || signal.aborted) return;

  const [catalog, health] = await Promise.all([catalogResponse.json(), healthResponse.json()]);
  const profile = detectPerformanceProfile();
  const candidates = selectPublicServiceWarmupCandidates(catalog, health, profile);
  if (candidates.length === 0 || signal.aborted) return;

  const generatedAt = health && typeof health === "object" && typeof (health as HealthDocument).generatedAt === "string"
    ? (health as HealthDocument).generatedAt
    : "unknown";
  const fingerprint = `${generatedAt}|${candidates.map((candidate) => candidate.index).join(",")}`;
  try {
    if (sessionStorage.getItem(WARMUP_SESSION_KEY) === fingerprint) return;
  } catch {
    // Storage is optional; in-memory/network safety still applies without it.
  }

  const { concurrency } = serviceWarmupBudget(profile);
  await mapWithConcurrency(candidates, concurrency, (candidate) => warmCandidate(candidate, signal), signal);
  if (signal.aborted) return;

  try {
    sessionStorage.setItem(WARMUP_SESSION_KEY, fingerprint);
  } catch {
    // Do not fail warmup because private browsing blocks storage.
  }
}

async function warmCandidate(candidate: ServiceWarmupCandidate, parentSignal: AbortSignal): Promise<void> {
  if (parentSignal.aborted) return;
  const target = new URL(candidate.url);
  target.searchParams.set("f", "json");

  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  parentSignal.addEventListener("abort", abortFromParent, { once: true });
  const timer = window.setTimeout(() => controller.abort(), WARMUP_TIMEOUT_MS);
  try {
    const response = await fetch(target.toString(), {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      cache: "default",
      referrerPolicy: "no-referrer",
      headers: { Accept: "application/json,*/*" },
      signal: controller.signal
    });
    if (response.ok) await response.text();
  } catch {
    // Warmup is best-effort and must never affect layer availability/status.
  } finally {
    parentSignal.removeEventListener("abort", abortFromParent);
    window.clearTimeout(timer);
  }
}

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<void>,
  signal: AbortSignal
): Promise<void> {
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length && !signal.aborted) {
      const index = cursor++;
      const item = items[index];
      if (item !== undefined) await mapper(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, () => worker()));
}
