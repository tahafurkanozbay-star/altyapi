import { readFile } from "node:fs/promises";

const services = JSON.parse(await readFile("public/services.json", "utf8")).services;
const TIMEOUT = 12000;

async function fetchCheck(url, accept = "*/*") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  const started = performance.now();
  try {
    const response = await fetch(url, { redirect: "follow", signal: controller.signal, headers: { accept, "user-agent": "altyapi-fallback-verifier/1.0" } });
    const text = await response.text();
    return { ok: response.ok, http: response.status, ms: Math.round(performance.now() - started), text, type: response.headers.get("content-type") ?? "" };
  } catch (error) {
    const code = error?.cause?.code ? String(error.cause.code) : "";
    return { ok: false, http: 0, ms: Math.round(performance.now() - started), text: "", type: "", error: code || error?.message || "network error" };
  } finally {
    clearTimeout(timer);
  }
}

function addQuery(url, params) {
  const target = new URL(url);
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, String(value));
  return target.toString();
}

function directAbbUrl(url) {
  const target = new URL(url);
  const match = target.pathname.match(/^\/portal\/sharing\/servers\/[^/]+\/rest\/services\/(.+)$/i);
  if (!match) return null;
  target.pathname = "/server/rest/services/" + match[1];
  target.search = "";
  return target.toString();
}

function hint(text) {
  return String(text ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().replace(/[A-Za-z0-9_-]{48,}/g, "[redacted]").slice(0, 120);
}

console.log("UCBP explicit-version fallback:");
for (const [i, service] of services.slice(0, 10).entries()) {
  const isWms = service.servisTuruAdi === "WMS";
  const url = addQuery(service.tokenUrl, {
    SERVICE: service.servisTuruAdi,
    VERSION: isWms ? "1.3.0" : "2.0.0",
    REQUEST: "GetCapabilities"
  });
  const result = await fetchCheck(url, "application/xml,text/xml,*/*");
  const valid = result.ok && (isWms ? /WMS_Capabilities|WMT_MS_Capabilities/i : /WFS_Capabilities/i).test(result.text);
  console.log(`[${i + 1}] ${valid ? "PASS" : "FAIL"} ${service.servisTuruAdi} ${service.cografiVeriKatmanAdi} HTTP=${result.http} ms=${result.ms} hint=${hint(result.text) || result.error || "empty"}`);
}

console.log("\nABB direct-server fallback:");
for (const [offset, service] of services.slice(10, 16).entries()) {
  const direct = directAbbUrl(service.tokenUrl);
  if (!direct) {
    console.log(`[${offset + 11}] SKIP ${service.cografiVeriKatmanAdi} direct-url türetilemedi`);
    continue;
  }
  const result = await fetchCheck(addQuery(direct, { f: "json" }), "application/json,*/*");
  let data;
  try { data = JSON.parse(result.text); } catch {}
  const valid = result.ok && data && !data.error;
  console.log(`[${offset + 11}] ${valid ? "PASS" : "FAIL"} ${service.cografiVeriKatmanAdi} HTTP=${result.http} ms=${result.ms} ${valid ? "metadata-ok" : (data?.error?.message || result.error || hint(result.text) || "empty")}`);
}
