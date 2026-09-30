import type { PerformanceProfile, ServiceDefinition } from "../types";

export type LayerLoadPriority = "interactive" | "retry" | "restore";

type QueuedJob<T> = {
  key: string;
  lane: string;
  laneLimit: number;
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
 * failover semantics. Interactive user requests jump ahead of queued restore
 * work, while OGC services are serialized per host to avoid request bursts.
 * Lane identifiers live only in memory and are never logged or persisted.
 */
export class LayerLoadScheduler {
  private readonly globalLimit: number;
  private readonly profile: PerformanceProfile;
  private readonly queue: InternalJob[] = [];
  private readonly activeByLane = new Map<string, number>();
  private active = 0;
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
    return new Promise<T>((resolve, reject) => {
      const job: QueuedJob<T> = {
        key: service.id,
        lane,
        laneLimit,
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

  snapshot(): { active: number; queued: number; globalLimit: number } {
    return { active: this.active, queued: this.queue.length, globalLimit: this.globalLimit };
  }

  private drain(): void {
    if (this.disposed) return;

    while (this.active < this.globalLimit && this.queue.length > 0) {
      const nextIndex = this.nextRunnableIndex();
      if (nextIndex < 0) return;
      const [job] = this.queue.splice(nextIndex, 1);
      if (!job) return;

      this.active += 1;
      this.activeByLane.set(job.lane, (this.activeByLane.get(job.lane) ?? 0) + 1);

      void job.run()
        .then(job.resolve, job.reject)
        .finally(() => {
          this.active = Math.max(0, this.active - 1);
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
      .filter(({ job }) => (this.activeByLane.get(job.lane) ?? 0) < job.laneLimit)
      .sort((left, right) =>
        left.job.priority - right.job.priority || left.job.sequence - right.job.sequence
      );
    return candidates[0]?.index ?? -1;
  }
}

export function globalLimitFor(profile: PerformanceProfile): number {
  if (profile === "high") return 3;
  if (profile === "balanced") return 2;
  return 1;
}

export function laneLimitFor(profile: PerformanceProfile, service: Pick<ServiceDefinition, "kind">): number {
  if (service.kind === "WMS" || service.kind === "WFS") return 1;
  return profile === "high" ? 2 : 1;
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
