import { describe, expect, it } from "vitest";
import { buildOrderBy, buildWhereClause, filterNeedsValue, filterOperatorsForField, sanitizeQueryOptions } from "../src/lib/attributeQuery";
import type { AttributeField } from "../src/types";

const fields: AttributeField[] = [
  { name: "ADI", alias: "Adı", type: "string" },
  { name: "KOD", alias: "Kod", type: "integer" },
  { name: "TARIH", alias: "Tarih", type: "date" }
];

describe("attribute query builder", () => {
  it("escapes string literals and never accepts arbitrary field names", () => {
    expect(buildWhereClause({ field: "ADI", operator: "contains", value: "O'Brien" }, fields))
      .toBe("ADI LIKE '%O''Brien%'");
    expect(() => buildWhereClause({ field: "ADI; DROP TABLE X", operator: "equals", value: "x" }, fields))
      .toThrow(/bulunamadı/i);
  });

  it("builds numeric comparisons and validates numeric input", () => {
    expect(buildWhereClause({ field: "KOD", operator: "greaterThanOrEqual", value: "12,5" }, fields))
      .toBe("KOD >= 12.5");
    expect(() => buildWhereClause({ field: "KOD", operator: "equals", value: "abc" }, fields))
      .toThrow(/sayı/i);
  });

  it("builds null and date clauses", () => {
    expect(buildWhereClause({ field: "ADI", operator: "isNull" }, fields)).toBe("ADI IS NULL");
    expect(buildWhereClause({ field: "TARIH", operator: "greaterThan", value: "2026-09-18" }, fields))
      .toContain("TIMESTAMP '2026-09-18");
  });

  it("sanitizes page options and sorting", () => {
    expect(sanitizeQueryOptions({ limit: 9999, offset: -25 }).limit).toBe(500);
    expect(sanitizeQueryOptions({ limit: 100, offset: -25 }).offset).toBe(0);
    expect(buildOrderBy({ field: "ADI", direction: "desc" }, fields)).toBe("ADI DESC");
    expect(() => buildOrderBy({ field: "UNKNOWN", direction: "asc" }, fields)).toThrow(/bulunamadı/i);
  });

  it("exposes field-aware operators", () => {
    expect(filterOperatorsForField(fields[0]).some((item) => item.value === "contains")).toBe(true);
    expect(filterOperatorsForField(fields[1]).some((item) => item.value === "greaterThan")).toBe(true);
    expect(filterOperatorsForField(fields[1]).some((item) => item.value === "contains")).toBe(false);
    expect(filterNeedsValue("isNull")).toBe(false);
    expect(filterNeedsValue("equals")).toBe(true);
  });
});
