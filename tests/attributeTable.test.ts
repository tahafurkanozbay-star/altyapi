import { describe, expect, it } from "vitest";
import { defaultVisibleFields, filterAttributeRows, formatCell, normalizeAttributeValue, rowsToCsv } from "../src/lib/attributeTable";
import type { AttributeField, AttributeRow } from "../src/types";

const fields: AttributeField[] = [
  { name: "OBJECTID", alias: "ID" },
  { name: "ADI", alias: "Adı" },
  { name: "DURUM", alias: "Durum" }
];

const rows: AttributeRow[] = [
  { OBJECTID: 1, ADI: "Kızılay", DURUM: true },
  { OBJECTID: 2, ADI: "Ulus, Merkez", DURUM: false }
];

describe("attributeTable", () => {
  it("normalizes complex values without leaking undefined", () => {
    expect(normalizeAttributeValue(undefined)).toBeNull();
    expect(normalizeAttributeValue({ a: 1 })).toBe('{"a":1}');
  });

  it("filters across selected fields with Turkish locale", () => {
    expect(filterAttributeRows(rows, fields, "kızı").length).toBe(1);
    expect(filterAttributeRows(rows, fields, "hayır").length).toBe(1);
  });

  it("produces BOM-prefixed RFC-style CSV escaping", () => {
    const csv = rowsToCsv(rows, fields);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"Ulus, Merkez"');
    expect(csv).toContain("Evet");
  });

  it("picks usable default columns and formats empty values", () => {
    expect(defaultVisibleFields(fields, 2)).toEqual(["OBJECTID", "ADI"]);
    expect(formatCell(null)).toBe("—");
  });
});
