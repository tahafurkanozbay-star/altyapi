export class ResponseSizeLimitError extends Error {
  readonly maxBytes: number;

  constructor(maxBytes: number) {
    super(`Response exceeded ${maxBytes} byte limit`);
    this.name = "ResponseSizeLimitError";
    this.maxBytes = maxBytes;
  }
}

/** Reads a text response with a hard byte ceiling so malformed/upstream responses
 * cannot force an unbounded XML/JSON allocation before validation. */
export async function readResponseTextLimited(response: Response, maxBytes: number): Promise<string> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new RangeError("maxBytes must be a positive integer");

  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new ResponseSizeLimitError(maxBytes);
  }

  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) throw new ResponseSizeLimitError(maxBytes);
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel("response-size-limit").catch(() => undefined);
        throw new ResponseSizeLimitError(maxBytes);
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join("");
  } finally {
    reader.releaseLock();
  }
}
