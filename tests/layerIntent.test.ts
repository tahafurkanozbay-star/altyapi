import { describe, expect, it } from "vitest";
import { LayerIntentTracker } from "../src/lib/layerIntent";

describe("latest layer intent", () => {
  it("does not accept a delayed restore or retry after the user hides the layer", async () => {
    const intents = new LayerIntentTracker();
    const restore = intents.begin("water");
    let finish!: () => void;
    const delayed = new Promise<void>((resolve) => { finish = resolve; });
    let visible = true;
    const opening = delayed.then(() => {
      if (intents.isCurrent("water", restore)) visible = true;
    });
    intents.begin("water");
    visible = false;
    finish();
    await opening;
    expect(visible).toBe(false);
  });

  it("accepts the last request across open-close-open without invalidating another layer", () => {
    const intents = new LayerIntentTracker();
    const old = intents.begin("water");
    const other = intents.begin("sewer");
    intents.begin("water");
    const current = intents.begin("water");
    expect(intents.isCurrent("water", old)).toBe(false);
    expect(intents.isCurrent("water", current)).toBe(true);
    expect(intents.isCurrent("sewer", other)).toBe(true);
  });
});
