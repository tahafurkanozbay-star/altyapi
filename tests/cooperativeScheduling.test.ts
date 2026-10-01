import { describe, expect, it } from "vitest";
import {
  cooperativeSchedulingCapabilities,
  cooperativeYield,
  runCooperativeTask
} from "../src/platform/cooperativeScheduling";

describe("cooperative scheduling", () => {
  it("feature-detects scheduler APIs without assuming browser support", () => {
    expect(cooperativeSchedulingCapabilities({})).toEqual({ yield: false, postTask: false });
    expect(cooperativeSchedulingCapabilities({ scheduler: { yield: async () => undefined } })).toEqual({
      yield: true,
      postTask: false
    });
  });

  it("uses native scheduler.yield when available", async () => {
    let calls = 0;
    await cooperativeYield({
      scheduler: {
        yield: async () => {
          calls += 1;
        }
      }
    });
    expect(calls).toBe(1);
  });

  it("uses background postTask when available", async () => {
    let priority: string | undefined;
    const result = await runCooperativeTask(
      () => 41,
      "background",
      {
        scheduler: {
          postTask: async <T>(task: () => T | Promise<T>, options?: { priority?: string }) => {
            priority = options?.priority;
            return await task();
          }
        }
      }
    );

    expect(result).toBe(41);
    expect(priority).toBe("background");
  });
});
