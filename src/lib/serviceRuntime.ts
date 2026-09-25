import type { ServiceDefinition, ServiceKind } from "../types";
import { isDirectTucbsUrl, isUnconfiguredTucbsUrl } from "./tucbsAccess";

export type ServiceFailureClass =
  | "configuration"
  | "authorization"
  | "network"
  | "timeout"
  | "server"
  | "format"
  | "unknown";

export interface ServiceRuntimePolicy {
  createTimeoutMs: number;
  loadTimeoutMs: number;
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryFormatErrors: boolean;
}

const KIND_POLICY: Record<ServiceKind, ServiceRuntimePolicy> = {
  WMS: { createTimeoutMs: 12_000, loadTimeoutMs: 35_000, maxAttempts: 3, baseDelayMs: 700, maxDelayMs: 4_500, retryFormatErrors: true },
  WFS: { createTimeoutMs: 12_000, loadTimeoutMs: 40_000, maxAttempts: 3, baseDelayMs: 800, maxDelayMs: 5_000, retryFormatErrors: true },
  MapServer: { createTimeoutMs: 10_000, loadTimeoutMs: 30_000, maxAttempts: 3, baseDelayMs: 650, maxDelayMs: 4_000, retryFormatErrors: false },
  FeatureServer: { createTimeoutMs: 10_000, loadTimeoutMs: 25_000, maxAttempts: 2, baseDelayMs: 600, maxDelayMs: 3_000, retryFormatErrors: false },
  SceneServer: { createTimeoutMs: 12_000, loadTimeoutMs: 35_000, maxAttempts: 2, baseDelayMs: 850, maxDelayMs: 4_500, retryFormatErrors: false }
};

const MAX_LOAD_TIMEOUT_MS = 60_000;

export function serviceRuntimePolicy(
  service: Pick<ServiceDefinition, "id" | "kind" | "url" | "verificationLatencyMs" | "failureCount" | "alternateEndpoints">
): ServiceRuntimePolicy {
  const base = KIND_POLICY[service.kind];
  const measured = service.verificationLatencyMs;
  const measuredBudget = Number.isFinite(measured) && measured! > 0
    ? Math.round(measured! * 4 + 5_000)
    : 0;

  let loadTimeoutMs = Math.max(base.loadTimeoutMs, measuredBudget);
  let maxAttempts = base.maxAttempts;

  if (isDirectTucbsUrl(service.url)) {
    loadTimeoutMs = Math.max(loadTimeoutMs, 45_000);
    maxAttempts = Math.max(maxAttempts, 3);
  }

  if ((service.alternateEndpoints?.length ?? 0) > 0) {
    maxAttempts = Math.max(maxAttempts, Math.min(4, service.alternateEndpoints!.length + 2));
  }

  if ((service.failureCount ?? 0) >= 3) {
    maxAttempts = Math.min(maxAttempts, 2);
  }

  return {
    ...base,
    loadTimeoutMs: Math.min(MAX_LOAD_TIMEOUT_MS, loadTimeoutMs),
    maxAttempts
  };
}

export function classifyServiceError(error: unknown): ServiceFailureClass {
  const text = errorText(error);
  if (/tucbs yetkili servis adresi|geçersiz|invalid url|unsupported|desteklenmeyen|configuration/i.test(text)) {
    return "configuration";
  }
  if (/\b401\b|\b403\b|unauthor|forbidden|yetkilend|kimlik doğrula|permission|access denied/i.test(text)) {
    return "authorization";
  }
  if (/timeout|time.?out|zaman aşım|aborterror|aborted/i.test(text)) {
    return "timeout";
  }
  if (/\b5\d\d\b|server error|bad gateway|gateway timeout|service unavailable|internal server/i.test(text)) {
    return "server";
  }
  if (/cors|cross-origin|failed to fetch|networkerror|network request|fetch failed|connection|econn|enotfound|dns|offline/i.test(text)) {
    return "network";
  }
  if (/xml|json|capabilit|feature type|unsupported output|parse|format/i.test(text)) {
    return "format";
  }
  return "unknown";
}

export function shouldRetryServiceError(
  error: unknown,
  attempt: number,
  policy: Pick<ServiceRuntimePolicy, "maxAttempts" | "retryFormatErrors">
): boolean {
  if (attempt >= policy.maxAttempts) return false;
  const failure = classifyServiceError(error);
  if (failure === "configuration" || failure === "authorization") return false;
  if (failure === "format") return policy.retryFormatErrors;
  return failure === "network" || failure === "timeout" || failure === "server" || failure === "unknown";
}

export function serviceRetryDelayMs(
  serviceId: string,
  attempt: number,
  policy: Pick<ServiceRuntimePolicy, "baseDelayMs" | "maxDelayMs">
): number {
  const exponential = policy.baseDelayMs * 2 ** Math.max(0, attempt - 1);
  const jitter = deterministicJitter(serviceId, attempt);
  return Math.min(policy.maxDelayMs, Math.round(exponential * (0.82 + jitter * 0.36)));
}

export function friendlyServiceError(
  service: Pick<ServiceDefinition, "url" | "alternateEndpoints">,
  error: unknown
): string {
  if (isUnconfiguredTucbsUrl(service.url)) {
    return "TUCBS yetkili servis adresi bu tarayıcıda tanımlı değil.";
  }

  const failure = classifyServiceError(error);
  const failoverSuffix = (service.alternateEndpoints?.length ?? 0) > 0
    ? " Eşdeğer OGC taşıma seçeneği de denendi."
    : "";
  if (failure === "authorization") {
    return isDirectTucbsUrl(service.url)
      ? "TUCBS servisi isteği reddetti. Onaylı dış IP ve güncel yetkili servis adresini kontrol edin."
      : "Servis kimlik doğrulaması veya yetkilendirme istiyor.";
  }
  if (failure === "timeout") return `Servis yanıt süresini aştı; otomatik yeniden denemeler tamamlandı.${failoverSuffix}`;
  if (failure === "network") return `Servise ağ üzerinden erişilemedi. Bağlantı/CORS durumu kontrol edilmeli.${failoverSuffix}`;
  if (failure === "server") return `Servis geçici sunucu hatası döndürdü; otomatik yeniden denemeler tamamlandı.${failoverSuffix}`;
  if (failure === "format") return `Servis yanıtı beklenen biçimde değil.${failoverSuffix}`;

  const text = errorText(error).trim();
  if (!text) return `Servis yüklenemedi.${failoverSuffix}`;
  return text.length > 190 ? `${text.slice(0, 187)}…` : text;
}

export async function withRuntimeTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
  onTimeout?: () => void
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          try { onTimeout?.(); } catch { /* cancellation is best-effort */ }
          reject(new Error(`${label} zaman aşımına uğradı (${Math.round(timeoutMs / 1000)} sn).`));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function sleepRuntime(delayMs: number): Promise<void> {
  if (delayMs <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

function deterministicJitter(serviceId: string, attempt: number): number {
  let hash = 0x811c9dc5 ^ attempt;
  for (let index = 0; index < serviceId.length; index += 1) {
    hash ^= serviceId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0xffffffff;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    try { return JSON.stringify(error); } catch { return ""; }
  }
  return "";
}
