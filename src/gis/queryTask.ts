/** A stage deadline is distinguishable from untrusted provider errors. */
export class QueryStageTimeoutError extends Error {
  readonly stage: string;

  constructor(stage: string) {
    super(`${stage} zamanında tamamlanamadı. Yeniden deneyebilirsiniz.`);
    this.name = "QueryStageTimeoutError";
    this.stage = stage;
  }
}

/** A query stage stops waiting immediately on cancel and releases late owned resources. */
export function runQueryStage<T>(
  start: () => Promise<T>, controller: AbortController, timeoutMs: number, label: string,
  releaseLateValue?: (value: T) => void
): Promise<T> {
  const signal = controller.signal;
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); };
    const fail = (reason: unknown) => {
      if (settled) return;
      settled = true; cleanup(); reject(reason);
    };
    const abort = () => fail(signal.reason ?? new DOMException("Sorgu iptal edildi.", "AbortError"));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => controller.abort(new QueryStageTimeoutError(label)), timeoutMs);
    void Promise.resolve().then(() => { signal.throwIfAborted(); return start(); }).then((value) => {
      if (settled) {
        try { releaseLateValue?.(value); } catch { /* Cleanup must not reopen a cancelled query. */ }
        return;
      }
      settled = true; cleanup(); resolve(value);
    }, fail);
  });
}

export function isQueryCancellation(reason: unknown): boolean {
  return typeof reason === "object" && reason !== null && "name" in reason && reason.name === "AbortError";
}
