import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const catalog = JSON.parse(await readFile(resolve("public/services.json"), "utf8"));
const services = Array.isArray(catalog.services) ? catalog.services : [];
const TIMEOUT_MS = 16_000;
const BASE_MAP_SCALES = [100_000, 200_000, 300_000, 400_000, 500_000, 600_000, 800_000, 1_000_000, 1_500_000, 2_000_000, 3_000_000];
const BASE_WMS_SCALES = [25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_000_000, 3_000_000];
const ANKARA = { longitude: 32.8542, latitude: 39.9208 };
const WEB_MERCATOR_INITIAL_SCALE = 591_657_527.591555;

function addQuery(url, params) {
  const target = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) target.searchParams.set(key, String(value));
  }
  return target.toString();
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? TIMEOUT_MS);
  const started = performance.now();
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: options.accept ?? "*/*",
        "User-Agent": "altyapi-scale-verification/1.0"
      }
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      ok: response.ok,
      status: response.status,
      ms: Math.round(performance.now() - started),
      type: response.headers.get("content-type") ?? "",
      text: options.text === false ? "" : new TextDecoder().decode(bytes),
      size: bytes.byteLength
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      ms: Math.round(performance.now() - started),
      type: "",
      text: "",
      size: 0,
      error: error instanceof Error ? error.name : "network-error"
    };
  } finally {
    clearTimeout(timer);
  }
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function positiveScale(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

function scaleToApproxZoom(scale) {
  if (!Number.isFinite(scale) || scale <= 0) return undefined;
  return Number(Math.log2(WEB_MERCATOR_INITIAL_SCALE / scale).toFixed(2));
}

function mapServerParts(url) {
  const match = url.match(/^(.*\/MapServer)(?:\/(\d+))?\/?$/i);
  return match ? { root: match[1], sublayerId: match[2] === undefined ? undefined : Number(match[2]) } : { root: url };
}

function lonLatToWebMercator(longitude, latitude) {
  const x = longitude * 20037508.34 / 180;
  const y = Math.log(Math.tan((90 + latitude) * Math.PI / 360)) / (Math.PI / 180) * 20037508.34 / 180;
  return { x, y };
}

function bboxForScale(scale, center = ANKARA) {
  const metersPerPixel = scale * 0.0254 / 96;
  const half = metersPerPixel * 256 / 2;
  const mercator = lonLatToWebMercator(center.longitude, center.latitude);
  return [mercator.x - half, mercator.y - half, mercator.x + half, mercator.y + half].map((n) => n.toFixed(3)).join(",");
}

async function arcgisMetadata(service) {
  const response = await request(addQuery(service.tokenUrl, { f: "json" }), { accept: "application/json,*/*" });
  const data = response.ok ? parseJson(response.text) : null;
  return { response, data };
}

async function verifyMapRender(service, scale) {
  const { root, sublayerId } = mapServerParts(service.tokenUrl);
  const exportUrl = addQuery(`${root}/export`, {
    bbox: bboxForScale(scale),
    bboxSR: 3857,
    imageSR: 3857,
    size: "256,256",
    dpi: 96,
    format: "png32",
    transparent: "true",
    layers: sublayerId === undefined ? undefined : `show:${sublayerId}`,
    f: "json"
  });
  const metadata = await request(exportUrl, { accept: "application/json,*/*" });
  const json = metadata.ok ? parseJson(metadata.text) : null;
  if (!metadata.ok || !json?.href) {
    return { scale, zoom: scaleToApproxZoom(scale), ok: false, ms: metadata.ms, stage: "export", status: metadata.status };
  }
  const image = await request(json.href, { accept: "image/*,*/*", text: false });
  return {
    scale,
    zoom: scaleToApproxZoom(scale),
    ok: image.ok && image.size > 64 && /^image\//i.test(image.type),
    ms: metadata.ms + image.ms,
    stage: "image",
    status: image.status
  };
}

async function repeatedMapRender(service, scale, attempts = 2) {
  const samples = [];
  for (let i = 0; i < attempts; i += 1) samples.push(await verifyMapRender(service, scale));
  return {
    scale,
    zoom: scaleToApproxZoom(scale),
    ok: samples.every((sample) => sample.ok),
    ms: Math.max(...samples.map((sample) => sample.ms)),
    attempts: samples.length
  };
}

async function refineFarBoundary(service, tested) {
  const ordered = [...tested].sort((a, b) => a.scale - b.scale);
  let lastSuccess;
  let firstFailure;
  for (const item of ordered) {
    if (item.ok && !firstFailure) lastSuccess = item;
    if (!item.ok && lastSuccess) { firstFailure = item; break; }
  }
  if (!lastSuccess || !firstFailure) return { tested, boundary: lastSuccess?.scale };

  let low = lastSuccess.scale;
  let high = firstFailure.scale;
  const refined = [...tested];
  while (high - low > 50_000) {
    const mid = Math.round(((low + high) / 2) / 25_000) * 25_000;
    if (mid <= low || mid >= high) break;
    const result = await repeatedMapRender(service, mid, 2);
    refined.push(result);
    if (result.ok) low = mid;
    else high = mid;
  }
  return { tested: refined.sort((a, b) => a.scale - b.scale), boundary: low };
}

function parseWmsLayerName(xml) {
  const matches = [...xml.matchAll(/<Name>([^<]+)<\/Name>/gi)].map((match) => match[1]?.trim()).filter(Boolean);
  return matches[1] ?? matches[0];
}

function parseWmsScaleBounds(xml) {
  const min = xml.match(/<MinScaleDenominator>([^<]+)<\/MinScaleDenominator>/i);
  const max = xml.match(/<MaxScaleDenominator>([^<]+)<\/MaxScaleDenominator>/i);
  return { minScale: positiveScale(max?.[1]), maxScale: positiveScale(min?.[1]) };
}

async function verifyWmsRender(service, layerName, scale) {
  const response = await request(addQuery(service.tokenUrl, {
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetMap",
    LAYERS: layerName,
    STYLES: "",
    CRS: "EPSG:3857",
    BBOX: bboxForScale(scale),
    WIDTH: 256,
    HEIGHT: 256,
    FORMAT: "image/png",
    TRANSPARENT: "TRUE"
  }), { accept: "image/png,image/*,*/*", text: false });
  return {
    scale,
    zoom: scaleToApproxZoom(scale),
    ok: response.ok && response.size > 64 && /^image\//i.test(response.type),
    ms: response.ms,
    status: response.status
  };
}

async function probeWms(service, index) {
  const caps = await request(addQuery(service.tokenUrl, { SERVICE: "WMS", VERSION: "1.3.0", REQUEST: "GetCapabilities" }), { accept: "application/xml,text/xml,*/*" });
  if (!caps.ok || !/WMS_Capabilities|WMT_MS_Capabilities/i.test(caps.text)) {
    return baseResult(service, index, "unreachable", { note: `WMS GetCapabilities başarısız (${caps.status || caps.error || "network"}).` });
  }
  const layerName = parseWmsLayerName(caps.text);
  const declared = parseWmsScaleBounds(caps.text);
  const tests = [];
  if (layerName) {
    for (const scale of BASE_WMS_SCALES) tests.push(await verifyWmsRender(service, layerName, scale));
  }
  const successful = tests.filter((test) => test.ok).map((test) => test.scale);
  return baseResult(service, index, "verified", {
    minScale: declared.minScale,
    maxScale: declared.maxScale,
    testedScales: tests,
    note: declared.minScale || declared.maxScale
      ? "WMS görünürlük ölçeği GetCapabilities metadata'sından alındı; seçili ölçeklerde canlı GetMap denendi."
      : successful.length
        ? "WMS GetCapabilities ve canlı GetMap başarılı; servis ölçek sınırı ilan etmiyor."
        : "WMS GetCapabilities başarılı; canlı GetMap örnekleri doğrulanamadı."
  });
}

async function probeWfs(service, index) {
  const caps = await request(addQuery(service.tokenUrl, { SERVICE: "WFS", VERSION: "2.0.0", REQUEST: "GetCapabilities" }), { accept: "application/xml,text/xml,*/*" });
  if (!caps.ok || !/WFS_Capabilities/i.test(caps.text)) {
    return baseResult(service, index, "unreachable", { note: `WFS GetCapabilities başarısız (${caps.status || caps.error || "network"}).` });
  }
  return baseResult(service, index, "scale-independent", { note: "WFS veri sorgu protokolüdür; GetCapabilities başarılı ve zoom görünürlük sınırı ilan etmez." });
}

async function probeMapServer(service, index) {
  const { response, data } = await arcgisMetadata(service);
  if (!response.ok || !data || data.error) {
    return baseResult(service, index, "unreachable", { note: `MapServer metadata başarısız (${response.status || response.error || "network"}).` });
  }
  const declaredMin = positiveScale(data.minScale);
  const declaredMax = positiveScale(data.maxScale);
  const tests = [];

  if (declaredMin || declaredMax) {
    const candidates = new Set([
      declaredMax ? Math.max(250, Math.round(declaredMax * 0.8)) : 1_000,
      declaredMax,
      declaredMax ? Math.round(declaredMax * 1.25) : 5_000,
      declaredMin ? Math.round(declaredMin * 0.8) : 250_000,
      declaredMin,
      declaredMin ? Math.round(declaredMin * 1.2) : 500_000
    ].filter(Boolean));
    for (const scale of [...candidates].sort((a, b) => a - b)) tests.push(await verifyMapRender(service, scale));
    return baseResult(service, index, "verified", {
      minScale: declaredMin,
      maxScale: declaredMax,
      recommendedScale: declaredMin ? Math.round(declaredMin * 0.75) : undefined,
      testedScales: tests,
      note: "ArcGIS metadata ölçek sınırı esas alındı; sınır çevresinde canlı export denendi."
    });
  }

  for (const scale of BASE_MAP_SCALES) {
    const test = await verifyMapRender(service, scale);
    tests.push(test);
    const recent = tests.slice(-2);
    if (recent.length === 2 && recent.every((item) => !item.ok) && tests.some((item) => item.ok)) break;
  }
  const refined = await refineFarBoundary(service, tests);
  const boundary = refined.boundary;
  const safeMinScale = boundary ? Math.max(25_000, Math.floor(boundary * 0.95 / 25_000) * 25_000) : undefined;
  return baseResult(service, index, boundary ? "verified" : "unreachable", {
    minScale: safeMinScale,
    recommendedScale: safeMinScale ? Math.round(safeMinScale * 0.75) : undefined,
    testedScales: refined.tested,
    note: boundary
      ? `Canlı 256×256 export iki aşamalı ölçek taramasıyla doğrulandı; güvenli uzak ölçek sınırı 1:${safeMinScale.toLocaleString("tr-TR")}.`
      : "MapServer metadata erişilebilir ancak canlı export doğrulanamadı."
  });
}

async function probeFeatureServer(service, index) {
  const { response, data } = await arcgisMetadata(service);
  if (!response.ok || !data || data.error) {
    return baseResult(service, index, "unreachable", { note: `FeatureServer metadata başarısız (${response.status || response.error || "network"}).` });
  }
  const count = await request(addQuery(service.tokenUrl.replace(/\/$/, "") + "/query", { where: "1=1", returnCountOnly: "true", f: "json" }), { accept: "application/json,*/*" });
  const countData = count.ok ? parseJson(count.text) : null;
  const queryOk = count.ok && Number.isFinite(countData?.count);
  return baseResult(service, index, queryOk ? "verified" : "metadata-only", {
    minScale: positiveScale(data.minScale),
    maxScale: positiveScale(data.maxScale),
    note: queryOk
      ? "FeatureServer metadata ve kayıt sayımı doğrulandı; varsa server minScale/maxScale uygulanır."
      : "FeatureServer metadata erişilebilir, kayıt sayımı doğrulanamadı; yalnız ilan edilen ölçek sınırı kullanılabilir."
  });
}

async function probeSceneServer(service, index) {
  let target = service.tokenUrl.replace(/\/$/, "");
  if (!/\/layers\/\d+$/i.test(target)) target += "/layers/0";
  const response = await request(addQuery(target, { f: "json" }), { accept: "application/json,*/*" });
  const data = response.ok ? parseJson(response.text) : null;
  if (!response.ok || !data || data.error) {
    return baseResult(service, index, "unreachable", { note: `SceneServer metadata başarısız (${response.status || response.error || "network"}).` });
  }
  return baseResult(service, index, "verified", {
    minScale: positiveScale(data.minScale),
    maxScale: positiveScale(data.maxScale),
    note: positiveScale(data.minScale) || positiveScale(data.maxScale)
      ? "Scene layer metadata ölçek sınırı doğrulandı."
      : "Scene layer metadata erişilebilir ve ölçek sınırı ilan etmiyor."
  });
}

function baseResult(service, index, status, extra = {}) {
  const minScale = extra.minScale;
  const maxScale = extra.maxScale;
  return {
    index,
    name: service.cografiVeriKatmanAdi,
    kind: service.servisTuruAdi,
    status,
    minScale,
    maxScale,
    approxMinZoom: minScale ? scaleToApproxZoom(minScale) : undefined,
    approxMaxZoom: maxScale ? scaleToApproxZoom(maxScale) : undefined,
    recommendedScale: extra.recommendedScale,
    testedScales: extra.testedScales,
    note: extra.note
  };
}

async function probe(service, index) {
  if (service.servisTuruAdi === "WMS") return probeWms(service, index);
  if (service.servisTuruAdi === "WFS") return probeWfs(service, index);
  if (service.servisTuruAdi === "MapServer") return probeMapServer(service, index);
  if (service.servisTuruAdi === "FeatureServer") return probeFeatureServer(service, index);
  if (service.servisTuruAdi === "SceneServer") return probeSceneServer(service, index);
  return baseResult(service, index, "unsupported", { note: "Desteklenmeyen servis türü." });
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      const result = await mapper(items[index], index);
      results[index] = result;
      const range = result.minScale || result.maxScale
        ? ` · scale ${result.minScale ?? "∞"}→${result.maxScale ?? 0}`
        : " · scale unbounded/unknown";
      console.log(`[${String(index + 1).padStart(2, "0")}/${items.length}] ${result.status.padEnd(17)} ${result.kind.padEnd(13)} ${result.name}${range}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

const results = await mapWithConcurrency(services, 2, probe);
const report = {
  schemaVersion: 1,
  verifiedAt: new Date().toISOString(),
  scaleModel: "ArcGIS view.scale; approximate zoom uses 591657527.591555 / 2^z",
  services: results
};

await writeFile(resolve("service-scale-probe.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
console.log("SCALE_PROBE_JSON_BEGIN");
console.log(JSON.stringify(report));
console.log("SCALE_PROBE_JSON_END");
