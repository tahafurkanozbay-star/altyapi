import type { RawServiceDefinition, ServiceDefinition, ServiceKind, ServicesDocument } from "../types";

const supportedKinds = new Set<ServiceKind>(["WMS", "WFS", "MapServer", "FeatureServer", "SceneServer"]);

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function inferKind(raw: RawServiceDefinition): ServiceKind {
  const declared = raw.servisTuruAdi as ServiceKind;
  if (supportedKinds.has(declared)) return declared;
  const url = raw.tokenUrl.toLowerCase();
  if (url.includes("/featureserver")) return "FeatureServer";
  if (url.includes("/sceneserver")) return "SceneServer";
  if (url.includes("/mapserver")) return "MapServer";
  if (url.includes("/wfs")) return "WFS";
  if (url.includes("/wms")) return "WMS";
  throw new Error(`Desteklenmeyen servis türü: ${raw.servisTuruAdi}`);
}

export function normalizeService(raw: RawServiceDefinition, index: number): ServiceDefinition {
  const kind = inferKind(raw);
  const displayName = raw.cografiVeriKatmanAdi.trim();
  const identity = `${displayName}-${kind}-${raw.tokenUrl}`;
  return {
    ...raw,
    id: `${slugify(identity).slice(0, 90)}-${index + 1}`,
    kind,
    displayName,
    organization: raw.ustKurumAdi.trim(),
    owner: raw.metaveriSahibiKurumAdi.trim(),
    url: raw.tokenUrl.trim(),
    status: "idle",
    visible: false,
    opacity: kind === "MapServer" || kind === "WMS" ? 0.86 : 1,
    favorite: false
  };
}

export async function loadServiceCatalog(url = "./services.json"): Promise<ServiceDefinition[]> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Servis kataloğu yüklenemedi (HTTP ${response.status}).`);
  const document = (await response.json()) as ServicesDocument;
  if (!Array.isArray(document.services)) throw new Error("services.json içinde 'services' dizisi bulunamadı.");
  return document.services.map(normalizeService);
}

export function serviceMatches(service: ServiceDefinition, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase("tr-TR");
  if (!needle) return true;
  return [service.displayName, service.organization, service.owner, service.kind]
    .join(" ")
    .toLocaleLowerCase("tr-TR")
    .includes(needle);
}

export function hostLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/[a-zA-Z0-9._~-]{60,}(?=\/|$)/g, "/••••");
    return `${parsed.hostname}${path.length > 62 ? `${path.slice(0, 59)}…` : path}`;
  } catch {
    return "Geçersiz URL";
  }
}
