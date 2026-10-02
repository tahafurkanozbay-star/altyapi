const SENSITIVE_OR_TECHNICAL_ERROR = /(?:https?:\/\/|\b(?:token|authorization|bearer|api[_-]?key|credential|ucbp|stack|TypeError|ReferenceError|SyntaxError|AbortError|NetworkError|Failed to fetch|fetch failed|ECONN|ERR_[A-Z_]+)\b|[?&](?:token|key|api[_-]?key|access_token)=)/i;

/**
 * Converts an unknown failure into text that is safe and useful on citizen-facing
 * surfaces. Technical diagnostics stay in the incident journal / console; URLs,
 * credentials and implementation exceptions are never reflected back to the UI.
 */
export function publicErrorMessage(reason: unknown, fallback: string): string {
  const safeFallback = normalize(fallback).slice(0, 180) || "İşlem şu anda tamamlanamadı.";
  const raw = reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "";
  const message = normalize(raw);

  if (!message || SENSITIVE_OR_TECHNICAL_ERROR.test(message)) return safeFallback;
  return message.slice(0, 180);
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
