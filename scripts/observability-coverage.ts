export interface HealthObservation {
  availability?: string;
  access?: string;
}

export interface ScaleObservation {
  reachable?: boolean;
  source?: string;
  explicitScaleLimit?: boolean;
}

export interface HealthCoverage {
  total: number;
  probeableTotal: number;
  clientIpRequired: number;
  verified: number;
  degraded: number;
  unavailable: number;
  unknownProbeable: number;
}

export interface ScaleCoverage {
  total: number;
  probeableTotal: number;
  clientIpRequired: number;
  reachableProbeable: number;
  unreachableProbeable: number;
  explicitScaleLimits: number;
}

export function isClientIpHealthObservation(entry: HealthObservation): boolean {
  return entry.availability === "unknown" && entry.access === "network-restricted";
}

export function summarizeHealthCoverage(entries: HealthObservation[]): HealthCoverage {
  const clientIpRequired = entries.filter(isClientIpHealthObservation).length;
  const probeable = entries.filter((entry) => !isClientIpHealthObservation(entry));

  return {
    total: entries.length,
    probeableTotal: probeable.length,
    clientIpRequired,
    verified: probeable.filter((entry) => entry.availability === "verified").length,
    degraded: probeable.filter((entry) => entry.availability === "degraded").length,
    unavailable: probeable.filter((entry) => entry.availability === "unavailable").length,
    unknownProbeable: probeable.filter((entry) => entry.availability === "unknown").length
  };
}

export function summarizeScaleCoverage(entries: ScaleObservation[]): ScaleCoverage {
  const clientIpRequired = entries.filter((entry) => entry.source === "client-ip-required").length;
  const probeable = entries.filter((entry) => entry.source !== "client-ip-required");
  const reachableProbeable = probeable.filter((entry) => entry.reachable === true).length;

  return {
    total: entries.length,
    probeableTotal: probeable.length,
    clientIpRequired,
    reachableProbeable,
    unreachableProbeable: probeable.length - reachableProbeable,
    explicitScaleLimits: probeable.filter((entry) => entry.explicitScaleLimit === true).length
  };
}

export function renderObservabilitySummary(input: {
  generatedAt: string;
  auditedAt: string;
  health: HealthObservation[];
  scale: ScaleObservation[];
}): string {
  const health = summarizeHealthCoverage(input.health);
  const scale = summarizeScaleCoverage(input.scale);

  return [
    "## Ankara Kent Rehberi · Servis Gözlemlenebilirliği",
    "",
    `Health measured: **${input.generatedAt}**`,
    `Scale audited: **${input.auditedAt}**`,
    "",
    `- **public-runner probeable health**: ${health.probeableTotal}/${health.total}`,
    `- **verified**: ${health.verified}`,
    `- **degraded**: ${health.degraded}`,
    `- **unavailable**: ${health.unavailable}`,
    `- **unknown (probeable)**: ${health.unknownProbeable}`,
    `- **TUCBS client-IP-required**: ${health.clientIpRequired}`,
    `- **scale metadata reachable (probeable)**: ${scale.reachableProbeable}/${scale.probeableTotal}`,
    `- **scale metadata unreachable (probeable)**: ${scale.unreachableProbeable}`,
    `- **explicit server scale limits**: ${scale.explicitScaleLimits}`,
    "",
    "> TUCBS istemci-IP-kısıtlı kayıtları GitHub runner erişilebilirlik paydasına dahil edilmez; gerçek erişim yetkili kullanıcı IP'sinden tarayıcı içinde doğrulanır."
  ].join("\n");
}
