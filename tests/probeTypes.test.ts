import { describe, expect, it } from "vitest";
import { networkErrorCode, parseRemoteMetadata } from "../scripts/probeTypes";

describe("typed probe boundaries", () => {
  it("rejects primitive and malformed remote JSON", () => {
    expect(parseRemoteMetadata('[]')).toBeUndefined();
    expect(parseRemoteMetadata('"error"')).toBeUndefined();
    expect(parseRemoteMetadata('{')).toBeUndefined();
  });
  it("retains scale evidence without copying endpoints or credentials", () => {
    const result = parseRemoteMetadata(JSON.stringify({ minScale: 400000, layers:[null, {id:0,minScale:250000,token:'secret',url:'https://protected.example'}], token:'secret', url:'https://protected.example' }));
    expect(result?.minScale).toBe(400000);
    expect(result?.layers).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(JSON.stringify(result)).not.toContain('protected.example');
  });
  it("keeps only bounded coarse network codes", () => {
    expect(networkErrorCode(new Error('contains sensitive url', {cause:{code:'ETIMEDOUT'}}))).toBe('ETIMEDOUT');
    expect(networkErrorCode(new Error('contains sensitive url', {cause:{code:'https://secret.example/token'}}))).toBe('Error');
  });
});
