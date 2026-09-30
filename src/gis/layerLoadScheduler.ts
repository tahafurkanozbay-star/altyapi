import type { PerformanceProfile, ServiceDefinition } from "../types";
import {
  browserNetworkQuality,
  networkConcurrencyCap,
  subscribeNetworkQualityChanges,
  type NetworkQualitySnapshot
} from "../platform/networkQuality";
import { cancelAllTrackedLayerLoads, cancelTrackedLayerLoad } from "./layerLoadRegistry";

export type LayerLoadPriority = "interactive" | "retry" | "restore";

type LoadHealthSignal = Pick<ServiceDefinition, "kind"> & Partial<Pick<
  ServiceDefinition,
  "availability" | "verificationLatencyMs" | "latencyMs" | "failureCount" | "verificationStale"
>>;

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
};

type InternalJob = QueuedJob<unknown>;
type NetworkReader = () => NetworkQualitySnapshot;
type NetworkSubscriber = (listener: () => void) => () => void;

const PRIORITY: Record<LayerLoadPriority, number> = {
  interactive: 0,
  retry: 1,
  restore: 2
};

/**
 * Bounds expensive remote Layer.load() work without changing ArcGIS retry or
 * failover semantics. Admission is weighted by the freshest sanitized/browser
 * health signals and coarse local connection hints so slow providers or weak
 * networks cannot receive the same request pressure as healthy conditions.
 * Network/visibility changes wake the queue immediately; no signal is persisted
 * or transmitted.
 */
export class LayerLoadScheduler {
  private readonly profileLimit: number;
  private readonly profile: PerformanceProfile;
  private readonly readNetwork: NetworkReader;
  private readonly unsubscribeNetwork: () => void;
  private readonly queue: InternalJob[] = [];
  private readonly activeByLane = new Map<string, number>();
  private active = 0;
  private activeCost = 0;
  private sequence = 0;
  private disposed = false;

  constructor(
    profile: PerformanceProfile,
    readNetwork: NetworkReader = browserNetworkQuality,
    subscribeNetwork: NetworkSubscriber = subscribeNetworkQualityChanges
  ) {
    this.profile = profile;
    this.profileLimit = globalLimitFor(profile);
    this.readNetwork = readNetwork;

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
        reject
      };
      this.queue.push(job as InternalJob);
      this.drain();
    });
  }

  /**
   * Cancels queued work and asks the newest tracked ArcGIS Layer for this
   * service to cancel its in-flight load. Late resolutions remain harmless
   * because ArcGISRuntime still enforces desiredVisibility before attachment.
   */
  cancel(serviceId: string): boolean {
    const queued = this.cancelQueued(serviceId);
    const active = cancelTrackedLayerLoad(serviceId);
    return queued || active;
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
    for (const job of this.queue.splice(0)) job.resolve(job.cancelledValue);
    cancelAllTrackedLayerLoads();
  }

  snapshot(): {
    active: number;
    activeCost: number;
    queued: number;
    globalLimit: number;
    effectiveLimit: number;
  } {
    return {
      active: this.active,
      activeCost: this.activeCost,
      queued: this.queue.length,
      globalLimit: this.profileLimit,
      effectiveLimit: this.effectiveGlobalLimit()
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
      if (nextIndex < 0) return;
      const [job] = this.queue.splice(nextIndex, 1);
      if (!job) return;

      this.active += 1;
      this.activeCost += job.cost;
      this.activeByLane.set(job.lane, (this.activeByLane.get(job.lane) ?? 0) + 1);

      void job.run()
        .then(job.resolve, job.reject)
        .finally(() => {
          this.active = Math.max(0, this.active - 1);
          this.activeCost = Math.max(0, this.activeCost - job.cost);
          const laneActive = Math.max(0, (this.activeByLane.get(job.lane) ?? 1) - 1);
          if (laneActive === 0) this.activeByLane.delete(job.lane);
          else this.activeByLane.set(job.lane, laneActive);
          this.drain();
        });
    }
  }

  private nextRunnableIndex(effectiveLimit: number): number {
    const candidates = this.queue
      .map((job, index) => ({ job, index }))
      .filter(({ job }) =>
        (this.activeByLane.get(job.lane) ?? 0) < job.laneLimit
        && this.activeCost + job.cost <= effectiveLimit
      )
      .sort((left, right) => {
        const priorityDelta = left.job.priority - right.job.priority;
        if (priorityDelta !== 0) return priorityDelta;

        // Preserve exact click/retry order. Only background restore work is
        // health-ranked so a risky provider cannot delay known-fast layers.
        if (left.job.priority === PRIORITY.restore) {
          const healthDelta = left.job.healthRank - right.job.healthRank;
          if (healthDelta !== 0) return healthDelta;
        }
        return left.job.sequence - right.job.sequence;
      });
    return candidates[0]?.index ?? -1;
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
