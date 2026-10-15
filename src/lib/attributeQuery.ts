import type { AttributeField, AttributeFilter, AttributeQueryOptions } from "../types";

const SAFE_FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}(?:\.[A-Za-z_][A-Za-z0-9_]{0,63}){0,2}$/;
const MAX_FILTER_VALUE_LENGTH = 1_024;

export class AttributeQueryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttributeQueryValidationError";
  }
}

/** Never show upstream service diagnostics or signed URLs to citizens. */
export function attributeQueryErrorMessage(reason: unknown): string {
  return reason instanceof AttributeQueryValidationError
    ? reason.message
    : "Öznitelik verisi alınamadı. Bağlantıyı kontrol edip yeniden deneyin.";
}

function safeFieldName(field: AttributeField): string {
  if (!SAFE_FIELD_NAME.test(field.name)) {
    throw new AttributeQueryValidationError("Servis alan adı güvenli sorgu biçiminde değil.");
  }
  return field.name;
}

export function sanitizeQueryOptions(options: AttributeQueryOptions): AttributeQueryOptions {
  return {
    limit: Math.min(500, Math.max(1, Math.trunc(Number.isFinite(options.limit) ? options.limit || 100 : 100))),
    offset: Math.min(2_147_483_647, Math.max(0, Math.trunc(Number.isFinite(options.offset) ? options.offset : 0))),
    filter: options.filter,
    orderBy: options.orderBy
  };
}

export function buildWhereClause(filter: AttributeFilter | undefined, fields: AttributeField[]): string {
  if (!filter) return "1=1";
  const field = fields.find((candidate) => candidate.name === filter.field);
  if (!field) throw new AttributeQueryValidationError("Filtre alanı bu serviste bulunamadı.");
  const name = safeFieldName(field);

  if (filter.operator === "isNull") return `${name} IS NULL`;
  if (filter.operator === "isNotNull") return `${name} IS NOT NULL`;

  const value = (filter.value ?? "").trim();
  if (!value) throw new AttributeQueryValidationError("Filtre değeri boş bırakılamaz.");
  if (value.length > MAX_FILTER_VALUE_LENGTH) throw new AttributeQueryValidationError("Filtre değeri çok uzun.");

  const numeric = isNumericField(field.type);
  const date = isDateField(field.type);
  const literal = numeric
    ? numericLiteral(value)
    : date
      ? dateLiteral(value)
      : stringLiteral(value);

  switch (filter.operator) {
    case "equals":
      return `${name} = ${literal}`;
    case "notEquals":
      return `${name} <> ${literal}`;
    case "greaterThan":
      return `${name} > ${literal}`;
    case "greaterThanOrEqual":
      return `${name} >= ${literal}`;
    case "lessThan":
      return `${name} < ${literal}`;
    case "lessThanOrEqual":
      return `${name} <= ${literal}`;
    case "contains":
      if (numeric || date) throw new AttributeQueryValidationError("Bu alan türünde 'içerir' filtresi kullanılamaz.");
      return `${name} LIKE ${stringLiteral(`%${value}%`)}`;
    case "startsWith":
      if (numeric || date) throw new AttributeQueryValidationError("Bu alan türünde 'ile başlar' filtresi kullanılamaz.");
      return `${name} LIKE ${stringLiteral(`${value}%`)}`;
    default:
      throw new AttributeQueryValidationError("Desteklenmeyen filtre işlemi.");
  }
}

export function buildOrderBy(orderBy: AttributeQueryOptions["orderBy"], fields: AttributeField[]): string | undefined {
  if (!orderBy) return undefined;
  const field = fields.find((candidate) => candidate.name === orderBy.field);
  if (!field) throw new AttributeQueryValidationError("Sıralama alanı bu serviste bulunamadı.");
  return `${safeFieldName(field)} ${orderBy.direction === "desc" ? "DESC" : "ASC"}`;
}

export function filterOperatorsForField(field?: AttributeField): Array<{ value: AttributeFilter["operator"]; label: string }> {
  const common: Array<{ value: AttributeFilter["operator"]; label: string }> = [
    { value: "equals", label: "Eşittir" },
    { value: "notEquals", label: "Eşit değildir" },
    { value: "isNull", label: "Boş" },
    { value: "isNotNull", label: "Boş değil" }
  ];

  if (!field) return common;
  if (isNumericField(field.type) || isDateField(field.type)) {
    return [
      ...common.slice(0, 2),
      { value: "greaterThan", label: "Büyüktür" },
      { value: "greaterThanOrEqual", label: "Büyük veya eşit" },
      { value: "lessThan", label: "Küçüktür" },
      { value: "lessThanOrEqual", label: "Küçük veya eşit" },
      ...common.slice(2)
    ];
  }

  return [
    ...common.slice(0, 2),
    { value: "contains", label: "İçerir" },
    { value: "startsWith", label: "İle başlar" },
    ...common.slice(2)
  ];
}

export function filterNeedsValue(operator: AttributeFilter["operator"]): boolean {
  return operator !== "isNull" && operator !== "isNotNull";
}

function stringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function numericLiteral(value: string): string {
  const normalized = value.replace(",", ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) throw new AttributeQueryValidationError("Sayısal alan için geçerli bir sayı girin.");
  return String(parsed);
}

function dateLiteral(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new AttributeQueryValidationError("Tarih alanı için geçerli bir tarih girin.");
  return `TIMESTAMP '${parsed.toISOString().replace("T", " ").replace("Z", "").slice(0, 23)}'`;
}

function isNumericField(type?: string): boolean {
  return /integer|small-integer|double|single|oid|int|float/i.test(type ?? "");
}

function isDateField(type?: string): boolean {
  return /date/i.test(type ?? "");
}
