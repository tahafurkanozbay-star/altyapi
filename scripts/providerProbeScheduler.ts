export interface ProviderProbeSchedulerOptions<T> {
  globalLimit: number;
  laneFor: (item: T) => string;
  laneLimitFor: (item: T) => number;
}

/**
 * Runs remote observability work with a global cap and a separate cap per
 * provider lane. Results preserve input order even though independent lanes can
 * run concurrently.
 */
export async function mapWithProviderConcurrency<T, R>(
  items: readonly T[],
  options: ProviderProbeSchedulerOptions<T>,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];

  const globalLimit = positiveInteger(options.globalLimit, 1);
  const pending = items.map((item, index) => ({
    item,
    index,
    lane: options.laneFor(item),
    laneLimit: positiveInteger(options.laneLimitFor(item), 1)
  }));
  const results: Array<R | undefined> = new Array(items.length);
  const activeByLane = new Map<string, number>();

  return new Promise<R[]>((resolve, reject) => {
    let active = 0;
    let completed = 0;
    let settled = false;

    const drain = (): void => {
      if (settled) return;
      if (completed === items.length) {
        settled = true;
        resolve(results as R[]);
        return;
      }

      let started = false;
      while (active < globalLimit) {
        const jobIndex = pending.findIndex(
          (job) => (activeByLane.get(job.lane) ?? 0) < job.laneLimit
        );
        if (jobIndex < 0) break;

        const [job] = pending.splice(jobIndex, 1);
        if (!job) break;

        started = true;
        active += 1;
        activeByLane.set(job.lane, (activeByLane.get(job.lane) ?? 0) + 1);

        void Promise.resolve()
          .then(() => mapper(job.item, job.index))
          .then((result) => {
            results[job.index] = result;
            completed += 1;
          })
          .catch((error: unknown) => {
            if (settled) return;
            settled = true;
            reject(error);
          })
          .finally(() => {
            active = Math.max(0, active - 1);
            const laneActive = Math.max(0, (activeByLane.get(job.lane) ?? 1) - 1);
            if (laneActive === 0) activeByLane.delete(job.lane);
            else activeByLane.set(job.lane, laneActive);
            drain();
          });
      }

      if (!started && active === 0 && pending.length > 0) {
        settled = true;
        reject(new Error("Provider probe scheduler ilerleyemedi."));
      }
    };

    drain();
  });
}

function positiveInteger(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.max(1, Math.floor(value)) : fallback;
}
