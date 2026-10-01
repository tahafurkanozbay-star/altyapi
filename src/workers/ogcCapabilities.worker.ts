import { inspectOgcCapabilities } from "../lib/ogcCapabilities";
import type {
  OgcCapabilitiesWorkerRequest,
  OgcCapabilitiesWorkerResponse
} from "../platform/ogcCapabilitiesProtocol";

const scope = globalThis as unknown as DedicatedWorkerGlobalScope;

scope.addEventListener("message", (event: MessageEvent<OgcCapabilitiesWorkerRequest>) => {
  const message = event.data;
  if (!message || typeof message.id !== "number" || (message.kind !== "WMS" && message.kind !== "WFS") || typeof message.xml !== "string") {
    return;
  }

  let response: OgcCapabilitiesWorkerResponse;
  try {
    response = {
      id: message.id,
      ok: true,
      result: inspectOgcCapabilities(message.xml, message.kind)
    };
  } catch {
    response = { id: message.id, ok: false, error: "parse-failed" };
  }
  scope.postMessage(response);
});
