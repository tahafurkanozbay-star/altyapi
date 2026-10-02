import { describe, expect, it } from "vitest";
import { publicErrorMessage } from "../src/lib/publicError";

describe("publicErrorMessage", () => {
  it("keeps concise citizen-safe messages", () => {
    expect(publicErrorMessage("Veri geçici olarak hazır değil.", "Yeniden deneyin.")).toBe("Veri geçici olarak hazır değil.");
  });

  it("replaces technical, endpoint and credential-bearing failures with the fallback", () => {
    const fallback = "Harita verisi şu anda alınamadı. Lütfen yeniden deneyin.";
    expect(publicErrorMessage(new Error("TypeError: fetch failed https://example.test/wms?token=secret"), fallback)).toBe(fallback);
    expect(publicErrorMessage("Authorization: Bearer abc123", fallback)).toBe(fallback);
    expect(publicErrorMessage("ERR_NETWORK while contacting ucbp service", fallback)).toBe(fallback);
  });

  it("normalizes whitespace and bounds reflected text", () => {
    const result = publicErrorMessage(`  Kısa   açıklama ${"a".repeat(300)}  `, "Yeniden deneyin.");
    expect(result).toMatch(/^Kısa açıklama/);
    expect(result.length).toBeLessThanOrEqual(180);
  });

  it("uses a stable generic fallback when both inputs are empty", () => {
    expect(publicErrorMessage(undefined, "   ")).toBe("İşlem şu anda tamamlanamadı.");
  });
});