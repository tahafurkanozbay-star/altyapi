export type RuntimePressureLevel = "normal" | "busy" | "critical";

export interface RuntimeLongTaskSample {
  startTime: number;
  duration: number;
}

export interface RuntimePressureSnapshot {
  level: RuntimePressureLevel;
  longTaskCount: number;
  blockingTimeMs: number;
  maxLongTaskMs: number;
  windowMs: number;
  sampledAt: number;
}

const WINDOW_MS = 5_000;
const BUSY_BLOCKING_MS = 150;
const CRITICAL_BLOCKING_MS = 500;
const BUSY_SINGLE_TASK_MS = 100;
const CRITICAL_SINGLE_TASK_MS = 250;
const MAX_SAMPLES = 40;

let samples: RuntimeLongTaskSample[] = [];
let observer: PerformanceObserver | undefined;
const listeners = new Set<(snapshot: RuntimePressureSnapshot) => void>();

function monotonicNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

function recentSamples(input: readonly RuntimeLongTaskSample[], now: number): RuntimeLongTaskSample[] {
  const lowerBound = now - WINDOW_MS;
  return input
    .filter((sample) => Number.isFinite(sample.startTime) && Number.isFinite(sample.duration) && sample.duration >= 0)
    .filter((sample) => sample.startTime + sample.duration >= lowerBound && sample.startTime <= now)
    .slice(-MAX_SAMPLES);
}

export function classifyRuntimePressure(
  input: readonly RuntimeLongTaskSample[],
  now = monotonicNow()
): RuntimePressureSnapshot {
  const active = recentSamples(input, now);
  const blockingTimeMs = active.reduce((sum, sample) => sum + Math.max(0, sample.duration - 50), 0);
  const maxLongTaskMs = active.reduce((max, sample) => Math.max(max, sample.duration), 0);

  let level: RuntimePressureLevel = "normal";
  if (blockingTimeMs >= CRITICAL_BLOCKING_MS || maxLongTaskMs >= CRITICAL_SINGLE_TASK_MS || active.length >= 6) {
    level = "critical";
  } else if (blockingTimeMs >= BUSY_BLOCKING_MS || maxLongTaskMs >= BUSY_SINGLE_TASK_MS || active.length >= 2) {
    level = "busy";
  }

  return {
    level,
    longTaskCount: active.length,
    blockingTimeMs: Math.round(blockingTimeMs),
    maxLongTaskMs: Math.round(maxLongTaskMs),
    windowMs: WINDOW_MS,
    sampledAt: now
  };
}

export function getRuntimePressureSnapshot(): RuntimePressureSnapshot {
  const now = monotonicNow();
  samples = recentSamples(samples, now);
  return classifyRuntimePressure(samples, now);
}

export function subscribeRuntimePressure(listener: (snapshot: RuntimePressureSnapshot) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(): void {
  const snapshot = getRuntimePressureSnapshot();
  for (const listener of listeners) listener(snapshot);
}

export function installRuntimePressureMonitor(): () => void {
  if (observer || typeof PerformanceObserver === "undefined") return () => undefined;
  if (Array.isArray(PerformanceObserver.supportedEntryTypes) && !PerformanceObserver.supportedEntryTypes.includes("longtask")) {
    return () => undefined;
  }

  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType !== "longtask") continue;
        samples.push({ startTime: entry.startTime, duration: entry.duration });
      }
      samples = samples.slice(-MAX_SAMPLES);
      emit();
    });
    observer.observe({ type: "longtask", buffered: true });
  } catch {
    observer?.disconnect();
    observer = undefined;
    return () => undefined;
  }

  return () => {
    observer?.disconnect();
    observer = undefined;
    samples = [];
    emit();
  };
}

export function resetRuntimePressureForTests(): void {
  observer?.disconnect();
  observer = undefined;
  samples = [];
  listeners.clear();
}
