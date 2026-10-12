import type { ServiceKind } from "../types";
import { browserNetworkQuality } from "../platform/networkQuality";
import { getRuntimePressureSnapshot } from "../platform/runtimePressure";
import { runCooperativeTask } from "../platform/cooperativeScheduling";

type ModuleLoader = () => Promise<unknown>;
type ModuleLoaders = Record<ServiceKind, ModuleLoader>;

export function createLayerModuleWarmup(
  loaders: ModuleLoaders,
  allowed: () => boolean,
  schedule: (task: ModuleLoader) => Promise<unknown>
): (kind: ServiceKind) => void {
  const pending = new Map<ServiceKind, Promise<unknown>>();
  return (kind) => {
    if (!allowed() || pending.has(kind)) return;
    let warmed = false;
    const operation = schedule(async () => {
      if (!allowed()) return;
      await loaders[kind]();
      warmed = true;
    });
    pending.set(kind, operation);
    void operation.then(() => {
      if (!warmed) pending.delete(kind);
    }, () => pending.delete(kind));
  };
}

/** Preloads code on intent; never creates a layer or fetches provider data. */
export const warmLayerModuleOnIntent = createLayerModuleWarmup({
  MapServer: () => import("@arcgis/core/layers/MapImageLayer.js"),
  FeatureServer: () => import("@arcgis/core/layers/FeatureLayer.js"),
  SceneServer: () => import("@arcgis/core/layers/SceneLayer.js"),
  WMS: () => import("@arcgis/core/layers/WMSLayer.js"),
  WFS: () => import("@arcgis/core/layers/WFSLayer.js")
}, () => {
  const network = browserNetworkQuality();
  return network.online && !network.saveData && !network.hidden
    && network.effectiveType !== "2g" && network.effectiveType !== "slow-2g"
    && getRuntimePressureSnapshot().level === "normal";
}, (task) => runCooperativeTask(task, "background"));
