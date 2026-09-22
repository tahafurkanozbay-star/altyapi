export type RuntimeMilestone = "bootstrap" | "scene-ready" | "workspace-ready";

export interface RuntimePerformanceSnapshot {
  navigationMs?: number;
  domInteractiveMs?: number;
  firstContentfulPaintMs?: number;
  largestContentfulPaintMs?: number;
  sceneReadyMs?: number;
  workspaceReadyMs?: number;
  longTaskCount: number;
  longTaskTotalMs: number;
}

const observers: PerformanceObserver[] = [];

const observed = {
  lcp: undefined as number | undefined,
  longTaskCount: 0,
  longTaskTotalMs: 0,
  started: false
};

export function startRuntimePerformanceMonitoring(): void {
  if (observed.started || typeof performance === "undefined") return;
  observed.started = true;

  if (typeof PerformanceObserver === "undefined") return;
  const supported = new Set(PerformanceObserver.supportedEntryTypes ?? []);

  if (supported.has("largest-contentful-paint")) {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) observed.lcp = Math.round(entry.startTime);
    });
    observer.observe({ type: "largest-contentful-paint", buffered: true });
    observers.push(observer);
  }

  if (supported.has("longtask")) {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        observed.longTaskCount += 1;
        observed.longTaskTotalMs += entry.duration;
      }
    });
    observer.observe({ type: "longtask", buffered: true });
    observers.push(observer);
  }
}

export function markRuntimeMilestone(name: RuntimeMilestone): void {
  if (typeof performance === "undefined") return;
  const mark = `altyapi:${name}`;
  if (performance.getEntriesByName(mark, "mark").length > 0) return;
  performance.mark(mark);
}

export function getRuntimePerformanceSnapshot(): RuntimePerformanceSnapshot {
  if (typeof performance === "undefined") {
    return { longTaskCount: 0, longTaskTotalMs: 0 };
  }

  const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  const fcp = performance.getEntriesByName("first-contentful-paint", "paint")[0];
  const sceneReady = performance.getEntriesByName("altyapi:scene-ready", "mark")[0];
  const workspaceReady = performance.getEntriesByName("altyapi:workspace-ready", "mark")[0];

  return {
    navigationMs: navigation ? roundNonNegative(navigation.loadEventEnd || navigation.duration) : undefined,
    domInteractiveMs: navigation ? roundNonNegative(navigation.domInteractive) : undefined,
    firstContentfulPaintMs: fcp ? roundNonNegative(fcp.startTime) : undefined,
    largestContentfulPaintMs: observed.lcp,
    sceneReadyMs: sceneReady ? roundNonNegative(sceneReady.startTime) : undefined,
    workspaceReadyMs: workspaceReady ? roundNonNegative(workspaceReady.startTime) : undefined,
    longTaskCount: observed.longTaskCount,
    longTaskTotalMs: Math.round(observed.longTaskTotalMs)
  };
}

export function runtimePerformanceScore(snapshot: RuntimePerformanceSnapshot): number {
  let score = 100;
  score -= penalty(snapshot.firstContentfulPaintMs, 1200, 2500, 8, 18);
  score -= penalty(snapshot.largestContentfulPaintMs, 2500, 4000, 10, 25);
  score -= penalty(snapshot.sceneReadyMs, 4000, 8000, 10, 25);
  score -= penalty(snapshot.workspaceReadyMs, 6000, 12000, 8, 20);
  score -= Math.min(20, snapshot.longTaskCount * 2);
  return Math.max(0, Math.min(100, Math.round(score)));
}

function penalty(
  value: number | undefined,
  good: number,
  poor: number,
  moderatePenalty: number,
  poorPenalty: number
): number {
  if (value === undefined) return 0;
  if (value <= good) return 0;
  if (value >= poor) return poorPenalty;
  return moderatePenalty;
}

function roundNonNegative(value: number): number | undefined {
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
}
