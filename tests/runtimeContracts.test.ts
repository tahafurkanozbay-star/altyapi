import { describe, expect, it } from "vitest";
import {
  asRecord,
  readArray,
  readEnum,
  readFiniteNumber,
  readIsoDate,
  readNullableBoolean,
  readString
} from "../src/platform/runtimeContracts";

describe("runtime contract readers", () => {
  it("accepts valid values without coercing untrusted primitives", () => {
    const record = asRecord({
      name: "  Ankara  ",
      count: 12,
      enabled: null,
      kind: "WMS",
      at: "2026-10-01T00:00:00.000Z",
      rows: [1, 2]
    });
    expect(record).toBeDefined();
    expect(readString(record!, "name", { trim: true, nonEmpty: true })).toBe("Ankara");
    expect(readFiniteNumber(record!, "count", { min: 0, integer: true })).toBe(12);
    expect(readNullableBoolean(record!, "enabled")).toBeNull();
    expect(readEnum(record!, "kind", new Set(["WMS", "WFS"] as const))).toBe("WMS");
    expect(readIsoDate(record!, "at")).toBe("2026-10-01T00:00:00.000Z");
    expect(readArray(record!, "rows")).toEqual([1, 2]);
  });

  it("rejects arrays, numeric strings and invalid dates at trust boundaries", () => {
    expect(asRecord([])).toBeUndefined();
    const record = asRecord({ count: "12", at: "not-a-date", name: "   " })!;
    expect(readFiniteNumber(record, "count")).toBeUndefined();
    expect(readIsoDate(record, "at")).toBeUndefined();
    expect(readString(record, "name", { trim: true, nonEmpty: true })).toBeUndefined();
  });
});
