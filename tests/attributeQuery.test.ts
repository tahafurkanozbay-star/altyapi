import { describe, expect, it } from "vitest";
import { AttributeQueryValidationError, attributeQueryErrorMessage, buildOrderBy, buildWhereClause, filterNeedsValue, filterOperatorsForField, sanitizeQueryOptions } from "../src/lib/attributeQuery";
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
  it("keeps invalid numeric page inputs out of provider requests", () => {
    expect(sanitizeQueryOptions({ limit: NaN, offset: Infinity })).toMatchObject({ limit: 100, offset: 0 });
    expect(sanitizeQueryOptions({ limit: Infinity, offset: NaN })).toMatchObject({ limit: 100, offset: 0 });
    expect(sanitizeQueryOptions({ limit: -20, offset: Number.MAX_VALUE })).toMatchObject({ limit: 1, offset: 2_147_483_647 });
  });
  it("rejects hostile provider metadata in WHERE and ORDER BY identifiers", () => {
    const hostile: AttributeField[] = [
      { name: "OBJECTID; DROP TABLE records--", alias: "Kimlik", type: "integer" }
    ];
    expect(() => buildWhereClause({ field: hostile[0]!.name, operator: "isNull" }, hostile))
      .toThrow(AttributeQueryValidationError);
    expect(() => buildOrderBy({ field: hostile[0]!.name, direction: "asc" }, hostile))
      .toThrow(/güvenli sorgu/);
    expect(buildOrderBy({ field: "GIS.TABLE.OBJECTID", direction: "desc" }, [
      { name: "GIS.TABLE.OBJECTID", alias: "Kimlik", type: "integer" }
    ])).toBe("GIS.TABLE.OBJECTID DESC");
  });

  it("rejects unbounded values and unsupported operators instead of querying all rows", () => {
    expect(() => buildWhereClause({ field: "ADI", operator: "contains", value: "a".repeat(1_025) }, fields))
      .toThrow(/çok uzun/);
    expect(() => buildWhereClause({ field: "ADI", operator: "other" as "equals", value: "a" }, fields))
      .toThrow(/Desteklenmeyen filtre/);
  });

  it("shows only local query validation and masks upstream errors", () => {
    expect(attributeQueryErrorMessage(new AttributeQueryValidationError("Filtre değeri boş bırakılamaz.")))
      .toContain("Filtre değeri");
    expect(attributeQueryErrorMessage(new Error("https://example.org/data?token=PRIVATE")))
      .not.toMatch(/PRIVATE|https:/);
    expect(attributeQueryErrorMessage(new Error("Deneme sorgusu reddedildi.")))
      .not.toContain("reddedildi");
  });
});
