import type { AttributeField, AttributeRow, AttributeValue } from "../types";

export function normalizeAttributeValue(value: unknown): AttributeValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function filterAttributeRows(rows: AttributeRow[], fields: AttributeField[], query: string): AttributeRow[] {
  const needle = query.trim().toLocaleLowerCase("tr-TR");
  if (!needle) return rows;
  const names = fields.map((field) => field.name);
  return rows.filter((row) => names.some((name) => formatCell(row[name]).toLocaleLowerCase("tr-TR").includes(needle)));
}

export function formatCell(value: AttributeValue | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Evet" : "Hayır";
  if (typeof value === "number") return Number.isFinite(value) ? value.toLocaleString("tr-TR") : "—";
  return value;
}

export function rowsToCsv(rows: AttributeRow[], fields: AttributeField[]): string {
  const header = fields.map((field) => csvEscape(field.alias || field.name)).join(",");
  const body = rows.map((row) => fields.map((field) => csvEscape(formatCell(row[field.name]))).join(",")).join("\n");
  return "\uFEFF" + [header, body].filter(Boolean).join("\n");
}

export function defaultVisibleFields(fields: AttributeField[], maxColumns = 8): string[] {
  const preferred = fields.filter((field) => !/shape|geometry|globalid/i.test(field.name));
  return (preferred.length ? preferred : fields).slice(0, Math.max(1, maxColumns)).map((field) => field.name);
}

function csvEscape(value: string): string {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}
