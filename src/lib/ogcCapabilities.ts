import type { OperationalExtent } from "../types";

const MAX_SCALE = 1_000_000_000;

export type OgcCapabilityKind = "WMS" | "WFS";

export interface OgcScaleProfile {
  minScale?: number;
  maxScale?: number;
  recommendedScale?: number;
}

export interface OgcCapabilitiesInspection {
  valid: boolean;
  exception: boolean;
  capabilityVersion?: string;
  scaleProfile?: OgcScaleProfile;
  geographicExtent?: OperationalExtent;
}

export function inspectOgcCapabilities(xml: string, kind: OgcCapabilityKind): OgcCapabilitiesInspection {
  const exception = /ServiceException|ExceptionReport|ExceptionText|ows:Exception/i.test(xml);
  const rootPattern = kind === "WMS"
    ? /<(?:[A-Za-z0-9_.-]+:)?(?:WMS_Capabilities|WMT_MS_Capabilities)\b([^>]*)>/i
    : /<(?:[A-Za-z0-9_.-]+:)?WFS_Capabilities\b([^>]*)>/i;
  const root = rootPattern.exec(xml);
  const valid = Boolean(root) && !exception;
  const capabilityVersion = root ? attributeValue(root[1] ?? "", "version") : undefined;

  if (!valid || kind !== "WMS") {
    return { valid, exception, capabilityVersion };
  }

  return {
    valid,
    exception,
    capabilityVersion,
    scaleProfile: extractWmsScaleProfile(xml),
    geographicExtent: extractWmsGeographicExtent(xml)
  };
}

export function extractWmsScaleProfile(xml: string): OgcScaleProfile | undefined {
  const minDenominators = xmlScaleValues(xml, "MinScaleDenominator");
  const maxDenominators = xmlScaleValues(xml, "MaxScaleDenominator");

  // OGC denominator semantics are inverse to ArcGIS minScale/maxScale names.
  const maxScale = minDenominators.length ? Math.max(...minDenominators) : undefined;
  const minScale = maxDenominators.length ? Math.min(...maxDenominators) : undefined;
  if (!minScale && !maxScale) return undefined;
  if (minScale && maxScale && maxScale >= minScale) return undefined;

  return {
    minScale,
    maxScale,
    recommendedScale: recommendedScaleInside(minScale, maxScale)
  };
}

/**
 * Reads only axis-unambiguous WGS84 envelopes. EX_GeographicBoundingBox is
 * preferred for WMS 1.3; legacy LatLonBoundingBox is used as a safe fallback.
 * When multiple layer boxes exist, the smallest valid box is treated as the
 * most specific dataset coverage rather than the broader service envelope.
 */
export function extractWmsGeographicExtent(xml: string): OperationalExtent | undefined {
  const exBoxes = [...xml.matchAll(/<(?:[A-Za-z0-9_.-]+:)?EX_GeographicBoundingBox(?:\s[^>]*)?>([\s\S]*?)<\/(?:[A-Za-z0-9_.-]+:)?EX_GeographicBoundingBox>/gi)]
    .map((match) => {
      const block = match[1] ?? "";
      return normalizedExtent(
        tagNumber(block, "westBoundLongitude"),
        tagNumber(block, "southBoundLatitude"),
        tagNumber(block, "eastBoundLongitude"),
        tagNumber(block, "northBoundLatitude")
      );
    })
    .filter((extent): extent is OperationalExtent => Boolean(extent));
  if (exBoxes.length) return smallestExtent(exBoxes);

  const legacyBoxes = [...xml.matchAll(/<(?:[A-Za-z0-9_.-]+:)?LatLonBoundingBox\b([^>]*)\/?\s*>/gi)]
    .map((match) => {
      const attributes = match[1] ?? "";
      return normalizedExtent(
        attributeNumber(attributes, "minx"),
        attributeNumber(attributes, "miny"),
        attributeNumber(attributes, "maxx"),
        attributeNumber(attributes, "maxy")
      );
    })
    .filter((extent): extent is OperationalExtent => Boolean(extent));
  return legacyBoxes.length ? smallestExtent(legacyBoxes) : undefined;
}

function xmlScaleValues(xml: string, tagName: string): number[] {
  const pattern = new RegExp(
    `<(?:[A-Za-z0-9_.-]+:)?${tagName}(?:\\s[^>]*)?>([^<]+)<\\/(?:[A-Za-z0-9_.-]+:)?${tagName}>`,
    "gi"
  );
  return [...xml.matchAll(pattern)]
    .map((match) => positiveScale(match[1]))
    .filter((value): value is number => value !== undefined);
}

function positiveScale(value: unknown): number | undefined {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > MAX_SCALE) return undefined;
  return Math.round(numeric);
}

function recommendedScaleInside(minScale?: number, maxScale?: number): number | undefined {
  if (minScale && maxScale) return Math.round(Math.sqrt(minScale * maxScale));
  if (minScale) return Math.max(1, Math.round(minScale * 0.65));
  if (maxScale) return Math.round(maxScale * 1.5);
  return undefined;
}

function normalizedExtent(
  xminValue: unknown,
  yminValue: unknown,
  xmaxValue: unknown,
  ymaxValue: unknown
): OperationalExtent | undefined {
  const xmin = finiteNumber(xminValue);
  const ymin = finiteNumber(yminValue);
  const xmax = finiteNumber(xmaxValue);
  const ymax = finiteNumber(ymaxValue);
  if (xmin === undefined || ymin === undefined || xmax === undefined || ymax === undefined) return undefined;
  if (xmin >= xmax || ymin >= ymax) return undefined;
  if (xmin < -180 || xmax > 180 || ymin < -90 || ymax > 90) return undefined;
  return { xmin, ymin, xmax, ymax, wkid: 4326 };
}

function smallestExtent(extents: OperationalExtent[]): OperationalExtent {
  return [...extents].sort((left, right) => extentArea(left) - extentArea(right))[0]!;
}

function extentArea(extent: OperationalExtent): number {
  return (extent.xmax - extent.xmin) * (extent.ymax - extent.ymin);
}

function tagNumber(block: string, tagName: string): number | undefined {
  const pattern = new RegExp(
    `<(?:[A-Za-z0-9_.-]+:)?${tagName}(?:\\s[^>]*)?>([^<]+)<\\/(?:[A-Za-z0-9_.-]+:)?${tagName}>`,
    "i"
  );
  return finiteNumber(block.match(pattern)?.[1]);
}

function attributeNumber(attributes: string, name: string): number | undefined {
  return finiteNumber(attributeValue(attributes, name));
}

function attributeValue(attributes: string, name: string): string | undefined {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i");
  return attributes.match(pattern)?.[1];
}

function finiteNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}
