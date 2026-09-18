import { sanitizePreferences } from "./storage";
import type { AppPreferences, WorkspaceDocument } from "../types";

const MAX_WORKSPACE_BYTES = 1_000_000;

export function createWorkspaceDocument(preferences: AppPreferences, applicationVersion: string): WorkspaceDocument {
  return {
    schema: "baskent-3b-workspace",
    version: 1,
    exportedAt: new Date().toISOString(),
    applicationVersion,
    preferences: sanitizePreferences({ ...preferences, theme: "light" })
  };
}

export function serializeWorkspace(preferences: AppPreferences, applicationVersion: string): string {
  return JSON.stringify(createWorkspaceDocument(preferences, applicationVersion), null, 2);
}

export function parseWorkspace(text: string): WorkspaceDocument {
  if (new TextEncoder().encode(text).byteLength > MAX_WORKSPACE_BYTES) {
    throw new Error("Çalışma alanı dosyası 1 MB sınırını aşıyor.");
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Çalışma alanı dosyası geçerli JSON değil.");
  }

  if (!value || typeof value !== "object") throw new Error("Çalışma alanı belgesi geçersiz.");
  const input = value as Record<string, unknown>;
  if (input.schema !== "baskent-3b-workspace" || input.version !== 1) {
    throw new Error("Desteklenmeyen çalışma alanı biçimi.");
  }

  const preferences = sanitizePreferences(input.preferences);
  preferences.theme = "light";
  return {
    schema: "baskent-3b-workspace",
    version: 1,
    exportedAt: typeof input.exportedAt === "string" && !Number.isNaN(Date.parse(input.exportedAt))
      ? input.exportedAt
      : new Date().toISOString(),
    applicationVersion: typeof input.applicationVersion === "string" ? input.applicationVersion.slice(0, 40) : "unknown",
    preferences
  };
}
