import type { ServiceDefinition } from "../types";
import {
  clampScaleToOperationalRange,
  hasOperationalScaleConstraint,
  operationalExtentContains,
  recommendedActivationScale,
  resolveOperationalScaleRange
} from "../lib/serviceNavigation";
import { extentOverlapState, type ExtentLike } from "./layerCoverageWatchdog";

const SCALE_MOVE_EPSILON = 0.002;

export type AtomicLayerActivationReason =
  | "outside-extent"
  | "scale-too-far"
  | "scale-too-close"
  | "layer-view-scale";

export type AtomicLayerActivationFocus =
  | "provider-extent"
  | "operational-center"
  | "current-center";

export interface AtomicLayerActivationInput {
  service: ServiceDefinition;
  activeServices: ServiceDefinition[];
  currentScale?: number;
  cameraLongitude?: number;
  cameraLatitude?: number;
  viewExtent?: ExtentLike | null;
  providerExtent?: ExtentLike | null;
  layerViewVisibleAtCurrentScale?: boolean;
}

export interface AtomicLayerActivationPlan {
  moved: boolean;
  reason?: AtomicLayerActivationReason;
  focus?: AtomicLayerActivationFocus;
  targetScale?: number;
  fitProviderExtent?: boolean;
}

export interface PlannedActivationCandidate<T> {
  value: T;
  plan: AtomicLayerActivationPlan;
}

/**
 * Resolves coverage, catalogue constraints, loaded-provider scale metadata and
 * the first LayerView scale signal into one camera decision. The planner is
 * deliberately ArcGIS-free so the transaction policy can be regression-tested
 * without a browser SceneView.
 */
export function planAtomicLayerActivation(input: AtomicLayerActivationInput): AtomicLayerActivationPlan {
  const { service } = input;
  const range = resolveOperationalScaleRange(input.activeServices, service);
  const currentScale = positiveScale(input.currentScale);
  const constrained = hasOperationalScaleConstraint(service) || Boolean(range.minScale || range.maxScale);

  let targetScale: number | undefined;
  let reason: AtomicLayerActivationReason | undefined;

  if (currentScale) {
    const clamped = clampScaleToOperationalRange(currentScale, range);
    if (relativeDifference(currentScale, clamped) >= SCALE_MOVE_EPSILON) {
      targetScale = clamped;
      if (range.minScale && currentScale > range.minScale) reason = "scale-too-far";
      else if (range.maxScale && currentScale < range.maxScale) reason = "scale-too-close";
    }
  } else if (constrained) {
    const preferred = recommendedActivationScale(service);
    if (preferred) targetScale = clampScaleToOperationalRange(preferred, range);
  }

  // LayerView is the final render truth. If ArcGIS still says the newly loaded
  // layer is outside its provider scale, use the reconciled recommendation once
  // inside the same transaction instead of allowing a second watchdog repair.
  if (input.layerViewVisibleAtCurrentScale === false && constrained && !targetScale) {
    const preferred = recommendedActivationScale(service);
    if (preferred) {
      const candidate = clampScaleToOperationalRange(preferred, range);
      if (!currentScale || relativeDifference(currentScale, candidate) >= SCALE_MOVE_EPSILON) {
        targetScale = candidate;
        reason = "layer-view-scale";
      }
    }
  }

  const providerOverlap = input.providerExtent
    ? extentOverlapState(input.viewExtent, input.providerExtent)
    : "unknown";

  if (providerOverlap === "disjoint") {
    return {
      moved: true,
      reason: "outside-extent",
      focus: "provider-extent",
      targetScale,
      fitProviderExtent: !targetScale && !constrained
    };
  }

  // A loaded provider extent that already intersects the Scene is stronger
  // evidence than a broad catalogue operational envelope. Only fall back to the
  // latter when provider overlap is unknown or unavailable.
  if (providerOverlap === "unknown" && service.operationalExtent) {
    const longitude = finiteNumber(input.cameraLongitude);
    const latitude = finiteNumber(input.cameraLatitude);
    if (
      longitude !== undefined &&
      latitude !== undefined &&
      !operationalExtentContains(service, longitude, latitude)
    ) {
      return {
        moved: true,
        reason: "outside-extent",
        focus: "operational-center",
        targetScale: targetScale ?? recommendedScaleInsideRange(service, range)
      };
    }
  }

  if (targetScale) {
    return {
      moved: true,
      reason,
      focus: "current-center",
      targetScale
    };
  }

  return { moved: false };
}

/**
 * Chooses the single camera owner for a bulk activation transaction. Coverage
 * misses are more important than scale-only corrections because a layer cannot
 * be seen at any scale while the camera is outside its data envelope. ArcGIS
 * LayerView scale truth comes next, then ordinary catalogue/provider clamping.
 * Equal-priority candidates deliberately prefer the last activation so the
 * result matches the existing "latest constrained layer wins" conflict policy.
 */
export function selectBatchActivationCandidate<T>(
  candidates: PlannedActivationCandidate<T>[]
): PlannedActivationCandidate<T> | undefined {
  let selected: PlannedActivationCandidate<T> | undefined;
  let selectedPriority = -1;

  for (const candidate of candidates) {
    if (!candidate.plan.moved) continue;
    const priority = activationPlanPriority(candidate.plan);
    if (priority >= selectedPriority) {
      selected = candidate;
      selectedPriority = priority;
    }
  }

  return selected;
}

export function activationPlanPriority(plan: AtomicLayerActivationPlan): number {
  if (!plan.moved) return 0;
  if (plan.reason === "outside-extent") return 30;
  if (plan.reason === "layer-view-scale") return 20;
  if (plan.reason === "scale-too-far" || plan.reason === "scale-too-close") return 10;
  return 5;
}

function recommendedScaleInsideRange(
  service: ServiceDefinition,
  range: ReturnType<typeof resolveOperationalScaleRange>
): number | undefined {
  const recommended = recommendedActivationScale(service);
  return recommended ? clampScaleToOperationalRange(recommended, range) : undefined;
}

function positiveScale(value: unknown): number | undefined {
  const numeric = finiteNumber(value);
  return numeric !== undefined && numeric > 0 ? numeric : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function relativeDifference(left: number, right: number): number {
  return Math.abs(left - right) / Math.max(1, left);
}
