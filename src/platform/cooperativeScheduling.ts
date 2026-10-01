export type CooperativeTaskPriority = "user-visible" | "background";

interface SchedulerLike {
  yield?: () => Promise<void>;
  postTask?: <T>(
    callback: () => T | Promise<T>,
    options?: { priority?: "user-blocking" | "user-visible" | "background" }
  ) => Promise<T>;
}

interface SchedulerHost {
  scheduler?: SchedulerLike;
}

export interface CooperativeSchedulingCapabilities {
  yield: boolean;
  postTask: boolean;
}

function schedulerFrom(target: unknown): SchedulerLike | undefined {
  if (!target || typeof target !== "object") return undefined;
  return (target as SchedulerHost).scheduler;
}

export function cooperativeSchedulingCapabilities(target: unknown = globalThis): CooperativeSchedulingCapabilities {
  const scheduler = schedulerFrom(target);
  return {
    yield: typeof scheduler?.yield === "function",
    postTask: typeof scheduler?.postTask === "function"
  };
}

function fallbackYield(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function cooperativeYield(target: unknown = globalThis): Promise<void> {
  const scheduler = schedulerFrom(target);
  if (typeof scheduler?.yield === "function") {
    try {
      await scheduler.yield.call(scheduler);
      return;
    } catch {
      // Experimental scheduler implementations must never break application work.
    }
  }
  await fallbackYield();
}

export async function runCooperativeTask<T>(
  task: () => T | Promise<T>,
  priority: CooperativeTaskPriority = "background",
  target: unknown = globalThis
): Promise<T> {
  const scheduler = schedulerFrom(target);
  if (typeof scheduler?.postTask === "function") {
    try {
      const result = await scheduler.postTask.call(scheduler, task, { priority });
      return result as T;
    } catch {
      // Fall through to the universally supported event-loop yield.
    }
  }

  await cooperativeYield(target);
  return await task();
}
