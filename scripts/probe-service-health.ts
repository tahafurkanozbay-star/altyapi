import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { providerLaneKey, providerRouteClass } from "../src/lib/providerTopology";
import { mapWithProviderConcurrency } from "./providerProbeScheduler";

const catalog = JSON.parse(await readFile(resolve("public/services.json"), "utf8"));
const services = Array.isArray(catalog.services) ? catalog.services : [];
const ORIGIN = process.env.PROBE_ORIGIN || "https://tahafurkanozbay-star.github.io";
const TIMEOUT_MS = 12_000;
const CONCURRENCY = 4;

function addQuery(url, params) {
  const target = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) target.searchParams.set(key, String(value));
  }
  return target.toString();
}

function isRuntimeTucbsService(service) {
  try {
    const target = new URL(service.tokenUrl);
    return target.hostname.toLowerCase() === "ucbp-api.tucbs.gov.tr" && target.pathname.startsWith("/__runtime__/");
  } catch {
    return false;
  }
}

async function request(url, accept = "*/*") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = performance.now();
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: accept,
        Origin: ORIGIN,
        "User-Agent": "altyapi-service-health-probe/1.0"
      }
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      ms: Math.round(performance.now() - started),
      text,
      type: response.headers.get("content-type") ?? "",
      cors: corsAllowed(response.headers.get("access-control-allow-origin"))
    };
  } catch (error) {
    const code = error?.cause?.code ? String(error.cause.code) : "";
    return {
      ok: false,
      status: 0,
      ms: Math.round(performance.now() - started),
      text: "",
      type: "",
      cors: false,
      error: code || (error instanceof Error ? error.name : "network-error")
    };
  } finally {
    clearTimeout(timer);
  }
}

function corsAllowed(value) {
  return value === "*" || value === ORIGIN;
}

function serviceException(text) {
  return /ServiceException|ExceptionReport|ExceptionText|ows:Exception/i.test(text);
}

function classifyNetworkFailure(result, stage) {
  if (result.status >= 500) {
    return {
      availability: "unavailable",
      access: "server-error",
      browserCompatible: false,
      latencyMs: result.ms,
      reason: `${stage} HTTP ${result.status}`
    };
  }
  if (result.status >= 400) {
    return {
      availability: "unavailable",
      access: "server-error",
      browserCompatible: false,
      latencyMs: result.ms,
      reason: `${stage} HTTP ${result.status}`
    };
  }
  return {
    availability: "degraded",
    access: "network-restricted",
    browserCompatible: null,
    latencyMs: result.ms,
    reason: `${stage} ağ erişimi doğrulanamadı${result.error ? ` (${String(result.error).slice(0, 40)})` : ""}`
  };
}

function successClassification(result, reason) {
  if (result.cors) {
    return {
      availability: "verified",
      access: "public-browser",
      browserCompatible: true,
      latencyMs: result.ms,
      reason
    };
  }
  return {
    availability: "degraded",
    access: "browser-blocked",
    browserCompatible: false,
    latencyMs: result.ms,
    reason: `${reason}; CORS başlığı doğrulanamadı`
  };
}

async function probeWms(service) {
  const caps = await request(
    addQuery(service.tokenUrl, { SERVICE: "WMS", VERSION: "1.3.0", REQUEST: "GetCapabilities" }),
    "application/xml,text/xml,*/*"
  );
  const valid = caps.ok && !serviceException(caps.text) && /WMS_Capabilities|WMT_MS_Capabilities/i.test(caps.text);
  if (!valid) return classifyNetworkFailure(caps, "WMS GetCapabilities");
  return successClassification(caps, `WMS GetCapabilities başarılı · ${caps.ms} ms`);
}

async function probeWfs(service) {
  const caps = await request(
    addQuery(service.tokenUrl, { SERVICE: "WFS", VERSION: "2.0.0", REQUEST: "GetCapabilities" }),
    "application/xml,text/xml,*/*"
  );
  const valid = caps.ok && !serviceException(caps.text) && /WFS_Capabilities/i.test(caps.text);
  if (!valid) return classifyNetworkFailure(caps, "WFS GetCapabilities");
  return successClassification(caps, `WFS GetCapabilities başarılı · ${caps.ms} ms`);
}

async function probeArcGis(service) {
  let probeUrl = addQuery(service.tokenUrl, { f: "json" });
  let stage = "ArcGIS metadata";

  if (service.servisTuruAdi === "FeatureServer") {
    probeUrl = addQuery(service.tokenUrl.replace(/\/$/, "") + "/query", {
      where: "1=1",
      returnCountOnly: "true",
      f: "json"
    });
    stage = "FeatureServer count query";
  } else if (service.servisTuruAdi === "SceneServer") {
    probeUrl = addQuery(service.tokenUrl.replace(/\/$/, "") + "/layers/0", { f: "json" });
    stage = "SceneServer layer metadata";
  }

  const result = await request(probeUrl, "application/json,*/*");
  if (!result.ok) return classifyNetworkFailure(result, stage);

  let data;
  try {
    data = JSON.parse(result.text);
  } catch {
    return {
      availability: "unavailable",
      access: "server-error",
      browserCompatible: false,
      latencyMs: result.ms,
      reason: `${stage} JSON yanıtı geçersiz`
    };
  }

  if (data?.error) {
    return {
      availability: "unavailable",
      access: "server-error",
      browserCompatible: false,
      latencyMs: result.ms,
      reason: `${stage} ArcGIS hata yanıtı`
    };
  }

  if (service.servisTuruAdi === "FeatureServer" && !Number.isFinite(data?.count)) {
    return {
      availability: "degraded",
      access: result.cors ? "public-browser" : "browser-blocked",
      browserCompatible: result.cors,
      latencyMs: result.ms,
      reason: "FeatureServer yanıt verdi ancak kayıt sayımı doğrulanamadı"
    };
  }

  return successClassification(result, `${stage} başarılı · ${result.ms} ms`);
}

async function probe(service, index) {
  if (isRuntimeTucbsService(service)) {
    return {
      index,
      name: service.cografiVeriKatmanAdi,
      kind: service.servisTuruAdi,
      availability: "unknown",
      access: "network-restricted",
      browserCompatible: null,
      reason: "IP yetkili TUCBS servisi; public runner yerine yetkili istemci IP'sinden doğrulanır"
    };
  }

  let result;
  if (service.servisTuruAdi === "WMS") result = await probeWms(service);
  else if (service.servisTuruAdi === "WFS") result = await probeWfs(service);
  else result = await probeArcGis(service);

  return {
    index,
    name: service.cografiVeriKatmanAdi,
    kind: service.servisTuruAdi,
    ...result
  };
}

function probeLane(service) {
  return providerLaneKey(service.tokenUrl, service.servisTuruAdi);
}

function probeLaneLimit(service) {
  if (service.servisTuruAdi === "WMS" || service.servisTuruAdi === "WFS") return 1;
  return providerRouteClass(service.tokenUrl, service.servisTuruAdi) === "arcgis-sharing-proxy" ? 1 : 2;
}

const results = await mapWithProviderConcurrency(
  services,
  {
    globalLimit: CONCURRENCY,
    laneFor: probeLane,
    laneLimitFor: probeLaneLimit
  },
  probe
);
const snapshot = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: "Node cross-origin service health probe",
  services: results
};

await writeFile(resolve("public/service-health.json"), JSON.stringify(snapshot, null, 2) + "\n", "utf8");

const summary = {
  verified: results.filter((item) => item.availability === "verified").length,
  degraded: results.filter((item) => item.availability === "degraded").length,
  unavailable: results.filter((item) => item.availability === "unavailable").length,
  unknown: results.filter((item) => item.availability === "unknown").length
};
console.log("✓ service-health.json güncellendi · " + JSON.stringify(summary));
