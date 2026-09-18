import type { AttributeField, AttributeFilter } from "../types";

const NUMERIC_TYPE = /(small-integer|integer|single|double|long|short|oid|big-integer|number)/i;

export function buildWhereClause(filter: AttributeFilter | undefined, fields: AttributeField[]): string {
  if (!filter) return "1=1";
  const field = resolveField(filter.field, fields);
  const name = field.name;
  const operator = filter.operator;

  if (operator === "isNull") return `${name} IS NULL`;
  if (operator === "isNotNull") return `${name} IS NOT NULL`;

  const raw = (filter.value ?? "").trim();
  if (!raw) return "1=1";

  const numeric = NUMERIC_TYPE.test(field.type ?? "");
  if (numeric && ["eq", "ne", "gt", "gte", "lt", "lte"].includes(operator)) {
    const value = Number(raw.replace(",", "."));
    if (!Number.isFinite(value)) throw new Error(`${field.alias} alanı için geçerli bir sayı girin.`);
    return `${name} ${comparison(operator)} ${value}`;
  }

  const value = sqlString(raw);
  if (operator === "contains") return `UPPER(${name}) LIKE UPPER('%${escapeLike(raw)}%') ESCAPE '\\'`;
  if (operator === "startsWith") return `UPPER(${name}) LIKE UPPER('${escapeLike(raw)}%') ESCAPE '\\'`;
  if (operator === "eq") return `${name} = ${value}`;
  if (operator === "ne") return `${name} <> ${value}`;

  throw new Error("Bu karşılaştırma metin alanında desteklenmiyor.");
}

export function buildOrderBy(fieldName: string | undefined, order: "asc" | "desc" | undefined, fields: AttributeField[]): string[] | undefined {
  if (!fieldName) return undefined;
  const field = resolveField(fieldName, fields);
  return [`${field.name} ${order === "desc" ? "DESC" : "ASC"}`];
}

export function isNumericField(field: AttributeField): boolean {
  return NUMERIC_TYPE.test(field.type ?? "");
}

function resolveField(name: string, fields: AttributeField[]): AttributeField {
  const field = fields.find((candidate) => candidate.name === name);
  if (!field) throw new Error("Seçilen alan servis şemasında bulunamadı.");
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field.name)) {
    throw new Error("Servis alan adı güvenli sorgu biçimiyle uyumlu değil.");
  }
  return field;
}

function comparison(operator: AttributeFilter["operator"]): string {
  switch (operator) {
    case "eq": return "=";
    case "ne": return "<>";
    case "gt": return ">";
    case "gte": return ">=";
    case "lt": return "<";
    case "lte": return "<=";
    default: throw new Error("Desteklenmeyen karşılaştırma operatörü.");
  }
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function escapeLike(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/'/g, "''");
}
