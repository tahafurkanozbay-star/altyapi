import { readFile, writeFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";

const catalog = JSON.parse(await readFile("public/services.json", "utf8"));
const navigation = JSON.parse(await readFile("public/service-navigation.json", "utf8"));
const services = Array.isArray(catalog.services) ? catalog.services : [];
const navByIndex = new Map((navigation.profiles ?? []).map((profile) => [profile.index, profile]));

const ORIGIN = "https://tahafurkanozbay-star.github.io";
const TEST_ZOOMS = Array.from({ length: 18 }, (_, index) => index + 5); // 5..22
const TILE_SIZE = 96;
const TIMEOUT_MS = 18_000;
const EARTH_RESOLUTION = 156543.03392804097;
const SCALE_AT_ZOOM_0 = 591657527.591555;
const ZOOM_CONCURRENCY = 4;

function addQuery(url, params) {
  const target = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) target.searchParams.set(key, String(value));
  }
  return target.toString();
}

async function fetchTimed(url, options = {}, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(url, {
      redirect: "follow",
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "*/*",
        Origin: ORIGIN,
        "User-Agent": "altyapi-zoom-audit/1.0",
        ...(options.headers ?? {})
      }
    });
    return { response, ms: Math.round(performance.now() - started) };
  } finally {
    clearTimeout(timer);
  }
}

async function jsonRequest(url, timeoutMs) {
  try {
    const { response, ms } = await fetchTimed(url, { headers: { Accept: "application/json,*/*" } }, timeoutMs);
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch {}
    return { ok: response.ok && data && !data.error, status: response.status, ms, data, error: data?.error?.message };
  } catch (error) {
    return { ok: false, status: 0, ms: timeoutMs ?? TIMEOUT_MS, error: error?.cause?.code ?? error?.name ?? "network-error" };
  }
}

async function textRequest(url, timeoutMs) {
  try {
    const { response, ms } = await fetchTimed(url, { headers: { Accept: "application/xml,text/xml,*/*" } }, timeoutMs);
    const text = await response.text();
    return { ok: response.ok, status: response.status, ms, text };
  } catch (error) {
    return { ok: false, status: 0, ms: timeoutMs ?? TIMEOUT_MS, text: "", error: error?.cause?.code ?? error?.name ?? "network-error" };
  }
}

function parseScale(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

function zoomForScale(scale) {
  return Math.log2(SCALE_AT_ZOOM_0 / scale);
}

function scaleForZoom(zoom) {
  return Math.round(SCALE_AT_ZOOM_0 / 2 ** zoom);
}

function webMercator(longitude, latitude) {
  const x = longitude * 20037508.34 / 180;
  const clipped = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  const y = Math.log(Math.tan((90 + clipped) * Math.PI / 360)) / (Math.PI / 180);
  return { x, y: y * 20037508.34 / 180 };
}

function profileCenter(index) {
  const extent = navByIndex.get(index)?.extent;
  if (!extent) return { longitude: 32.8542, latitude: 39.9208 };
  return { longitude: (extent.xmin + extent.xmax) / 2, latitude: (extent.ymin + extent.ymax) / 2 };
}

function parseMapServer(url) {
  const match = url.match(/^(.*\/MapServer)(?:\/(\d+))?\/?$/i);
  return match ? { root: match[1], sublayerId: match[2] === undefined ? undefined : Number(match[2]) } : { root: url };
}

async function samplePointForMapService(service, index) {
  const { root, sublayerId } = parseMapServer(service.tokenUrl);
  if (sublayerId === undefined) return profileCenter(index);
  const query = await jsonRequest(addQuery(`${root}/${sublayerId}/query`, {
    where: "1=1",
    outFields: "*",
    returnGeometry: "true",
    resultRecordCount: 1,
    outSR: 4326,
    f: "json"
  }), 12_000);
  const geometry = query.data?.features?.[0]?.geometry;
  if (geometry) {
    if (Number.isFinite(geometry.x) && Number.isFinite(geometry.y)) return { longitude: geometry.x, latitude: geometry.y };
    const vertex = geometry.paths?.[0]?.[0] ?? geometry.rings?.[0]?.[0] ?? geometry.points?.[0];
    if (Array.isArray(vertex) && Number.isFinite(vertex[0]) && Number.isFinite(vertex[1])) {
      return { longitude: vertex[0], latitude: vertex[1] };
    }
  }
  return profileCenter(index);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function pngHasDrawnPixels(buffer) {
  if (buffer.length < 32 || buffer.toString("ascii", 1, 4) !== "PNG") return false;
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    if (type === "IHDR") {
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      bitDepth = buffer[dataStart + 8];
      colorType = buffer[dataStart + 9];
    } else if (type === "IDAT") {
      idat.push(buffer.subarray(dataStart, dataStart + length));
    } else if (type === "IEND") break;
    offset += 12 + length;
  }
  if (!width || !height || bitDepth !== 8 || idat.length === 0) return buffer.length > 1200;
  const channels = colorType === 6 ? 4 : colorType === 4 ? 2 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0;
  if (!channels) return buffer.length > 1200;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const previous = Buffer.alloc(stride);
  const current = Buffer.alloc(stride);
  let cursor = 0;
  let drawn = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[cursor++];
    for (let x = 0; x < stride; x++) {
      const source = raw[cursor++];
      const left = x >= channels ? current[x - channels] : 0;
      const up = previous[x];
      const upLeft = x >= channels ? previous[x - channels] : 0;
      if (filter === 0) current[x] = source;
      else if (filter === 1) current[x] = (source + left) & 255;
      else if (filter === 2) current[x] = (source + up) & 255;
      else if (filter === 3) current[x] = (source + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) current[x] = (source + paeth(left, up, upLeft)) & 255;
      else return buffer.length > 1200;
    }
    if (colorType === 6 || colorType === 4) {
      const alphaOffset = channels - 1;
      for (let x = alphaOffset; x < stride; x += channels) if (current[x] > 8) drawn++;
    } else {
      for (let x = 0; x < stride; x += channels) {
        let nonWhite = false;
        for (let channel = 0; channel < channels; channel++) if (current[x + channel] < 248) nonWhite = true;
        if (nonWhite) drawn++;
      }
    }
    current.copy(previous);
  }
  return drawn >= 3;
}

async function exportAtZoom(service, zoom, samplePoint) {
  const { root, sublayerId } = parseMapServer(service.tokenUrl);
  const center = webMercator(samplePoint.longitude, samplePoint.latitude);
  const resolution = EARTH_RESOLUTION / 2 ** zoom;
  const half = resolution * TILE_SIZE / 2;
  const url = addQuery(`${root}/export`, {
    bbox: `${center.x - half},${center.y - half},${center.x + half},${center.y + half}`,
    bboxSR: 3857,
    imageSR: 3857,
    size: `${TILE_SIZE},${TILE_SIZE}`,
    format: "png32",
    transparent: "true",
    dpi: 96,
    ...(sublayerId === undefined ? {} : { layers: `show:${sublayerId}` }),
    f: "image"
  });
  try {
    const { response, ms } = await fetchTimed(url, { headers: { Accept: "image/png,image/*,*/*" } }, TIMEOUT_MS);
    const buffer = Buffer.from(await response.arrayBuffer());
    const type = response.headers.get("content-type") ?? "";
    const image = response.ok && /^image\//i.test(type);
    return {
      zoom,
      scale: scaleForZoom(zoom),
      ok: image,
      drawn: image ? pngHasDrawnPixels(buffer) : false,
      http: response.status,
      ms,
      bytes: buffer.length
    };
  } catch (error) {
    return { zoom, scale: scaleForZoom(zoom), ok: false, drawn: false, http: 0, ms: TIMEOUT_MS, bytes: 0, error: error?.cause?.code ?? error?.name ?? "timeout" };
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function deriveContiguousRange(tests) {
  const drawn = tests.filter((test) => test.drawn).map((test) => test.zoom);
  if (!drawn.length) return {};
  let best = [];
  let current = [];
  for (const zoom of drawn) {
    if (!current.length || zoom === current[current.length - 1] + 1) current.push(zoom);
    else { if (current.length > best.length) best = current; current = [zoom]; }
  }
  if (current.length > best.length) best = current;
  return { minZoom: best[0], maxZoom: best[best.length - 1], contiguousLevels: best };
}

async function probeMapServer(service, index) {
  const { root, sublayerId } = parseMapServer(service.tokenUrl);
  const metadataUrl = sublayerId === undefined ? root : `${root}/${sublayerId}`;
  const metadata = await jsonRequest(addQuery(metadataUrl, { f: "json" }), 15_000);
  if (!metadata.ok) {
    return { status: "unavailable", source: "metadata", note: `Metadata erişilemedi · HTTP ${metadata.status || 0}` };
  }

  const declaredMinScale = parseScale(metadata.data?.minScale);
  const declaredMaxScale = parseScale(metadata.data?.maxScale);
  const sample = await samplePointForMapService(service, index);
  const tests = await mapWithConcurrency(TEST_ZOOMS, ZOOM_CONCURRENCY, (zoom) => exportAtZoom(service, zoom, sample));
  const range = deriveContiguousRange(tests);

  return {
    status: range.minZoom !== undefined ? "verified-range" : "metadata-only",
    source: "multi-zoom-render",
    declaredMinScale,
    declaredMaxScale,
    declaredMinZoom: declaredMinScale ? Number(zoomForScale(declaredMinScale).toFixed(2)) : undefined,
    declaredMaxZoom: declaredMaxScale ? Number(zoomForScale(declaredMaxScale).toFixed(2)) : undefined,
    ...range,
    testedZooms: [TEST_ZOOMS[0], TEST_ZOOMS.at(-1)],
    tests,
    note: range.minZoom !== undefined
      ? `PNG alpha render testi ile ardışık çalışan zoom ${range.minZoom}–${range.maxZoom}.`
      : "Metadata yanıt verdi ancak test edilen zoomlarda çizilmiş piksel doğrulanamadı."
  };
}

async function probeFeatureOrScene(service) {
  const metadata = await jsonRequest(addQuery(service.tokenUrl, { f: "json" }), 15_000);
  if (!metadata.ok) return { status: "unavailable", source: "metadata", note: `Metadata erişilemedi · HTTP ${metadata.status || 0}` };
  const declaredMinScale = parseScale(metadata.data?.minScale);
  const declaredMaxScale = parseScale(metadata.data?.maxScale);
  return {
    status: declaredMinScale || declaredMaxScale ? "declared-range" : "no-hard-limit",
    source: "service-metadata",
    declaredMinScale,
    declaredMaxScale,
    minZoom: declaredMinScale ? Math.ceil(zoomForScale(declaredMinScale) - 1e-6) : undefined,
    maxZoom: declaredMaxScale ? Math.floor(zoomForScale(declaredMaxScale) + 1e-6) : undefined,
    note: declaredMinScale || declaredMaxScale
      ? "Servis metadata'sı ölçek sınırı bildiriyor; zoom eşleniği hesaplandı."
      : service.servisTuruAdi === "SceneServer"
        ? "SceneServer LOD yapısı adaptif; metadata hard min/maxScale bildirmiyor."
        : "FeatureServer metadata hard min/maxScale bildirmiyor; sunucu sorgusu zoomdan bağımsız."
  };
}

function findScaleDenominators(xml) {
  const mins = [...xml.matchAll(/<MinScaleDenominator>([^<]+)<\/MinScaleDenominator>/gi)].map((match) => Number(match[1])).filter(Number.isFinite);
  const maxs = [...xml.matchAll(/<MaxScaleDenominator>([^<]+)<\/MaxScaleDenominator>/gi)].map((match) => Number(match[1])).filter(Number.isFinite);
  return {
    minDenominator: mins.length ? Math.min(...mins) : undefined,
    maxDenominator: maxs.length ? Math.max(...maxs) : undefined
  };
}

async function probeOgc(service) {
  const isWms = service.servisTuruAdi === "WMS";
  const caps = await textRequest(addQuery(service.tokenUrl, {
    SERVICE: service.servisTuruAdi,
    VERSION: isWms ? "1.3.0" : "2.0.0",
    REQUEST: "GetCapabilities"
  }), 15_000);
  const valid = caps.ok && (isWms ? /WMS_Capabilities|WMT_MS_Capabilities/i : /WFS_Capabilities/i).test(caps.text) && !/ExceptionReport|ServiceException/i.test(caps.text);
  if (!valid) return { status: "unavailable", source: "capabilities", note: `GetCapabilities başarısız · HTTP ${caps.status || 0}` };
  if (!isWms) return { status: "no-hard-limit", source: "capabilities", note: "WFS veri servisi zoom kısıtı bildirmiyor." };
  const denominators = findScaleDenominators(caps.text);
  if (!denominators.minDenominator && !denominators.maxDenominator) {
    return { status: "no-hard-limit", source: "capabilities", note: "WMS Capabilities hard scale denominator bildirmiyor." };
  }
  return {
    status: "declared-range",
    source: "capabilities",
    declaredMinScale: denominators.maxDenominator ? Math.round(denominators.maxDenominator) : undefined,
    declaredMaxScale: denominators.minDenominator ? Math.round(denominators.minDenominator) : undefined,
    minZoom: denominators.maxDenominator ? Math.ceil(zoomForScale(denominators.maxDenominator) - 1e-6) : undefined,
    maxZoom: denominators.minDenominator ? Math.floor(zoomForScale(denominators.minDenominator) + 1e-6) : undefined,
    note: "WMS Capabilities scale denominator sınırı bildiriyor."
  };
}

async function probe(service, index) {
  let result;
  if (service.servisTuruAdi === "MapServer") result = await probeMapServer(service, index);
  else if (service.servisTuruAdi === "FeatureServer" || service.servisTuruAdi === "SceneServer") result = await probeFeatureOrScene(service);
  else result = await probeOgc(service);
  return { index, name: service.cografiVeriKatmanAdi, kind: service.servisTuruAdi, ...result };
}

const results = [];
for (let index = 0; index < services.length; index++) {
  const result = await probe(services[index], index);
  results.push(result);
  console.log(`[${String(index + 1).padStart(2, "0")}/${services.length}] ${result.kind.padEnd(13)} ${result.name} :: ${result.status} ${result.minZoom ?? "-"}..${result.maxZoom ?? "-"}`);
}

const report = {
  schemaVersion: 1,
  verifiedAt: new Date().toISOString(),
  scaleModel: "WebMercator standard LOD · scale(z)=591657527.591555/2^z",
  testedIntegerZooms: [TEST_ZOOMS[0], TEST_ZOOMS.at(-1)],
  results
};
await writeFile("service-zoom-report.json", JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(`SUMMARY ${JSON.stringify(Object.fromEntries([...new Set(results.map((result) => result.status))].map((status) => [status, results.filter((result) => result.status === status).length])))}`);
