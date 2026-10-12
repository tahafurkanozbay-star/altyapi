interface ProbeOptions<T> {
  isCurrent(key: string, value: T): boolean;
  read(value: T, signal: AbortSignal): Promise<boolean>;
  onReady(key: string, value: T): void;
  same?(left: T, right: T): boolean;
  timeoutMs?: number;
}

/** One bounded client-side read per LayerView, with latest-view ownership. */
export class FirstRenderProbe<T> {
  private pending = new Map<string, { value: T; controller: AbortController; promise: Promise<boolean> }>();
  private disposed = false;
  private readonly options: ProbeOptions<T>;

  constructor(options: ProbeOptions<T>) { this.options = options; }

  request(key: string, value: T): Promise<boolean> {
    if (this.disposed || !this.options.isCurrent(key, value)) return Promise.resolve(false);
    const previous = this.pending.get(key);
    if (previous && (this.options.same?.(previous.value, value) ?? previous.value === value)) return previous.promise;
    this.cancel(key);
    const controller = new AbortController();
    let finishAbort!: () => void;
    const aborted = new Promise<false>((resolve) => { finishAbort = () => resolve(false); });
    controller.signal.addEventListener("abort", finishAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 5_000);
    const read = Promise.resolve().then(() => controller.signal.aborted ? false : this.options.read(value, controller.signal)).catch(() => false);
    const promise = Promise.race([read, aborted]).then((ready) => {
      const current = ready && !this.disposed && !controller.signal.aborted
        && this.pending.get(key)?.controller === controller && this.options.isCurrent(key, value);
      if (current) this.options.onReady(key, value);
      return Boolean(current);
    }).finally(() => {
      clearTimeout(timer);
      controller.signal.removeEventListener("abort", finishAbort);
      if (this.pending.get(key)?.controller === controller) this.pending.delete(key);
    });
    this.pending.set(key, { value, controller, promise });
    return promise;
  }

  cancel(key: string): void {
    this.pending.get(key)?.controller.abort();
    this.pending.delete(key);
  }

  dispose(): void {
    this.disposed = true;
    for (const key of this.pending.keys()) this.cancel(key);
  }
}

/** Give the SDK two paint opportunities; cancellation also releases the frame. */
export async function waitForRenderFrames(signal: AbortSignal): Promise<boolean> {
  for (let index = 0; index < 2; index += 1) {
    const painted = await new Promise<boolean>((resolve) => {
      if (signal.aborted) { resolve(false); return; }
      let frame = 0;
      const abort = () => { cancelAnimationFrame(frame); resolve(false); };
      signal.addEventListener("abort", abort, { once: true });
      frame = requestAnimationFrame(() => {
        signal.removeEventListener("abort", abort);
        resolve(!signal.aborted);
      });
    });
    if (!painted) return false;
  }
  return true;
}
