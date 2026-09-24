import { readFile, writeFile } from "node:fs/promises";

const catalog = JSON.parse(await readFile("public/services.json", "utf8"));
const services = Array.isArray(catalog.services) ? catalog.services : [];
const TIMEOUT_MS = 20_000;

function addQuery(url, params) {
  const target = new URL(url);
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, String(value));
  return target.toString();
}

async function fetchText(url, accept = "*/*") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = performance.now();
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { Accept: accept, "User-Agent": "altyapi-scale-audit/1.0" }
    });
    return {
      ok: response.ok,
      status: response.status,
      ms: Math.round(performance.now() - started),
      type: response.headers.get("content-type") ?? "",
      text: await response.text()
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      ms: Math.round(performance.now() - started),
      type: "",
      text: "",
      error: error?.cause?.code ?? (error instanceof Error ? error.name : "network-error")
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url) {
  const response = await fetchText(url, "application/json,*/*");
  let data;
  try { data = JSON.parse(response.text); } catch {}
  return { ...response, data };
}

function scale(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

function safeNote(value) {
  return String(value ?? "")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/[A-Za-z0-9_-]{48,}/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function parseMapServer(url) {
  const match = url.match(/^(.*\/MapServer)(?:\/(\d+))?\/?$/i);
  return match ? { root: match[1], layerId: match[2] === undefined ? undefined : Number(match[2]) } : { root: url };
}

function xmlValue(block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]+)</${tag}>`, "i"));
  return match?.[1]?.trim();
}

function wmsNamedLayer(xml) {
  const blocks = [...xml.matchAll(/<Layer(?:\s[^>]*)?>([\s\S]*?)<\/Layer>/gi)];
  for (const match of blocks) {
    const body = match[1];
    const name = xmlValue(body, "Name");
    if (!name) continue;
    const minDen = scale(xmlValue(body, "MinScaleDenominator"));
    const maxDen = scale(xmlValue(body, "MaxScaleDenominator"));
    const scaleHint = body.match(/<ScaleHint[^>]*min=["']([^"']+)["'][^>]*max=["']([^"']+)["']/i);
    return {
      name,
      minDenominator: minDen,
      maxDenominator: maxDen,
      scaleHintMin: scaleHint ? Number(scaleHint[1]) : undefined,
      scaleHintMax: scaleHint ? Number(scaleHint[2]) : undefined
    };
  }
  return undefined;
}

async function auditMapServer(service) {
  const { root, layerId } = parseMapServer(service.tokenUrl);
  const target = layerId === undefined ? root : `${root}/${layerId}`;
  const meta = await fetchJson(addQuery(target, { f: "pjson" }));
  if (!meta.ok || !meta.data || meta.data.error) {
    return { reachable: false, source: "arcgis-metadata", http: meta.status, latencyMs: meta.ms, note: safeNote(meta.data?.error?.message || meta.error || `HTTP ${meta.status}`) };
  }

  const directMin = scale(meta.data.minScale);
  const directMax = scale(meta.data.maxScale);
  const childRanges = [];

  if (layerId === undefined && Array.isArray(meta.data.layers)) {
    for (const layer of meta.data.layers) {
      const childMin = scale(layer.minScale);
      const childMax = scale(layer.maxScale);
      if (childMin || childMax) childRanges.push({ id: layer.id, minScale: childMin, maxScale: childMax });
    }
  }

  let minScale = directMin;
  let maxScale = directMax;
  let derived = false;

  if (!minScale && !maxScale && childRanges.length) {
    // For a service with multiple sublayers, this is the broad envelope where at least one declared sublayer may be visible.
    const mins = childRanges.map((item) => item.minScale).filter(Boolean);
    const maxs = childRanges.map((item) => item.maxScale).filter(Boolean);
    minScale = mins.length ? Math.max(...mins) : undefined;
    maxScale = maxs.length ? Math.min(...maxs) : undefined;
    derived = true;
  }

  return {
    reachable: true,
    source: derived ? "arcgis-child-envelope" : "arcgis-metadata",
    http: meta.status,
    latencyMs: meta.ms,
    minScale,
    maxScale,
    explicitScaleLimit: Boolean(minScale || maxScale),
    childRangeCount: childRanges.length,
    childRanges: childRanges.slice(0, 40),
    note: directMin || directMax
      ? "Servis/layer metadata doğrudan ölçek sınırı ilan ediyor."
      : childRanges.length
        ? "Kök servis sınır ilan etmiyor; alt katman ölçeklerinden görünürlük zarfı türetildi."
        : "ArcGIS metadata erişilebilir; ölçek sınırı ilan edilmemiş."
  };
}

async function auditFeatureServer(service) {
  const meta = await fetchJson(addQuery(service.tokenUrl, { f: "pjson" }));
  if (!meta.ok || !meta.data || meta.data.error) {
    return { reachable: false, source: "arcgis-metadata", http: meta.status, latencyMs: meta.ms, note: safeNote(meta.data?.error?.message || meta.error || `HTTP ${meta.status}`) };
  }
  const minScale = scale(meta.data.minScale);
  const maxScale = scale(meta.data.maxScale);
  return {
    reachable: true,
    source: "arcgis-metadata",
    http: meta.status,
    latencyMs: meta.ms,
    minScale,
    maxScale,
    explicitScaleLimit: Boolean(minScale || maxScale),
    note: minScale || maxScale ? "Feature layer metadata ölçek sınırı ilan ediyor." : "Feature layer metadata ölçek sınırı ilan etmiyor."
  };
}

async function auditSceneServer(service) {
  const root = await fetchJson(addQuery(service.tokenUrl, { f: "pjson" }));
  const layer = await fetchJson(addQuery(service.tokenUrl.replace(/\/$/, "") + "/layers/0", { f: "pjson" }));
  const data = layer.ok && layer.data && !layer.data.error ? layer.data : root.data;
  const response = layer.ok && layer.data && !layer.data.error ? layer : root;
  if (!response.ok || !data || data.error) {
    return { reachable: false, source: "scene-metadata", http: response.status, latencyMs: response.ms, note: safeNote(data?.error?.message || response.error || `HTTP ${response.status}`) };
  }
  const minScale = scale(data.minScale ?? data.layerDefinition?.minScale);
  const maxScale = scale(data.maxScale ?? data.layerDefinition?.maxScale);
  return {
    reachable: true,
    source: "scene-metadata",
    http: response.status,
    latencyMs: response.ms,
    minScale,
    maxScale,
    explicitScaleLimit: Boolean(minScale || maxScale),
    note: minScale || maxScale ? "Scene layer metadata ölçek sınırı ilan ediyor." : "Scene layer metadata ölçek sınırı ilan etmiyor."
  };
}

async function auditWms(service) {
  const caps = await fetchText(addQuery(service.tokenUrl, { SERVICE: "WMS", VERSION: "1.3.0", REQUEST: "GetCapabilities" }), "application/xml,text/xml,*/*");
  const valid = caps.ok && /WMS_Capabilities|WMT_MS_Capabilities/i.test(caps.text) && !/ServiceException|ExceptionReport|ExceptionText/i.test(caps.text);
  if (!valid) {
    return { reachable: false, source: "wms-capabilities", http: caps.status, latencyMs: caps.ms, note: safeNote(caps.error || `GetCapabilities HTTP ${caps.status}`) };
  }
  const layer = wmsNamedLayer(caps.text);
  const operationalMaxScale = layer?.minDenominator; // closest zoom-in denominator
  const operationalMinScale = layer?.maxDenominator; // farthest zoom-out denominator
  return {
    reachable: true,
    source: "wms-capabilities",
    http: caps.status,
    latencyMs: caps.ms,
    minScale: operationalMinScale,
    maxScale: operationalMaxScale,
    explicitScaleLimit: Boolean(operationalMinScale || operationalMaxScale),
    note: operationalMinScale || operationalMaxScale
      ? "WMS ScaleDenominator sınırı bulundu."
      : layer?.scaleHintMin || layer?.scaleHintMax
        ? "Yalnız legacy ScaleHint bulundu; otomatik zorunlu sınıra çevrilmedi."
        : "WMS capabilities ölçek sınırı ilan etmiyor."
  };
}

async function auditWfs(service) {
  const caps = await fetchText(addQuery(service.tokenUrl, { SERVICE: "WFS", VERSION: "2.0.0", REQUEST: "GetCapabilities" }), "application/xml,text/xml,*/*");
  const valid = caps.ok && /WFS_Capabilities/i.test(caps.text) && !/ServiceException|ExceptionReport|ExceptionText/i.test(caps.text);
  if (!valid) {
    return { reachable: false, source: "wfs-capabilities", http: caps.status, latencyMs: caps.ms, note: safeNote(caps.error || `GetCapabilities HTTP ${caps.status}`) };
  }
  return {
    reachable: true,
    source: "wfs-capabilities",
    http: caps.status,
    latencyMs: caps.ms,
    explicitScaleLimit: false,
    note: "WFS 2.0 capabilities içinde standart render ölçek sınırı yok; görünüm zorlaması uygulanmamalı."
  };
}

async function audit(service) {
  if (service.servisTuruAdi === "MapServer") return auditMapServer(service);
  if (service.servisTuruAdi === "FeatureServer") return auditFeatureServer(service);
  if (service.servisTuruAdi === "SceneServer") return auditSceneServer(service);
  if (service.servisTuruAdi === "WMS") return auditWms(service);
  if (service.servisTuruAdi === "WFS") return auditWfs(service);
  return { reachable: false, source: "unsupported", explicitScaleLimit: false, note: "Desteklenmeyen servis türü." };
}

const results = [];
for (let index = 0; index < services.length; index++) {
  const service = services[index];
  const result = await audit(service);
  const row = {
    index,
    name: service.cografiVeriKatmanAdi,
    kind: service.servisTuruAdi,
    ...result
  };
  results.push(row);
  const range = row.minScale || row.maxScale ? ` range=${row.minScale ?? 0}..${row.maxScale ?? 0}` : " range=none";
  console.log(`[${String(index + 1).padStart(2, "0")}/${services.length}] ${row.reachable ? "REACH" : "FAIL "} ${row.kind.padEnd(13)} ${row.name}${range} · ${row.note}`);
}

const report = {
  schemaVersion: 1,
  auditedAt: new Date().toISOString(),
  total: results.length,
  reachable: results.filter((item) => item.reachable).length,
  explicitScaleLimits: results.filter((item) => item.explicitScaleLimit).length,
  results
};

await writeFile("service-scale-audit.json", JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(`SUMMARY ${JSON.stringify({ total: report.total, reachable: report.reachable, explicitScaleLimits: report.explicitScaleLimits })}`);
