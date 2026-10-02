import { useCallback, useEffect, useState } from "react";
import {
  publishRuntimeEvent,
  subscribeRuntimeEvent,
  type RuntimeEventMap
} from "../platform/runtimeEvents";
import { Icon } from "./Icon";
import { InstallPromptHost } from "./InstallPromptHost";

type RuntimeFault = RuntimeEventMap["app-runtime-fault"];

export function PlatformStatusHost() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [fault, setFault] = useState<RuntimeFault | null>(null);

  useEffect(() => {
    const unsubscribeUpdate = subscribeRuntimeEvent("pwa-update-available", () => {
      setUpdateAvailable(true);
    });
    const unsubscribeFault = subscribeRuntimeEvent("app-runtime-fault", (detail) => {
      setFault(detail);
    });
    return () => {
      unsubscribeUpdate();
      unsubscribeFault();
    };
  }, []);

  const applyUpdate = useCallback(() => {
    publishRuntimeEvent("pwa-apply-update", {});
    setUpdateAvailable(false);
  }, []);

  return (
    <section className="platform-status-stack" aria-label="Kent Rehberi uygulama bildirimleri">
      {fault && (
        <aside className="runtime-fault-banner" role="alert">
          <span className="platform-status-icon is-warning" aria-hidden="true"><Icon name="warning" size={18} /></span>
          <div className="platform-status-copy">
            <strong>Harita oturumunda bir sorun algılandı</strong>
            <span>{fault.message}</span>
          </div>
          {fault.reloadRecommended && (
            <button type="button" className="primary-button platform-status-action" onClick={() => window.location.reload()}>
              Yenile
            </button>
          )}
          <button
            type="button"
            className="icon-ghost platform-status-dismiss"
            onClick={() => setFault(null)}
            aria-label="Hata bildirimini kapat"
          >
            <Icon name="close" size={14} />
          </button>
        </aside>
      )}

      {updateAvailable && (
        <aside className="platform-update-banner" role="status" aria-live="polite">
          <span className="platform-status-icon" aria-hidden="true"><Icon name="refresh" size={17} /></span>
          <div className="platform-status-copy">
            <strong>Kent Rehberi güncellemesi hazır</strong>
            <span>Yeni sürüm uygulanabilir; harita tercihleriniz korunur.</span>
          </div>
          <button type="button" className="primary-button platform-status-action" onClick={applyUpdate}>Güncelle</button>
          <button
            type="button"
            className="icon-ghost platform-status-dismiss"
            onClick={() => setUpdateAvailable(false)}
            aria-label="Güncelleme bildirimini kapat"
          >
            <Icon name="close" size={14} />
          </button>
        </aside>
      )}

      <InstallPromptHost />
    </section>
  );
}
