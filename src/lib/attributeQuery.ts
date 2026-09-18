import type { AttributeField, AttributeFilter, AttributeQueryOptions } from "../types";

export function sanitizeQueryOptions(options: AttributeQueryOptions): AttributeQueryOptions {
  return {
    limit: Math.min(500, Math.max(1, Math.trunc(options.limit || 100))),
    offset: Math.max(0, Math.trunc(options.offset || 0)),
    filter: options.filter,
    orderBy: options.orderBy
  };
}

export function buildWhereClause(filter: AttributeFilter | undefined, fields: AttributeField[]): string {
  if (!filter) return "1=1";
  const field = fields.find((candidate) => candidate.name === filter.field);
  if (!field) throw new Error("Filtre alanı bu serviste bulunamadı.");

  if (filter.operator === "isNull") return `${field.name} IS NULL`;
  if (filter.operator === "isNotNull") return `${field.name} IS NOT NULL`;

  const value = (filter.value ?? "").trim();
  if (!value) throw new Error("Filtre değeri boş bırakılamaz.");

  const numeric = isNumericField(field.type);
  const date = isDateField(field.type);
  const literal = numeric
    ? numericLiteral(value)
    : date
      ? dateLiteral(value)
      : stringLiteral(value);

  switch (filter.operator) {
    case "equals":
      return `${field.name} = ${literal}`;
    case "notEquals":
      return `${field.name} <> ${literal}`;
    case "greaterThan":
      return `${field.name} > ${literal}`;
    case "greaterThanOrEqual":
      return `${field.name} >= ${literal}`;
    case "lessThan":
      return `${field.name} < ${literal}`;
    case "lessThanOrEqual":
      return `${field.name} <= ${literal}`;
    case "contains":
      if (numeric || date) throw new Error("Bu alan türünde 'içerir' filtresi kullanılamaz.");
      return `${field.name} LIKE ${stringLiteral(`%${value}%`)}`;
    case "startsWith":
      if (numeric || date) throw new Error("Bu alan türünde 'ile başlar' filtresi kullanılamaz.");
      return `${field.name} LIKE ${stringLiteral(`${value}%`)}`;
    default:
      return "1=1";
  }
}

export function buildOrderBy(orderBy: AttributeQueryOptions["orderBy"], fields: AttributeField[]): string | undefined {
  if (!orderBy) return undefined;
  const field = fields.find((candidate) => candidate.name === orderBy.field);
  if (!field) throw new Error("Sıralama alanı bu serviste bulunamadı.");
  return `${field.name} ${orderBy.direction === "desc" ? "DESC" : "ASC"}`;
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
  if (!Number.isFinite(parsed)) throw new Error("Sayısal alan için geçerli bir sayı girin.");
  return String(parsed);
}

function dateLiteral(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("Tarih alanı için geçerli bir tarih girin.");
  return `TIMESTAMP '${parsed.toISOString().replace("T", " ").replace("Z", "").slice(0, 23)}'`;
}

function isNumericField(type?: string): boolean {
  return /integer|small-integer|double|single|oid|int|float/i.test(type ?? "");
}

function isDateField(type?: string): boolean {
  return /date/i.test(type ?? "");
}
