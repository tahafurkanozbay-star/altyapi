import { readFile, writeFile } from "node:fs/promises";

const catalog = JSON.parse(await readFile("public/services.json", "utf8"));
const services = Array.isArray(catalog.services) ? catalog.services : [];
const TIMEOUT_MS = 15000;
const ATTEMPTS = 2;
const ANKARA_BBOX_4326 = "32.50,39.60,33.20,40.20";
const ANKARA_BBOX_130 = "39.60,32.50,40.20,33.20";

function addQuery(url, params) {
  const target = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) target.searchParams.set(key, String(value));
  }
  return target.toString();
}

async function fetchTimed(url, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const started = performance.now();
    try {
      const response = await fetch(url, {
        redirect: "follow",
        ...options,
        signal: controller.signal,
        headers: {
          "user-agent": "altyapi-service-verifier/1.0",
          "accept": "*/*",
          ...(options.headers ?? {})
        }
      });
      const durationMs = Math.round(performance.now() - started);
      clearTimeout(timer);
      return { response, durationMs, attempt };
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt < ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, 700));
    }
  }
  throw lastError;
}

async function jsonRequest(url) {
  const { response, durationMs, attempt } = await fetchTimed(url, { headers: { accept: "application/json,*/*" } });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = undefined; }
  return {
    ok: response.ok && data && !data.error,
    http: response.status,
    durationMs,
    attempt,
    data,
    contentType: response.headers.get("content-type") ?? "",
    bytes: Buffer.byteLength(text),
    error: data?.error?.message || (!response.ok ? `HTTP ${response.status}` : !data ? "JSON yanıtı alınamadı" : undefined)
  };
}

async function textRequest(url, accept = "*/*") {
  const { response, durationMs, attempt } = await fetchTimed(url, { headers: { accept } });
  const text = await response.text();
  return {
    ok: response.ok,
    http: response.status,
    durationMs,
    attempt,
    text,
    contentType: response.headers.get("content-type") ?? "",
    bytes: Buffer.byteLength(text)
  };
}

function safeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/[A-Za-z0-9_-]{50,}/g, "[redacted]")
    .slice(0, 180);
}

function wmsLayerName(xml) {
  const blocks = [...xml.matchAll(/<Layer(?:\s[^>]*)?>([\s\S]*?)<\/Layer>/gi)];
  for (const block of blocks) {
    const match = block[1].match(/<Name>([^<]+)<\/Name>/i);
    if (match?.[1] && match[1].trim().toUpperCase() !== "WMS") return match[1].trim();
  }
  return undefined;
}

function wfsTypeName(xml) {
  const match = xml.match(/<FeatureType(?:\s[^>]*)?>[\s\S]*?<Name>([^<]+)<\/Name>/i);
  return match?.[1]?.trim();
}

function capabilityVersion(xml, fallback) {
  return xml.match(/<(?:WMS_Capabilities|WMT_MS_Capabilities|WFS_Capabilities)[^>]*version=["']([^"']+)["']/i)?.[1] ?? fallback;
}

function isServiceException(text) {
  return /ServiceException|ExceptionReport|ExceptionText|ows:Exception/i.test(text);
}

async function probeWms(service) {
  const capsUrl = addQuery(service.tokenUrl, { service: "WMS", request: "GetCapabilities" });
  const caps = await textRequest(capsUrl, "application/xml,text/xml,*/*");
  const capsValid = caps.ok && !isServiceException(caps.text) && /WMS_Capabilities|WMT_MS_Capabilities/i.test(caps.text);
  if (!capsValid) {
    return { status: "FAIL", stage: "GetCapabilities", http: caps.http, metadataMs: caps.durationMs, note: `WMS capabilities geçersiz veya servis hatası` };
  }

  const layer = wmsLayerName(caps.text);
  if (!layer) {
    return { status: "PARTIAL", stage: "GetCapabilities", http: caps.http, metadataMs: caps.durationMs, note: "Capabilities erişilebilir fakat isimli katman bulunamadı" };
  }

  const version = capabilityVersion(caps.text, "1.3.0");
  const params = version.startsWith("1.3")
    ? { service: "WMS", request: "GetMap", version, layers: layer, styles: "", crs: "EPSG:4326", bbox: ANKARA_BBOX_130, width: 96, height: 96, format: "image/png", transparent: "true" }
    : { service: "WMS", request: "GetMap", version, layers: layer, styles: "", srs: "EPSG:4326", bbox: ANKARA_BBOX_4326, width: 96, height: 96, format: "image/png", transparent: "true" };
  const mapUrl = addQuery(service.tokenUrl, params);
  const { response, durationMs, attempt } = await fetchTimed(mapUrl, { headers: { accept: "image/png,image/*,*/*" } });
  const buffer = Buffer.from(await response.arrayBuffer());
  const type = response.headers.get("content-type") ?? "";
  const renderOk = response.ok && /^image\//i.test(type) && buffer.length > 100;
  return {
    status: renderOk ? "PASS" : "PARTIAL",
    stage: renderOk ? "GetCapabilities+GetMap" : "GetCapabilities",
    http: response.status,
    metadataMs: caps.durationMs,
    dataMs: durationMs,
    attempt,
    note: renderOk ? `WMS katmanı render edildi (${buffer.length} bayt)` : `Capabilities çalışıyor; GetMap doğrulanamadı (${type || "content-type yok"}, ${buffer.length} bayt)`
  };
}

async function probeWfs(service) {
  const capsUrl = addQuery(service.tokenUrl, { service: "WFS", request: "GetCapabilities" });
  const caps = await textRequest(capsUrl, "application/xml,text/xml,*/*");
  const capsValid = caps.ok && !isServiceException(caps.text) && /WFS_Capabilities/i.test(caps.text);
  if (!capsValid) {
    return { status: "FAIL", stage: "GetCapabilities", http: caps.http, metadataMs: caps.durationMs, note: "WFS capabilities geçersiz veya servis hatası" };
  }

  const typeName = wfsTypeName(caps.text);
  if (!typeName) {
    return { status: "PARTIAL", stage: "GetCapabilities", http: caps.http, metadataMs: caps.durationMs, note: "Capabilities erişilebilir fakat FeatureType bulunamadı" };
  }

  const version = capabilityVersion(caps.text, "2.0.0");
  const common = { service: "WFS", request: "GetFeature", version };
  const first = version.startsWith("2")
    ? addQuery(service.tokenUrl, { ...common, typeNames: typeName, count: 1, outputFormat: "application/json" })
    : addQuery(service.tokenUrl, { ...common, typeName, maxFeatures: 1, outputFormat: "application/json" });

  let data = await textRequest(first, "application/json,application/xml,text/xml,*/*");
  let valid = data.ok && !isServiceException(data.text) && data.bytes > 40;
  if (!valid) {
    const fallback = version.startsWith("2")
      ? addQuery(service.tokenUrl, { ...common, typeNames: typeName, count: 1 })
      : addQuery(service.tokenUrl, { ...common, typeName, maxFeatures: 1 });
    data = await textRequest(fallback, "application/xml,text/xml,*/*");
    valid = data.ok && !isServiceException(data.text) && data.bytes > 40;
  }

  return {
    status: valid ? "PASS" : "PARTIAL",
    stage: valid ? "GetCapabilities+GetFeature" : "GetCapabilities",
    http: data.http,
    metadataMs: caps.durationMs,
    dataMs: data.durationMs,
    note: valid ? `WFS örnek veri isteği yanıt verdi (${data.bytes} bayt)` : "Capabilities çalışıyor; GetFeature doğrulanamadı"
  };
}

function mapServiceRoot(url) {
  return url.replace(/\/MapServer\/\d+\/?$/i, "/MapServer");
}

function mapLayerId(url) {
  return url.match(/\/MapServer\/(\d+)\/?$/i)?.[1];
}

async function probeMapServer(service) {
  const meta = await jsonRequest(addQuery(service.tokenUrl, { f: "json" }));
  if (!meta.ok) {
    return { status: "FAIL", stage: "metadata", http: meta.http, metadataMs: meta.durationMs, note: meta.error ?? "MapServer metadata alınamadı" };
  }

  const root = mapServiceRoot(service.tokenUrl);
  const layerId = mapLayerId(service.tokenUrl);
  const exportUrl = addQuery(root + "/export", {
    bbox: ANKARA_BBOX_4326,
    bboxSR: 4326,
    imageSR: 4326,
    size: "128,128",
    format: "png32",
    transparent: "true",
    dpi: 96,
    ...(layerId ? { layers: `show:${layerId}` } : {}),
    f: "json"
  });
  const rendered = await jsonRequest(exportUrl);
  const imageHref = rendered.data?.href;
  if (rendered.ok && typeof imageHref === "string") {
    const { response, durationMs } = await fetchTimed(imageHref, { headers: { accept: "image/png,image/*,*/*" } });
    const bytes = Buffer.from(await response.arrayBuffer()).length;
    if (response.ok && bytes > 100) {
      return { status: "PASS", stage: "metadata+export", http: response.status, metadataMs: meta.durationMs, dataMs: rendered.durationMs + durationMs, note: `MapServer render çıktı (${bytes} bayt)` };
    }
  }

  return { status: "PARTIAL", stage: "metadata", http: rendered.http, metadataMs: meta.durationMs, dataMs: rendered.durationMs, note: "Metadata çalışıyor; export render doğrulanamadı" };
}

async function probeFeatureServer(service) {
  const meta = await jsonRequest(addQuery(service.tokenUrl, { f: "json" }));
  if (!meta.ok) {
    return { status: "FAIL", stage: "metadata", http: meta.http, metadataMs: meta.durationMs, note: meta.error ?? "FeatureServer metadata alınamadı" };
  }

  const queryUrl = service.tokenUrl.replace(/\/$/, "") + "/query";
  const query = await jsonRequest(addQuery(queryUrl, { where: "1=1", returnCountOnly: "true", f: "json" }));
  const valid = query.ok && Number.isFinite(query.data?.count);
  return {
    status: valid ? "PASS" : "PARTIAL",
    stage: valid ? "metadata+count-query" : "metadata",
    http: query.http,
    metadataMs: meta.durationMs,
    dataMs: query.durationMs,
    note: valid ? `FeatureServer sorgu sayımı: ${query.data.count}` : "Metadata çalışıyor; count query doğrulanamadı"
  };
}

async function probeSceneServer(service) {
  const meta = await jsonRequest(addQuery(service.tokenUrl, { f: "json" }));
  if (!meta.ok) {
    return { status: "FAIL", stage: "metadata", http: meta.http, metadataMs: meta.durationMs, note: meta.error ?? "SceneServer metadata alınamadı" };
  }

  const layerUrl = service.tokenUrl.replace(/\/$/, "") + "/layers/0";
  const layer = await jsonRequest(addQuery(layerUrl, { f: "json" }));
  return {
    status: layer.ok ? "PASS" : "PARTIAL",
    stage: layer.ok ? "metadata+scene-layer" : "metadata",
    http: layer.http,
    metadataMs: meta.durationMs,
    dataMs: layer.durationMs,
    note: layer.ok ? "SceneServer layer metadata doğrulandı" : "SceneServer root çalışıyor; layers/0 doğrulanamadı"
  };
}

async function probe(service) {
  try {
    switch (service.servisTuruAdi) {
      case "WMS": return await probeWms(service);
      case "WFS": return await probeWfs(service);
      case "MapServer": return await probeMapServer(service);
      case "FeatureServer": return await probeFeatureServer(service);
      case "SceneServer": return await probeSceneServer(service);
      default: return { status: "FAIL", stage: "type", note: "Desteklenmeyen servis türü" };
    }
  } catch (error) {
    return { status: "FAIL", stage: "network", note: safeError(error) };
  }
}

const results = [];
for (let index = 0; index < services.length; index++) {
  const service = services[index];
  const result = await probe(service);
  const row = {
    index: index + 1,
    name: service.cografiVeriKatmanAdi,
    kind: service.servisTuruAdi,
    organization: service.metaveriSahibiKurumAdi,
    ...result
  };
  results.push(row);
  console.log(`[${String(index + 1).padStart(2, "0")}/${services.length}] ${row.status.padEnd(7)} ${row.kind.padEnd(13)} ${row.name} :: ${row.note}`);
}

const summary = {
  checkedAt: new Date().toISOString(),
  total: results.length,
  pass: results.filter((item) => item.status === "PASS").length,
  partial: results.filter((item) => item.status === "PARTIAL").length,
  fail: results.filter((item) => item.status === "FAIL").length,
  results
};
await writeFile("service-probe-report.json", JSON.stringify(summary, null, 2) + "\n", "utf8");
console.log("\nSUMMARY " + JSON.stringify({ total: summary.total, pass: summary.pass, partial: summary.partial, fail: summary.fail }));
if (summary.fail > 0) process.exitCode = 2;
