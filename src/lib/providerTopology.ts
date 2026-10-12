export type ProviderRouteClass =
  | "arcgis-sharing-proxy"
  | "arcgis-rest"
  | "ogc"
  | "generic";

/**
 * Classifies only the coarse transport/gateway family. The returned value never
 * contains service paths, layer names, query strings, tokens or credentials.
 */
export function providerRouteClass(url: string | undefined, kind?: string): ProviderRouteClass {
  if (kind === "WMS" || kind === "WFS") return "ogc";
  if (!url) return "generic";

  try {
    const parsed = new URL(url, "https://local.invalid");
    const path = parsed.pathname.toLowerCase();

    if (path.includes("/portal/sharing/servers/")) return "arcgis-sharing-proxy";
    if (
      path.includes("/server/rest/services/")
      || path.includes("/arcgis/rest/services/")
      || path.includes("/rest/services/")
    ) {
      return "arcgis-rest";
    }
  } catch {
    return "generic";
  }

  return "generic";
}

/**
 * Produces an in-memory provider lane identifier that separates different
 * gateway families on the same host without retaining endpoint paths.
 */
export function providerLaneKey(url: string | undefined, kind?: string): string {
  const route = providerRouteClass(url, kind);
  if (!url) return `kind:${kind ?? "unknown"}|${route}`;

  try {
    const parsed = new URL(url, "https://local.invalid");
    if (parsed.hostname && parsed.hostname !== "local.invalid") {
      return `${parsed.protocol}//${parsed.host}|${route}`;
    }
  } catch {
    // Fall through to the non-sensitive kind lane below.
  }

  return `kind:${kind ?? "unknown"}|${route}`;
}

export function isArcGisSharingProxyUrl(url: string | undefined): boolean {
  return providerRouteClass(url) === "arcgis-sharing-proxy";
}
