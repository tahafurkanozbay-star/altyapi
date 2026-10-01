import {
  inspectOgcCapabilities,
  type OgcCapabilitiesInspection,
  type OgcCapabilityKind
} from "../lib/ogcCapabilities";
import {
  isOgcCapabilitiesWorkerResponse,
  type OgcCapabilitiesWorkerRequest
} from "./ogcCapabilitiesProtocol";

const WORKER_TIMEOUT_MS = 2_500;

interface PendingRequest {
  resolve: (result: OgcCapabilitiesInspection) => void;
  reject: (reason?: unknown) => void;
  timer: number;
}

let worker: Worker | null | undefined;
let workerDisabled = false;
let requestSequence = 0;
const pending = new Map<number, PendingRequest>();

/**
 * Moves OGC XML inspection off the UI thread when module workers are available.
 * Only the already-fetched XML payload and service kind cross the worker boundary;
 * protected TUCBS endpoint URLs/tokens are never sent to the worker.
 *
 * Any worker creation/runtime/timeout failure falls back to the same pure parser
 * on the main thread, so this optimization can never make a supported browser
 * lose service compatibility.
 */
export async function inspectOgcCapabilitiesOffMainThread(
  xml: string,
  kind: OgcCapabilityKind
): Promise<OgcCapabilitiesInspection> {
  if (typeof Worker === "undefined" || workerDisabled) {
    return inspectOgcCapabilities(xml, kind);
  }

  try {
    const activeWorker = ensureWorker();
    const id = ++requestSequence;
    return await new Promise<OgcCapabilitiesInspection>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pending.delete(id);
        reject(new Error("OGC worker timeout"));
      }, WORKER_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timer });
      const message: OgcCapabilitiesWorkerRequest = { id, kind, xml };
      activeWorker.postMessage(message);
    });
  } catch {
    disableWorker();
    return inspectOgcCapabilities(xml, kind);
  }
}

export function resetOgcCapabilitiesWorkerForTests(): void {
  disableWorker();
  workerDisabled = false;
  requestSequence = 0;
}

function ensureWorker(): Worker {
  if (worker) return worker;
  const nextWorker = new Worker(new URL("../workers/ogcCapabilities.worker.ts", import.meta.url), {
    type: "module",
    name: "altyapi-ogc-capabilities"
  });
  nextWorker.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (!isOgcCapabilitiesWorkerResponse(event.data)) return;
    const entry = pending.get(event.data.id);
    if (!entry) return;
    pending.delete(event.data.id);
    window.clearTimeout(entry.timer);
    if (event.data.ok) entry.resolve(event.data.result);
    else entry.reject(new Error("OGC worker parse failed"));
  });
  nextWorker.addEventListener("error", disableWorker);
  nextWorker.addEventListener("messageerror", disableWorker);
  worker = nextWorker;
  return nextWorker;
}

function disableWorker(): void {
  workerDisabled = true;
  worker?.terminate();
  worker = null;
  for (const entry of pending.values()) {
    window.clearTimeout(entry.timer);
    entry.reject(new Error("OGC worker unavailable"));
  }
  pending.clear();
}
