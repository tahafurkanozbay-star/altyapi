import { describe, expect, it } from "vitest";
import { buildOrderBy, buildWhereClause, isNumericField } from "../src/lib/queryBuilder";
import type { AttributeField } from "../src/types";

const fields: AttributeField[] = [
  { name: "OBJECTID", alias: "Kimlik", type: "oid" },
  { name: "ADI", alias: "Adı", type: "string" },
  { name: "UZUNLUK", alias: "Uzunluk", type: "double" }
];

describe("queryBuilder", () => {
  it("builds whitelisted numeric comparisons", () => {
    expect(buildWhereClause({ field: "UZUNLUK", operator: "gte", value: "12,5" }, fields)).toBe("UZUNLUK >= 12.5");
    expect(isNumericField(fields[2]!)).toBe(true);
  });

  it("escapes string literals and like wildcards", () => {
    const where = buildWhereClause({ field: "ADI", operator: "contains", value: "O'Hara_100%" }, fields);
    expect(where).toContain("O''Hara");
    expect(where).toContain("\\_");
    expect(where).toContain("\\%");
  });

  it("supports null predicates and safe ordering", () => {
    expect(buildWhereClause({ field: "ADI", operator: "isNull" }, fields)).toBe("ADI IS NULL");
    expect(buildOrderBy("OBJECTID", "desc", fields)).toEqual(["OBJECTID DESC"]);
  });

  it("rejects unknown fields instead of accepting raw SQL identifiers", () => {
    expect(() => buildWhereClause({ field: "DROP_TABLE", operator: "eq", value: "1" }, fields)).toThrow(/servis şemasında/i);
  });
});
