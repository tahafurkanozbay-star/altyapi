import { describe, expect, it } from "vitest";
import { readResponseTextLimited, ResponseSizeLimitError } from "../src/platform/responseText";

describe("bounded response text reader", () => {
  it("reads a normal streamed response", async () => {
    const response = new Response("<xml>ankara</xml>");
    await expect(readResponseTextLimited(response, 1_024)).resolves.toBe("<xml>ankara</xml>");
  });

  it("rejects an oversized declared content length before allocating the body", async () => {
    const response = new Response("small", { headers: { "content-length": "5000" } });
    await expect(readResponseTextLimited(response, 1_024)).rejects.toBeInstanceOf(ResponseSizeLimitError);
  });

  it("rejects an actual streamed body that crosses the byte ceiling", async () => {
    const response = new Response("ü".repeat(800));
    await expect(readResponseTextLimited(response, 1_000)).rejects.toBeInstanceOf(ResponseSizeLimitError);
  });
});
