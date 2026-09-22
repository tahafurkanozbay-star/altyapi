export interface BuildInfo {
  version: string;
  sha: string;
  shortSha: string;
  builtAt: string;
  local: boolean;
}

export const BUILD_INFO: BuildInfo = Object.freeze({
  version: __APP_VERSION__,
  sha: __BUILD_SHA__,
  shortSha: __BUILD_SHA__ === "local" ? "local" : __BUILD_SHA__.slice(0, 8),
  builtAt: __BUILD_TIME__,
  local: __BUILD_SHA__ === "local"
});

export function buildLabel(info: BuildInfo = BUILD_INFO): string {
  return `v${info.version} · ${info.shortSha}`;
}
