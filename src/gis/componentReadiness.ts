/** Install before connection so a fast SDK ready event cannot be missed. */
export function waitForComponentReady(target: EventTarget, signal: AbortSignal, timeoutMs = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      clearTimeout(timer);
      target.removeEventListener("arcgisReady", ready);
      signal.removeEventListener("abort", abort);
    };
    const ready = () => { cleanup(); resolve(); };
    const abort = () => { cleanup(); reject(new DOMException("Araç açılışı iptal edildi.", "AbortError")); };
    if (signal.aborted) { abort(); return; }
    target.addEventListener("arcgisReady", ready, { once: true });
    signal.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => {
      cleanup();
      reject(new Error("Harita aracı zamanında hazırlanamadı."));
    }, timeoutMs);
  });
}
