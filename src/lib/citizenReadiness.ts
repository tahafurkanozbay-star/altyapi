import type { ServiceDefinition } from "../types";

export type CitizenReadinessTone = "ready" | "loading" | "warning" | "offline" | "idle";
export type CitizenRenderState = "preparing" | "ready" | "scale-adjusting" | "stalled" | "recovering" | "failed";
export type CitizenRenderHealthSnapshot = Readonly<Record<string, { readonly state: CitizenRenderState } | undefined>>;

export interface CitizenReadiness {
  tone: CitizenReadinessTone;
  label: string;
  detail: string;
  active: number;
  loading: number;
  failed: number;
  renderPending: number;
  renderReady: number;
}

/**
 * Converts service/runtime state into one concise citizen-facing status.
 *
 * Network state wins because live map services cannot recover while the browser
 * is offline. Visible load/render failures come next, followed by work still in
 * progress. A service without a LayerView sample is not treated as failed: some
 * ArcGIS layer types legitimately produce their first render signal later.
 *
 * The render snapshot contract is deliberately structural and minimal. This
 * keeps the maximum-strict citizen contract independent from the event/store
 * implementation while allowing the real LayerRenderHealthSnapshot to satisfy
 * it without an adapter or unsafe cast.
 */
export function deriveCitizenReadiness(
  services: readonly ServiceDefinition[],
  renderHealth: CitizenRenderHealthSnapshot,
  online: boolean
): CitizenReadiness {
  const visible = services.filter((service) => service.visible);
  const loading = visible.filter((service) => service.status === "loading").length;
  const serviceFailedIds = new Set(
    visible.filter((service) => service.status === "error").map((service) => service.id)
  );

  let renderPending = 0;
  let renderReady = 0;
  const renderFailedIds = new Set<string>();

  for (const service of visible) {
    const state = renderHealth[service.id]?.state;
    if (!state) continue;
    if (state === "ready") renderReady += 1;
    else if (state === "failed") renderFailedIds.add(service.id);
    else renderPending += 1;
  }

  const failedIds = new Set([...serviceFailedIds, ...renderFailedIds]);
  const failed = failedIds.size;
  const active = visible.length;

  if (!online) {
    return {
      tone: "offline",
      label: "Çevrimdışı",
      detail: active > 0
        ? `${active} açık katman bağlantı geri geldiğinde yenilenecek.`
        : "Canlı harita servisleri bağlantı geri geldiğinde kullanılabilir.",
      active,
      loading,
      failed,
      renderPending,
      renderReady
    };
  }

  if (failed > 0) {
    return {
      tone: "warning",
      label: "Bazı katmanlar sorunlu",
      detail: `${failed} açık katman yeniden denenebilir.`,
      active,
      loading,
      failed,
      renderPending,
      renderReady
    };
  }

  if (loading > 0 || renderPending > 0) {
    const pending = Math.max(loading, renderPending);
    return {
      tone: "loading",
      label: "Katmanlar hazırlanıyor",
      detail: `${pending} açık katman haritada hazırlanıyor.`,
      active,
      loading,
      failed,
      renderPending,
      renderReady
    };
  }

  if (active === 0) {
    return {
      tone: "idle",
      label: "Katman seçebilirsiniz",
      detail: "Katmanlar bölümünden görmek istediğiniz veriyi açın.",
      active,
      loading,
      failed,
      renderPending,
      renderReady
    };
  }

  return {
    tone: "ready",
    label: "Harita hazır",
    detail: `${active} açık katman kullanıma hazır.`,
    active,
    loading,
    failed,
    renderPending,
    renderReady
  };
}
