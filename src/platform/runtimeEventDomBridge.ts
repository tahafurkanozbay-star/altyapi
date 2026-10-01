import { ATOMIC_LAYER_ACTIVATION_EVENT } from "../gis/layerActivationState";
import { parseLayerRenderHealthDetail } from "../lib/layerRenderHealth";
import { publishRuntimeEvent, subscribeRuntimeEvent } from "./runtimeEvents";

const LEGACY_LAYER_RENDER_HEALTH_EVENT = "altyapi:layerview-health";

/**
 * Compatibility boundary for the ArcGIS watchdog while application-owned
 * runtime messaging moves to the typed in-process event bus. New application
 * code must use runtimeEvents.ts rather than adding new window CustomEvents.
 */
export function installRuntimeEventDomBridge(): () => void {
  if (typeof window === "undefined") return () => undefined;

  const onLegacyLayerRenderHealth = (event: Event) => {
    if (!(event instanceof CustomEvent)) return;
    const detail = parseLayerRenderHealthDetail(event.detail);
    if (detail) publishRuntimeEvent("layer-render-health", detail);
  };

  window.addEventListener(LEGACY_LAYER_RENDER_HEALTH_EVENT, onLegacyLayerRenderHealth);
  const unsubscribeActivation = subscribeRuntimeEvent("atomic-layer-activation-complete", (detail) => {
    window.dispatchEvent(new CustomEvent(ATOMIC_LAYER_ACTIVATION_EVENT, { detail }));
  });

  return () => {
    window.removeEventListener(LEGACY_LAYER_RENDER_HEALTH_EVENT, onLegacyLayerRenderHealth);
    unsubscribeActivation();
  };
}
