import type { PerformanceProfile, ServiceDefinition } from "../types";

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

const PRIORITY: Record<LayerLoadPriority, number> = {
  interactive: 0,
  retry: 1,
  restore: 2
};

/**
 * Bounds expensive remote Layer.load() work without changing ArcGIS retry or
 * failover semantics. Admission is weighted by the freshest sanitized/browser
 * health signals so slow or recently failing providers cannot consume the same
 * concurrency budget as healthy providers. Lane identifiers and health state
 * remain in memory and are never logged or persisted.
 */
export class LayerLoadScheduler {
  private readonly globalLimit: number;
  private readonly profile: PerformanceProfile;
  private readonly queue: InternalJob[] = [];
  private readonly activeByLane = new Map<string, number>();
  private active = 0;
  private activeCost = 0;
  private sequence = 0;
  private disposed = false;

  constructor(profile: PerformanceProfile) {
    this.profile = profile;
    this.globalLimit = globalLimitFor(profile);
  }

  schedule<T>(
    service: ServiceDefinition,
    priority: LayerLoadPriority,
    run: () => Promise<T>,
    cancelledValue: T
  ): Promise<T> {
    if (this.disposed) return Promise.resolve(cancelledValue);

    // A newer request for the same service supersedes only work that has not
    // started yet. Running ArcGIS work is allowed to finish and the runtime's
    // desiredVisibility guard decides whether its result is still relevant.
    this.cancel(service.id);

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

  /** Cancels a queued activation. In-flight ArcGIS work is not force-aborted. */
  cancel(serviceId: string): boolean {
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

  /** Resolves all queued work as superseded and prevents future scheduling. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const job of this.queue.splice(0)) job.resolve(job.cancelledValue);
  }

  snapshot(): { active: number; activeCost: number; queued: number; globalLimit: number } {
    return {
      active: this.active,
      activeCost: this.activeCost,
      queued: this.queue.length,
      globalLimit: this.globalLimit
    };
  }

  private drain(): void {
    if (this.disposed) return;

    while (this.activeCost < this.globalLimit && this.queue.length > 0) {
      const nextIndex = this.nextRunnableIndex();
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

  private nextRunnableIndex(): number {
    const candidates = this.queue
      .map((job, index) => ({ job, index }))
      .filter(({ job }) =>
        (this.activeByLane.get(job.lane) ?? 0) < job.laneLimit
        && this.activeCost + job.cost <= this.globalLimit
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
 * Eco mode always has a single unit so every job remains runnable.
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
