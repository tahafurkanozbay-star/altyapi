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
  enqueuedAt: number;
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

const RETRY_PROMOTION_MS = 15_000;
const RESTORE_RETRY_PROMOTION_MS = 12_000;
const RESTORE_INTERACTIVE_PROMOTION_MS = 30_000;
const PROVIDER_FAILURE_THRESHOLD = 2;
const PROVIDER_SLOW_SAMPLE_LIMIT = 6;
const PROVIDER_SLOW_MEDIAN_MS = 6_000;
const PROVIDER_MAX_COOLDOWN_MS = 24_000;
const TRANSIENT_PROVIDER_FAILURES = new Set<ServiceFailureClass>(["network", "timeout", "server"]);

/**
 * Bounds expensive remote Layer.load() work without changing ArcGIS retry or
 * failover semantics. Admission is weighted by sanitized/browser health signals,
 * live network capacity and provider-local runtime feedback.
 *
 * v39 keeps v38 provider circuits while making queue admission starvation-safe:
 * long-waiting retry/restore jobs age upward, the oldest eligible request owns a
 * half-open provider probe, and a risky two-unit job is normalized to the current
 * one-unit network budget instead of becoming permanently unrunnable. All queue
 * and provider state remains memory-only and contains no endpoint paths, query
 * strings, TUCBS tokens or credentials.
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
        enqueuedAt: this.now(),
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
    providerHalfOpenReady: number;
    oldestQueuedMs: number;
    agedQueued: number;
    pausedByNetwork: boolean;
  } {
    const now = this.now();
    let providerCircuitsOpen = 0;
    let providerHalfOpenProbes = 0;
    for (const health of this.laneHealth.values()) {
      if (health.openUntil > now) providerCircuitsOpen += 1;
      if (health.halfOpenProbeActive) providerHalfOpenProbes += 1;
    }
    const effectiveLimit = this.effectiveGlobalLimit();
    const oldestQueuedAt = this.queue.reduce<number | undefined>(
      (oldest, job) => oldest === undefined ? job.enqueuedAt : Math.min(oldest, job.enqueuedAt),
      undefined
    );
    const agedQueued = this.queue.filter((job) => agedPriority(job, now) < job.priority).length;
    const providerHalfOpenReady = this.queue.filter((job) => this.isHalfOpenProbeCandidate(job, now)).length;
    return {
      active: this.active,
      activeCost: this.activeCost,
      queued: this.queue.length,
      globalLimit: this.profileLimit,
      effectiveLimit,
      providerCircuitsOpen,
      providerHalfOpenProbes,
      providerHalfOpenReady,
      oldestQueuedMs: oldestQueuedAt === undefined ? 0 : Math.max(0, Math.round(now - oldestQueuedAt)),
      agedQueued,
      pausedByNetwork: effectiveLimit <= 0
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
      const admittedCost = this.admissionCost(job, effectiveLimit);
      this.active += 1;
      this.activeCost += admittedCost;
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
          this.activeCost = Math.max(0, this.activeCost - admittedCost);
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
      .map((job, index) => ({
        job,
        index,
        effectivePriority: this.effectiveQueuePriority(job, now),
        halfOpenRecovery: this.isHalfOpenProbeCandidate(job, now)
      }))
      .filter(({ job }) =>
        this.providerCanRun(job, now)
        && (this.activeByLane.get(job.lane) ?? 0) < this.effectiveLaneLimit(job)
        && this.activeCost + this.admissionCost(job, effectiveLimit) <= effectiveLimit
      )
      .sort((left, right) => {
        const priorityDelta = left.effectivePriority - right.effectivePriority;
        if (priorityDelta !== 0) return priorityDelta;

        // When equally urgent, let a provider recovery probe go first so the
        // entire sibling lane can resume. It never outranks a fresh interactive
        // request because half-open probes are capped at retry priority.
        if (left.halfOpenRecovery !== right.halfOpenRecovery) {
          return left.halfOpenRecovery ? -1 : 1;
        }

        // Health ranking remains useful only for genuinely background restores.
        // Once aging promotes a job, FIFO wins so a degraded provider cannot be
        // postponed forever by a stream of newly discovered healthy restores.
        if (
          left.effectivePriority === PRIORITY.restore
          && left.job.priority === PRIORITY.restore
          && right.job.priority === PRIORITY.restore
        ) {
          const healthDelta = this.effectiveHealthRank(left.job) - this.effectiveHealthRank(right.job);
          if (healthDelta !== 0) return healthDelta;
        }
        return left.job.sequence - right.job.sequence;
      });
    return candidates[0]?.index ?? -1;
  }

  private admissionCost(job: InternalJob, effectiveLimit: number): number {
    // Health weighting should reduce concurrency, never make a service impossible
    // to start. If browser/network pressure lowers the live budget to one unit,
    // a two-unit risky job runs alone instead of remaining queued indefinitely.
    return Math.max(1, Math.min(job.cost, Math.max(1, Math.floor(effectiveLimit))));
  }

  private effectiveQueuePriority(job: InternalJob, now: number): number {
    const aged = agedPriority(job, now);
    return this.isHalfOpenProbeCandidate(job, now)
      ? Math.min(aged, PRIORITY.retry)
      : aged;
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

  private providerCanRun(job: InternalJob, now: number): boolean {
    const health = this.laneHealth.get(job.lane);
    if (!health) return true;
    if (health.openUntil > now) return false;
    if (health.transientFailures >= PROVIDER_FAILURE_THRESHOLD) {
      return this.isHalfOpenProbeCandidate(job, now);
    }
    return true;
  }

  private isHalfOpenProbeCandidate(job: InternalJob, now: number): boolean {
    const health = this.laneHealth.get(job.lane);
    if (!health) return false;
    if (health.transientFailures < PROVIDER_FAILURE_THRESHOLD) return false;
    if (health.openUntil > now || health.halfOpenProbeActive) return false;
    if ((this.activeByLane.get(job.lane) ?? 0) > 0) return false;

    // The oldest queued sibling owns the half-open probe. A newer click on the
    // same provider must not leapfrog older recovery work after cooldown.
    for (const queued of this.queue) {
      if (queued.lane === job.lane && queued.sequence < job.sequence) return false;
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
 * When live network pressure exposes only one unit, v39 normalizes that job to
 * one unit so it is serialized rather than permanently blocked.
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

/**
 * Priority aging prevents bounded background/recovery work from starving under
 * sustained interaction. Fresh interactive requests remain priority 0; retries
 * promote after 15 s; restores promote to retry at 12 s and to interactive at
 * 30 s. Once promoted, FIFO order takes precedence over health ranking.
 */
export function agedPriority(
  job: { priority: number; enqueuedAt: number },
  now: number
): number {
  const waitedMs = Math.max(0, now - job.enqueuedAt);
  if (job.priority <= PRIORITY.interactive) return PRIORITY.interactive;
  if (job.priority === PRIORITY.retry) {
    return waitedMs >= RETRY_PROMOTION_MS ? PRIORITY.interactive : PRIORITY.retry;
  }
  if (waitedMs >= RESTORE_INTERACTIVE_PROMOTION_MS) return PRIORITY.interactive;
  if (waitedMs >= RESTORE_RETRY_PROMOTION_MS) return PRIORITY.retry;
  return PRIORITY.restore;
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
