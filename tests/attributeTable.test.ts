import { describe, expect, it } from "vitest";
import {
  defaultVisibleFields,
  filterAttributeRows,
  formatCell,
  neutralizeSpreadsheetFormula,
  normalizeAttributeValue,
  rowsToCsv
} from "../src/lib/attributeTable";
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

  it("neutralizes spreadsheet formulas without converting real numbers to text", () => {
    expect(neutralizeSpreadsheetFormula("=HYPERLINK(\"https://example.test\")")).toBe("'=HYPERLINK(\"https://example.test\")");
    expect(neutralizeSpreadsheetFormula("  +CMD|'/C calc'!A0")).toBe("'  +CMD|'/C calc'!A0");
    expect(neutralizeSpreadsheetFormula("Ankara")).toBe("Ankara");

    const csv = rowsToCsv(
      [
        { OBJECTID: -42, ADI: "=1+1", DURUM: true },
        { OBJECTID: 7, ADI: "@SUM(A1:A2)", DURUM: false }
      ],
      fields
    );
    expect(csv).toContain("-42");
    expect(csv).toContain("'=1+1");
    expect(csv).toContain("'@SUM(A1:A2)");
  });

  it("picks usable default columns and formats empty values", () => {
    expect(defaultVisibleFields(fields, 2)).toEqual(["OBJECTID", "ADI"]);
    expect(formatCell(null)).toBe("—");
  });
});
