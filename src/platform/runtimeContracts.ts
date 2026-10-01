export type UnknownRecord = Record<string, unknown>;

export function asRecord(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : undefined;
}

export function readArray(record: UnknownRecord, key: string): unknown[] | undefined {
  const value = record[key];
  return Array.isArray(value) ? value : undefined;
}

export function readString(
  record: UnknownRecord,
  key: string,
  options: { trim?: boolean; nonEmpty?: boolean; maxLength?: number } = {}
): string | undefined {
  const value = record[key];
  if (typeof value !== "string") return undefined;
  const normalized = options.trim ? value.trim() : value;
  if (options.nonEmpty && !normalized) return undefined;
  if (options.maxLength && normalized.length > options.maxLength) return normalized.slice(0, options.maxLength);
  return normalized;
}

export function readBoolean(record: UnknownRecord, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

export function readNullableBoolean(record: UnknownRecord, key: string): boolean | null | undefined {
  const value = record[key];
  if (value === null) return null;
  return typeof value === "boolean" ? value : undefined;
}

export function readFiniteNumber(
  record: UnknownRecord,
  key: string,
  options: { min?: number; max?: number; integer?: boolean } = {}
): number | undefined {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (options.integer && !Number.isInteger(value)) return undefined;
  if (options.min !== undefined && value < options.min) return undefined;
  if (options.max !== undefined && value > options.max) return undefined;
  return value;
}

export function readIsoDate(record: UnknownRecord, key: string): string | undefined {
  const value = readString(record, key, { nonEmpty: true });
  return value && !Number.isNaN(Date.parse(value)) ? value : undefined;
}

export function readEnum<const T extends string>(
  record: UnknownRecord,
  key: string,
  allowed: ReadonlySet<T>
): T | undefined {
  const value = record[key];
  return typeof value === "string" && allowed.has(value as T) ? value as T : undefined;
}

export function hasOwn(record: UnknownRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}
