import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const catalog = JSON.parse(await readFile(resolve("public/services.json"), "utf8"));
const services = Array.isArray(catalog.services) ? catalog.services : [];
const TIMEOUT_MS = 16_000;
const MAP_SCALES = [
  500, 1_000, 2_000, 5_000, 10_000, 25_000, 50_000, 100_000,
  200_000, 300_000, 400_000, 500_000, 600_000, 800_000, 1_000_000,
  1_500_000, 2_000_000, 3_000_000
];
const WMS_SCALES = [1_000, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_000_000, 3_000_000];
const ANKARA = { longitude: 32.8542, latitude: 39.9208 };
const WEB_MERCATOR_INITIAL_SCALE = 591_657_527.591555;

function addQuery(url, params) {
  const target = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) target.searchParams.set(key, String(value));
  }
  return target.toString();
}

async function request(url, accept = "*/*") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = performance.now();
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { Accept: accept, "User-Agent": "altyapi-scale-verification/2.0" }
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      ms: Math.round(performance.now() - started),
      type: response.headers.get("content-type") ?? "",
      text
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      ms: Math.round(performance.now() - started),
      type: "",
      text: "",
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
  const scale = Number(value);
  return Number.isFinite(scale) && scale > 0 ? Math.round(scale) : undefined;
}

function scaleToApproxZoom(scale) {
  if (!Number.isFinite(scale) || scale <= 0) return undefined;
  return Number(Math.log2(WEB_MERCATOR_INITIAL_SCALE / scale).toFixed(2));
}

function mapServerParts(url) {
  const match = url.match(/^(.*\/MapServer)(?:\/(\d+))?\/?$/i);
  return match
    ? { root: match[1], sublayerId: match[2] === undefined ? undefined : Number(match[2]) }
    : { root: url, sublayerId: undefined };
}

function lonLatToWebMercator(longitude, latitude) {
  const x = longitude * 20037508.34 / 180;
  const y = Math.log(Math.tan((90 + latitude) * Math.PI / 360)) / (Math.PI / 180) * 20037508.34 / 180;
  return { x, y };
}

function bboxForScale(scale) {
  const metersPerPixel = scale * 0.0254 / 96;
  const half = metersPerPixel * 256 / 2;
  const center = lonLatToWebMercator(ANKARA.longitude, ANKARA.latitude);
  return [center.x - half, center.y - half, center.x + half, center.y + half]
    .map((value) => value.toFixed(3))
    .join(",");
}

async function metadata(service) {
  const response = await request(addQuery(service.tokenUrl, { f: "json" }), "application/json,*/*");
  return { response, data: response.ok ? parseJson(response.text) : null };
}

async function verifyMapExport(service, scale) {
  const { root, sublayerId } = mapServerParts(service.tokenUrl);
  const response = await request(addQuery(`${root}/export`, {
    bbox: bboxForScale(scale),
    bboxSR: 3857,
    imageSR: 3857,
    size: "256,256",
    dpi: 96,
    format: "png32",
    transparent: "true",
    layers: sublayerId === undefined ? undefined : `show:${sublayerId}`,
    f: "json"
  }), "application/json,*/*");
  const data = response.ok ? parseJson(response.text) : null;
  const ok = response.ok && typeof data?.href === "string" && data.href.length > 0 && !data?.error;
  return { scale, zoom: scaleToApproxZoom(scale), ok, ms: response.ms, status: response.status };
}

function verifiedScaleEnvelope(tests) {
  const successful = tests.filter((item) => item.ok).map((item) => item.scale).sort((a, b) => a - b);
  if (!successful.length) return {};
  return {
    maxScale: successful[0],
    minScale: successful[successful.length - 1]
  };
}

function parseWmsLayerName(xml) {
  const matches = [...xml.matchAll(/<Name>([^<]+)<\/Name>/gi)]
    .map((match) => match[1]?.trim())
    .filter(Boolean);
  return matches[1] ?? matches[0];
}

function parseWmsScaleBounds(xml) {
  const min = xml.match(/<MinScaleDenominator>([^<]+)<\/MinScaleDenominator>/i);
  const max = xml.match(/<MaxScaleDenominator>([^<]+)<\/MaxScaleDenominator>/i);
  return { minScale: positiveScale(max?.[1]), maxScale: positiveScale(min?.[1]) };
}

async function verifyWms(service, layerName, scale) {
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
  }), "image/png,image/*,*/*");
  const ok = response.ok && /^image\//i.test(response.type);
  return { scale, zoom: scaleToApproxZoom(scale), ok, ms: response.ms, status: response.status };
}

async function probeWms(service, index) {
  const caps = await request(addQuery(service.tokenUrl, {
    SERVICE: "WMS", VERSION: "1.3.0", REQUEST: "GetCapabilities"
  }), "application/xml,text/xml,*/*");
  if (!caps.ok || !/WMS_Capabilities|WMT_MS_Capabilities/i.test(caps.text)) {
    return result(service, index, "unreachable", { note: `WMS GetCapabilities başarısız (${caps.status || caps.error || "network"}).` });
  }

  const declared = parseWmsScaleBounds(caps.text);
  const layerName = parseWmsLayerName(caps.text);
  const tests = [];
  if (layerName) {
    for (const scale of WMS_SCALES) tests.push(await verifyWms(service, layerName, scale));
  }
  const envelope = verifiedScaleEnvelope(tests);
  return result(service, index, "verified", {
    minScale: declared.minScale ?? envelope.minScale,
    maxScale: declared.maxScale ?? envelope.maxScale,
    testedScales: tests,
    note: declared.minScale || declared.maxScale
      ? "GetCapabilities ölçek sınırı ve canlı GetMap örnekleri doğrulandı."
      : "Canlı GetMap taramasıyla doğrulanmış ölçek zarfı çıkarıldı."
  });
}

async function probeWfs(service, index) {
  const caps = await request(addQuery(service.tokenUrl, {
    SERVICE: "WFS", VERSION: "2.0.0", REQUEST: "GetCapabilities"
  }), "application/xml,text/xml,*/*");
  if (!caps.ok || !/WFS_Capabilities/i.test(caps.text)) {
    return result(service, index, "unreachable", { note: `WFS GetCapabilities başarısız (${caps.status || caps.error || "network"}).` });
  }
  return result(service, index, "scale-independent", {
    note: "WFS bir veri sorgu protokolüdür; zoom görünürlük sınırı yoktur."
  });
}

async function probeMapServer(service, index) {
  const { response, data } = await metadata(service);
  if (!response.ok || !data || data.error) {
    return result(service, index, "unreachable", { note: `MapServer metadata başarısız (${response.status || response.error || "network"}).` });
  }

  const declaredMin = positiveScale(data.minScale);
  const declaredMax = positiveScale(data.maxScale);
  const tests = [];
  for (const scale of MAP_SCALES) tests.push(await verifyMapExport(service, scale));
  const envelope = verifiedScaleEnvelope(tests);

  if (!envelope.minScale || !envelope.maxScale) {
    return result(service, index, "metadata-only", {
      minScale: declaredMin,
      maxScale: declaredMax,
      testedScales: tests,
      note: "Metadata erişilebilir ancak canlı export ölçek zarfı doğrulanamadı."
    });
  }

  return result(service, index, "verified", {
    minScale: declaredMin ?? envelope.minScale,
    maxScale: declaredMax ?? envelope.maxScale,
    recommendedScale: chooseRecommendedScale(declaredMin ?? envelope.minScale, declaredMax ?? envelope.maxScale),
    testedScales: tests,
    note: declaredMin || declaredMax
      ? "ArcGIS metadata sınırı esas alındı; 18 ölçek noktasında canlı export üretimi ayrıca denendi."
      : "18 ölçek noktasında canlı export üretimi tarandı; yalnız doğrulanmış ölçek zarfı güvenli çalışma aralığına alındı."
  });
}

async function probeFeatureServer(service, index) {
  const { response, data } = await metadata(service);
  if (!response.ok || !data || data.error) {
    return result(service, index, "unreachable", { note: `FeatureServer metadata başarısız (${response.status || response.error || "network"}).` });
  }
  const count = await request(addQuery(service.tokenUrl.replace(/\/$/, "") + "/query", {
    where: "1=1", returnCountOnly: "true", f: "json"
  }), "application/json,*/*");
  const countData = count.ok ? parseJson(count.text) : null;
  const queryOk = count.ok && Number.isFinite(countData?.count);
  return result(service, index, queryOk ? "verified" : "metadata-only", {
    minScale: positiveScale(data.minScale),
    maxScale: positiveScale(data.maxScale),
    note: queryOk
      ? "FeatureServer metadata ve kayıt sayımı doğrulandı; ilan edilmiş ölçek sınırı varsa uygulanır."
      : "FeatureServer metadata erişilebilir; kayıt sayımı doğrulanamadı."
  });
}

async function probeSceneServer(service, index) {
  let target = service.tokenUrl.replace(/\/$/, "");
  if (!/\/layers\/\d+$/i.test(target)) target += "/layers/0";
  const response = await request(addQuery(target, { f: "json" }), "application/json,*/*");
  const data = response.ok ? parseJson(response.text) : null;
  if (!response.ok || !data || data.error) {
    return result(service, index, "unreachable", { note: `SceneServer metadata başarısız (${response.status || response.error || "network"}).` });
  }
  return result(service, index, "verified", {
    minScale: positiveScale(data.minScale),
    maxScale: positiveScale(data.maxScale),
    note: positiveScale(data.minScale) || positiveScale(data.maxScale)
      ? "Scene layer metadata ölçek sınırı doğrulandı."
      : "Scene layer metadata erişilebilir ve ölçek sınırı ilan etmiyor."
  });
}

function chooseRecommendedScale(minScale, maxScale) {
  if (minScale && maxScale) return Math.round(Math.sqrt(minScale * maxScale));
  if (minScale) return Math.round(minScale * 0.5);
  if (maxScale) return Math.round(maxScale * 2);
  return undefined;
}

function result(service, index, status, extra = {}) {
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
  return result(service, index, "unsupported", { note: "Desteklenmeyen servis türü." });
}

async function mapWithConcurrency(items, limit, mapper) {
  const output = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      const item = await mapper(items[index], index);
      output[index] = item;
      const range = item.minScale || item.maxScale
        ? ` · scale ${item.minScale ?? "∞"}→${item.maxScale ?? 0}`
        : " · scale unbounded/unknown";
      console.log(`[${String(index + 1).padStart(2, "0")}/${items.length}] ${item.status.padEnd(17)} ${item.kind.padEnd(13)} ${item.name}${range}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return output;
}

const results = await mapWithConcurrency(services, 2, probe);
const report = {
  schemaVersion: 2,
  verifiedAt: new Date().toISOString(),
  scaleModel: "ArcGIS view.scale; approximate zoom uses 591657527.591555 / 2^z",
  method: "MapServer export JSON render generation; WMS GetMap; WFS capabilities; FeatureServer query; SceneServer metadata",
  services: results
};

await writeFile(resolve("service-scale-probe.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
console.log("SCALE_PROBE_JSON_BEGIN");
console.log(JSON.stringify(report));
console.log("SCALE_PROBE_JSON_END");
