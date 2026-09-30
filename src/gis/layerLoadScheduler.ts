import type { PerformanceProfile, ServiceDefinition } from "../types";
import {
  browserNetworkQuality,
  networkConcurrencyCap,
  subscribeNetworkQualityChanges,
  type NetworkQualitySnapshot
} from "../platform/networkQuality";
import { classifyServiceError, type ServiceFailureClass } from "../lib/serviceRuntime";
import { cancelAllTrackedLayerLoads, cancelTrackedLayerLoad } from "./layerLoadRegistry";

export type LayerLoadPriority = "interactive" | "retry" | "restore";

type LoadHealthSignal = Pick<ServiceDefinition, "kind"> & Partial<Pick<
  ServiceDefinition,
  "availability" | "verificationLatencyMs" | "latencyMs" | "failureCount" | "verificationStale"
>>;

type LayerLoadOutcomeLike = {
  ok?: boolean;
  superseded?: boolean;
  durationMs?: number;
  failureClass?: ServiceFailureClass;
  error?: string;
};

type LaneRuntimeHealth = {
  transientFailures: number;
  openUntil: number;
  halfOpenProbeActive: boolean;
  successfulDurations: number[];
};

type QueuedJob<T> = {
  key: string;
  lane: string;
  laneLimit: number;
  cost: number;
  healthRank: number;
  priority: number;
  sequence: number;
  run: () => Promise<T>;
  cancelledValue: T;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  cancelRequested: boolean;
};

type InternalJob = QueuedJob<unknown>;
type NetworkReader = () => NetworkQualitySnapshot;
type NetworkSubscriber = (listener: () => void) => () => void;
type Clock = () => number;

const PRIORITY: Record<LayerLoadPriority, number> = {
  interactive: 0,
  retry: 1,
  restore: 2
};

const PROVIDER_FAILURE_THRESHOLD = 2;
const PROVIDER_SLOW_SAMPLE_LIMIT = 6;
const PROVIDER_SLOW_MEDIAN_MS = 6_000;
const PROVIDER_MAX_COOLDOWN_MS = 24_000;
const TRANSIENT_PROVIDER_FAILURES = new Set<ServiceFailureClass>(["network", "timeout", "server"]);

/**
 * Bounds expensive remote Layer.load() work without changing ArcGIS retry or
 * failover semantics. Admission is weighted by the freshest sanitized/browser
 * health signals and coarse local connection hints so slow providers or weak
 * networks cannot receive the same request pressure as healthy conditions.
 *
 * v38 also feeds real in-session outcomes back into provider-local lanes. Two
 * consecutive network/timeout/5xx failures temporarily open only that origin's
 * circuit while unrelated providers keep flowing. A single half-open probe is
 * admitted after the cooldown. Authorization/configuration/format failures are
 * intentionally not generalized to the whole provider. No endpoint path,
 * query string, credential or circuit state is persisted.
 */
export class LayerLoadScheduler {
  private readonly profileLimit: number;
  private readonly profile: PerformanceProfile;
  private readonly readNetwork: NetworkReader;
  private readonly unsubscribeNetwork: () => void;
  private readonly now: Clock;
  private readonly queue: InternalJob[] = [];
  private readonly activeByLane = new Map<string, number>();
  private readonly activeJobsByKey = new Map<string, InternalJob>();
  private readonly laneHealth = new Map<string, LaneRuntimeHealth>();
  private active = 0;
  private activeCost = 0;
  private sequence = 0;
  private disposed = false;
  private circuitWakeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    profile: PerformanceProfile,
    readNetwork: NetworkReader = browserNetworkQuality,
    subscribeNetwork: NetworkSubscriber = subscribeNetworkQualityChanges,
    now: Clock = Date.now
  ) {
    this.profile = profile;
    this.profileLimit = globalLimitFor(profile);
    this.readNetwork = readNetwork;
    this.now = now;

    let unsubscribe: () => void = () => undefined;
    try {
      unsubscribe = subscribeNetwork(() => this.drain());
    } catch {
      // Browser connection hints are optional. Scheduling remains functional
      // with request/completion-driven draining if subscription is unavailable.
    }
    this.unsubscribeNetwork = unsubscribe;
  }

  schedule<T>(
    service: ServiceDefinition,
    priority: LayerLoadPriority,
    run: () => Promise<T>,
    cancelledValue: T
  ): Promise<T> {
    if (this.disposed) return Promise.resolve(cancelledValue);

    // A newer request for the same service supersedes queued work only. Do not
    // cancel an already-running visible layer merely because a duplicate UI
    // request arrived; explicit hide/dispose actions own active cancellation.
    this.cancelQueued(service.id);

    const lane = loadLane(service);
    const laneLimit = laneLimitFor(this.profile, service);
    const cost = loadCostFor(this.profile, service);
    const healthRank = loadHealthRank(service);
    return new Promise<T>((resolve, reject) => {
      const job: QueuedJob<T> = {
        key: service.id,
        lane,
        laneLimit,
        cost,
        healthRank,
        priority: PRIORITY[priority],
        sequence: this.sequence++,
        run,
        cancelledValue,
        resolve,
        reject,
        cancelRequested: false
      };
      this.queue.push(job as InternalJob);
      this.drain();
    });
  }

  /**
   * Cancels queued work and asks the newest tracked ArcGIS Layer for this
   * service to cancel its in-flight load. Explicit user/runtime cancellation is
   * marked on the active scheduler job so the resulting Abort/timeout signal is
   * never mistaken for provider instability.
   */
  cancel(serviceId: string): boolean {
    const queued = this.cancelQueued(serviceId);
    const activeJob = this.activeJobsByKey.get(serviceId);
    if (activeJob) activeJob.cancelRequested = true;
    const active = cancelTrackedLayerLoad(serviceId);
    return queued || Boolean(activeJob) || active;
  }

  /** Resolves queued work as superseded and cancels tracked active ArcGIS loads. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.unsubscribeNetwork();
    } catch {
      // Optional browser event cleanup must never block scheduler disposal.
    }
    if (this.circuitWakeTimer !== undefined) {
      clearTimeout(this.circuitWakeTimer);
      this.circuitWakeTimer = undefined;
    }
    for (const job of this.queue.splice(0)) job.resolve(job.cancelledValue);
    for (const job of this.activeJobsByKey.values()) job.cancelRequested = true;
    cancelAllTrackedLayerLoads();
  }

  snapshot(): {
    active: number;
    activeCost: number;
    queued: number;
    globalLimit: number;
    effectiveLimit: number;
    providerCircuitsOpen: number;
    providerHalfOpenProbes: number;
  } {
    const now = this.now();
    let providerCircuitsOpen = 0;
    let providerHalfOpenProbes = 0;
    for (const health of this.laneHealth.values()) {
      if (health.openUntil > now) providerCircuitsOpen += 1;
      if (health.halfOpenProbeActive) providerHalfOpenProbes += 1;
    }
    return {
      active: this.active,
      activeCost: this.activeCost,
      queued: this.queue.length,
      globalLimit: this.profileLimit,
      effectiveLimit: this.effectiveGlobalLimit(),
      providerCircuitsOpen,
      providerHalfOpenProbes
    };
  }

  private cancelQueued(serviceId: string): boolean {
    let cancelled = false;
    for (let index = this.queue.length - 1; index >= 0; index -= 1) {
      const job = this.queue[index];
      if (!job || job.key !== serviceId) continue;
      this.queue.splice(index, 1);
      job.resolve(job.cancelledValue);
      cancelled = true;
    }
    return cancelled;
  }

  private effectiveGlobalLimit(): number {
    try {
      return networkConcurrencyCap(this.profileLimit, this.readNetwork());
    } catch {
      return this.profileLimit;
    }
  }

  private drain(): void {
    if (this.disposed) return;

    const effectiveLimit = this.effectiveGlobalLimit();
    if (effectiveLimit <= 0) return;

    while (this.activeCost < effectiveLimit && this.queue.length > 0) {
      const nextIndex = this.nextRunnableIndex(effectiveLimit);
      if (nextIndex < 0) {
        this.armCircuitWake();
        return;
      }
      const [job] = this.queue.splice(nextIndex, 1);
      if (!job) return;

      this.markHalfOpenProbe(job.lane);
      this.active += 1;
      this.activeCost += job.cost;
      this.activeByLane.set(job.lane, (this.activeByLane.get(job.lane) ?? 0) + 1);
      this.activeJobsByKey.set(job.key, job);
      const startedAt = this.now();

      void job.run()
        .then(
          (value) => {
            this.observeProviderOutcome(job, value, undefined, Math.max(0, this.now() - startedAt));
            job.resolve(value);
          },
          (error) => {
            this.observeProviderOutcome(job, undefined, error, Math.max(0, this.now() - startedAt));
            job.reject(error);
          }
        )
        .finally(() => {
          this.active = Math.max(0, this.active - 1);
          this.activeCost = Math.max(0, this.activeCost - job.cost);
          const laneActive = Math.max(0, (this.activeByLane.get(job.lane) ?? 1) - 1);
          if (laneActive === 0) this.activeByLane.delete(job.lane);
          else this.activeByLane.set(job.lane, laneActive);
          if (this.activeJobsByKey.get(job.key) === job) this.activeJobsByKey.delete(job.key);
          this.drain();
        });
    }
  }

  private nextRunnableIndex(effectiveLimit: number): number {
    const now = this.now();
    const candidates = this.queue
      .map((job, index) => ({ job, index }))
      .filter(({ job }) =>
        this.providerCanRun(job.lane, now)
        && (this.activeByLane.get(job.lane) ?? 0) < this.effectiveLaneLimit(job)
        && this.activeCost + job.cost <= effectiveLimit
      )
      .sort((left, right) => {
        const priorityDelta = left.job.priority - right.job.priority;
        if (priorityDelta !== 0) return priorityDelta;

        // Preserve exact click/retry order. Only background restore work is
        // health-ranked so a risky provider cannot delay known-fast layers.
        if (left.job.priority === PRIORITY.restore) {
          const healthDelta = this.effectiveHealthRank(left.job) - this.effectiveHealthRank(right.job);
          if (healthDelta !== 0) return healthDelta;
        }
        return left.job.sequence - right.job.sequence;
      });
    return candidates[0]?.index ?? -1;
  }

  private effectiveLaneLimit(job: InternalJob): number {
    const health = this.laneHealth.get(job.lane);
    if (!health) return job.laneLimit;
    if (health.transientFailures > 0) return 1;
    if (median(health.successfulDurations) >= PROVIDER_SLOW_MEDIAN_MS) return 1;
    return job.laneLimit;
  }

  private effectiveHealthRank(job: InternalJob): number {
    const health = this.laneHealth.get(job.lane);
    if (!health) return job.healthRank;
    const transientPenalty = Math.min(4, health.transientFailures * 2);
    const slowPenalty = median(health.successfulDurations) >= PROVIDER_SLOW_MEDIAN_MS ? 2 : 0;
    return job.healthRank + transientPenalty + slowPenalty;
  }

  private providerCanRun(lane: string, now: number): boolean {
    const health = this.laneHealth.get(lane);
    if (!health) return true;
    if (health.openUntil > now) return false;
    if (health.transientFailures >= PROVIDER_FAILURE_THRESHOLD) {
      return !health.halfOpenProbeActive && (this.activeByLane.get(lane) ?? 0) === 0;
    }
    return true;
  }

  private markHalfOpenProbe(lane: string): void {
    const health = this.laneHealth.get(lane);
    if (!health) return;
    if (health.transientFailures < PROVIDER_FAILURE_THRESHOLD || health.openUntil > this.now()) return;
    health.halfOpenProbeActive = true;
  }

  private observeProviderOutcome(
    job: InternalJob,
    value: unknown,
    error: unknown,
    elapsedMs: number
  ): void {
    if (job.cancelRequested) {
      this.releaseHalfOpenProbe(job.lane);
      return;
    }

    const outcome = layerLoadOutcome(value);
    if (outcome?.superseded) {
      this.releaseHalfOpenProbe(job.lane);
      return;
    }

    const durationMs = finiteDuration(outcome?.durationMs) ?? finiteDuration(elapsedMs);
    const failureClass = error !== undefined
      ? classifyServiceError(error)
      : outcome?.ok === false
        ? outcome.failureClass ?? classifyServiceError(outcome.error ?? "")
        : undefined;

    if (error === undefined && outcome?.ok !== false) {
      this.markProviderResponsive(job.lane, durationMs);
      return;
    }

    if (failureClass && TRANSIENT_PROVIDER_FAILURES.has(failureClass)) {
      let online = true;
      try { online = this.readNetwork().online; } catch { /* optional browser hint */ }
      if (!online) {
        this.releaseHalfOpenProbe(job.lane);
        return;
      }
      this.markProviderTransientFailure(job.lane);
      return;
    }

    // Authorization/configuration/format errors are service-specific evidence,
    // but they prove the provider answered. Do not poison sibling layers.
    this.markProviderResponsive(job.lane, durationMs);
  }

  private markProviderResponsive(lane: string, durationMs?: number): void {
    const health = this.laneHealth.get(lane) ?? createLaneHealth();
    health.transientFailures = 0;
    health.openUntil = 0;
    health.halfOpenProbeActive = false;
    if (durationMs !== undefined && durationMs > 0) {
      health.successfulDurations.push(durationMs);
      if (health.successfulDurations.length > PROVIDER_SLOW_SAMPLE_LIMIT) {
        health.successfulDurations.splice(0, health.successfulDurations.length - PROVIDER_SLOW_SAMPLE_LIMIT);
      }
    }
    this.laneHealth.set(lane, health);
  }

  private markProviderTransientFailure(lane: string): void {
    const health = this.laneHealth.get(lane) ?? createLaneHealth();
    health.transientFailures += 1;
    health.halfOpenProbeActive = false;
    if (health.transientFailures >= PROVIDER_FAILURE_THRESHOLD) {
      health.openUntil = this.now() + providerCircuitCooldownMs(health.transientFailures);
    }
    this.laneHealth.set(lane, health);
    this.armCircuitWake();
  }

  private releaseHalfOpenProbe(lane: string): void {
    const health = this.laneHealth.get(lane);
    if (health) health.halfOpenProbeActive = false;
  }

  private armCircuitWake(): void {
    if (this.disposed || this.queue.length === 0) return;
    const now = this.now();
    let earliest = Number.POSITIVE_INFINITY;
    for (const job of this.queue) {
      const openUntil = this.laneHealth.get(job.lane)?.openUntil ?? 0;
      if (openUntil > now && openUntil < earliest) earliest = openUntil;
    }
    if (!Number.isFinite(earliest)) return;

    if (this.circuitWakeTimer !== undefined) clearTimeout(this.circuitWakeTimer);
    this.circuitWakeTimer = setTimeout(() => {
      this.circuitWakeTimer = undefined;
      this.drain();
    }, Math.max(1, earliest - now + 1));
  }
}

export function globalLimitFor(profile: PerformanceProfile): number {
  if (profile === "high") return 3;
  if (profile === "balanced") return 2;
  return 1;
}

/**
 * Provider-local concurrency. OGC stays serialized. High-end clients may use
 * two ArcGIS loads per host only while that service is currently healthy.
 */
export function laneLimitFor(profile: PerformanceProfile, service: LoadHealthSignal): number {
  if (service.kind === "WMS" || service.kind === "WFS") return 1;
  if (profile !== "high") return 1;
  return loadHealthRank(service) >= 2 ? 1 : 2;
}

/**
 * Weighted global admission cost. A risky/slow job consumes two budget units
 * on balanced/high profiles, automatically reducing concurrent upstream load.
 * Eco mode always has a single unit so every job remains runnable when online.
 */
export function loadCostFor(profile: PerformanceProfile, service: LoadHealthSignal): number {
  const limit = globalLimitFor(profile);
  if (limit === 1) return 1;
  return Math.min(limit, loadHealthRank(service) >= 2 ? 2 : 1);
}

/**
 * Lower is healthier. Stale verification is deliberately treated as unknown
 * rather than as a hard negative because browser-local success is stronger
 * evidence than an old public-runner result.
 */
export function loadHealthRank(service: LoadHealthSignal): number {
  let rank = 0;

  if (service.verificationStale) {
    rank += 1;
  } else if (service.availability === "unavailable") {
    rank += 3;
  } else if (service.availability === "degraded") {
    rank += 2;
  } else if (service.availability === "unknown") {
    rank += 1;
  }

  const latency = measuredLatency(service);
  if (latency >= 8_000) rank += 2;
  else if (latency >= 3_500) rank += 1;

  const failures = Math.max(0, service.failureCount ?? 0);
  if (failures >= 2) rank += 2;
  else if (failures === 1) rank += 1;

  return Math.min(6, rank);
}

/** Provider-local transient failure cooldown with bounded exponential backoff. */
export function providerCircuitCooldownMs(transientFailures: number): number {
  if (transientFailures < PROVIDER_FAILURE_THRESHOLD) return 0;
  const exponent = Math.max(0, transientFailures - PROVIDER_FAILURE_THRESHOLD);
  return Math.min(PROVIDER_MAX_COOLDOWN_MS, 4_000 * 2 ** exponent);
}

function measuredLatency(service: LoadHealthSignal): number {
  const samples = [service.verificationLatencyMs, service.latencyMs]
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
  return samples.length ? Math.max(...samples) : 0;
}

function loadLane(service: Pick<ServiceDefinition, "kind" | "url">): string {
  try {
    const parsed = new URL(service.url, "https://local.invalid");
    if (parsed.hostname && parsed.hostname !== "local.invalid") return `${parsed.protocol}//${parsed.host}`;
  } catch {
    // Fall through to a non-sensitive kind lane for malformed/sentinel URLs.
  }
  return `kind:${service.kind}`;
}

function createLaneHealth(): LaneRuntimeHealth {
  return {
    transientFailures: 0,
    openUntil: 0,
    halfOpenProbeActive: false,
    successfulDurations: []
  };
}

function layerLoadOutcome(value: unknown): LayerLoadOutcomeLike | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as LayerLoadOutcomeLike;
  if (typeof candidate.ok !== "boolean" && candidate.superseded !== true) return undefined;
  return candidate;
}

function finiteDuration(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}
