export interface ActiveScaleLockRange {
  minScale?: number;
  maxScale?: number;
  layerIds: string[];
  compatible: boolean;
}

type ScaleAwareLayer = {
  id?: string | null;
  visible?: boolean;
  minScale?: number;
  maxScale?: number;
};

type LayerCollectionLike = {
  map?: <T>(callback: (layer: ScaleAwareLayer) => T) => T[];
  toArray?: () => ScaleAwareLayer[];
};

type SceneLike = HTMLElement & {
  scale?: number;
  map?: { layers?: LayerCollectionLike } | null;
  viewOnReady?: () => Promise<void>;
};

type Removable = { remove(): void };

const OPERATIONAL_LAYER_PREFIX = "svc-";
const SCALE_EPSILON = 0.5;

export function deriveActiveScaleLockRange(layers: readonly ScaleAwareLayer[]): ActiveScaleLockRange {
  const restricted = layers.filter((layer) =>
    layer.visible !== false &&
    typeof layer.id === "string" &&
    layer.id.startsWith(OPERATIONAL_LAYER_PREFIX) &&
    (positiveScale(layer.minScale) !== undefined || positiveScale(layer.maxScale) !== undefined)
  );

  const minScales = restricted
    .map((layer) => positiveScale(layer.minScale))
    .filter((value): value is number => value !== undefined);
  const maxScales = restricted
    .map((layer) => positiveScale(layer.maxScale))
    .filter((value): value is number => value !== undefined);

  const minScale = minScales.length ? Math.min(...minScales) : undefined;
  const maxScale = maxScales.length ? Math.max(...maxScales) : undefined;

  return {
    minScale,
    maxScale,
    layerIds: restricted.map((layer) => layer.id!).filter(Boolean),
    compatible: !(minScale !== undefined && maxScale !== undefined && maxScale > minScale)
  };
}

export function clampScaleToActiveRange(scale: number, range: ActiveScaleLockRange): number {
  if (!Number.isFinite(scale) || scale <= 0 || !range.compatible) return scale;
  if (range.minScale !== undefined && scale > range.minScale) return range.minScale;
  if (range.maxScale !== undefined && scale < range.maxScale) return range.maxScale;
  return scale;
}

export function installActiveLayerScaleLock(): () => void {
  let disposed = false;
  let observer: MutationObserver | undefined;
  let watchHandle: Removable | undefined;
  let scene: SceneLike | undefined;
  let frame = 0;
  let lastSignature = "";

  const emitState = (range: ActiveScaleLockRange) => {
    const signature = JSON.stringify(range);
    if (signature === lastSignature) return;
    lastSignature = signature;
    window.dispatchEvent(new CustomEvent("altyapi:scale-lock-change", { detail: range }));
  };

  const currentLayers = (): ScaleAwareLayer[] => {
    const collection = scene?.map?.layers;
    if (!collection) return [];
    if (collection.toArray) return collection.toArray();
    if (collection.map) return collection.map((layer) => layer);
    return [];
  };

  const enforce = () => {
    if (disposed || !scene) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (disposed || !scene) return;
      const range = deriveActiveScaleLockRange(currentLayers());
      emitState(range);
      if (!range.compatible) {
        console.warn("[Başkent 3B CBS] Aktif katmanların zoom aralıkları kesişmiyor; otomatik zoom kilidi uygulanmadı.", range.layerIds);
        return;
      }
      const scale = scene.scale;
      if (!Number.isFinite(scale) || !scale || scale <= 0) return;
      const clamped = clampScaleToActiveRange(scale, range);
      if (Math.abs(clamped - scale) > SCALE_EPSILON) scene.scale = clamped;
    });
  };

  const connect = async (candidate: Element | null) => {
    if (disposed || scene || !(candidate instanceof HTMLElement)) return;
    scene = candidate as SceneLike;
    observer?.disconnect();
    observer = undefined;

    try {
      await scene.viewOnReady?.();
      if (disposed || !scene) return;
      const reactiveUtils = await import("@arcgis/core/core/reactiveUtils.js");
      if (disposed || !scene) return;

      watchHandle = reactiveUtils.watch(
        () => layerStateSignature(currentLayers()),
        enforce,
        { initial: true }
      );
      scene.addEventListener("arcgisViewChange", enforce);
      enforce();
    } catch (error) {
      console.warn("[Başkent 3B CBS] Aktif katman zoom kilidi başlatılamadı.", error);
    }
  };

  const existing = document.querySelector("#altyapi-main-scene");
  if (existing) {
    void connect(existing);
  } else {
    observer = new MutationObserver(() => {
      const candidate = document.querySelector("#altyapi-main-scene");
      if (candidate) void connect(candidate);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  return () => {
    disposed = true;
    observer?.disconnect();
    watchHandle?.remove();
    cancelAnimationFrame(frame);
    scene?.removeEventListener("arcgisViewChange", enforce);
    scene = undefined;
  };
}

function layerStateSignature(layers: readonly ScaleAwareLayer[]): string {
  return layers
    .filter((layer) => typeof layer.id === "string" && layer.id.startsWith(OPERATIONAL_LAYER_PREFIX))
    .map((layer) => [
      layer.id,
      layer.visible !== false ? 1 : 0,
      positiveScale(layer.minScale) ?? 0,
      positiveScale(layer.maxScale) ?? 0
    ].join(":"))
    .join("|");
}

function positiveScale(value: unknown): number | undefined {
  const scale = Number(value);
  return Number.isFinite(scale) && scale > 0 ? scale : undefined;
}
