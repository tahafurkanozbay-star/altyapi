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

  it.each(["=1+1", "+SUM(A1)", "-SUM(A1)", "@SUM(A1)", "  =1+1", "\tvalue", "\rvalue", "\nvalue", "＝1+1", "＋1", "－1", "＠SUM(A1)"])("exports formula-like text as literal text: %j", (value) => {
    const csv = rowsToCsv([{ ADI: value }], [{ name: "ADI", alias: "Adı" }]);
    expect(csv).toContain(`'${value}`);
  });

  it("protects formula-like headers while preserving numeric signs and RFC quoting", () => {
    expect(rowsToCsv([{ ADI: -7.5 }], [{ name: "ADI", alias: "=Adı" }])).toBe('\uFEFF\'=Adı\n-7.5');
    expect(rowsToCsv([{ ADI: '=HYPERLINK("x", "y")' }], [{ name: "ADI", alias: "Adı" }])).toBe('\uFEFFAdı\n"\'=HYPERLINK(""x"", ""y"")"');
  });

  it("keeps coordinate precision in the readable table and record details", () => {
    expect(formatCell(32.85423275)).toBe("32,85423275");
    expect(formatCell(0.00000012345678)).toBe("0,00000012345678");
  });

  it("exports numeric IDs and coordinates without grouping or display rounding", () => {
    expect(rowsToCsv([{ OBJECTID: 1234567, ADI: 32.85423275, DURUM: -0.00000012345678 }], fields)).toBe("\uFEFFID,Adı,Durum\n1234567,32.85423275,-1.2345678e-7");
  });
});
