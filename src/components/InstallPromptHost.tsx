import { useCallback, useEffect, useState } from "react";
import { Icon } from "./Icon";

interface InstallChoice {
  outcome: "accepted" | "dismissed";
  platform: string;
}

interface BeforeInstallPromptEvent extends Event {
  readonly platforms?: readonly string[];
  readonly userChoice: Promise<InstallChoice>;
  prompt(): Promise<void>;
}

interface NavigatorStandalone extends Navigator {
  readonly standalone?: boolean;
}

const SESSION_DISMISS_KEY = "altyapi:pwa-install-dismissed";

function isInstallPromptEvent(event: Event): event is BeforeInstallPromptEvent {
  const candidate = event as Partial<BeforeInstallPromptEvent>;
  return typeof candidate.prompt === "function" && candidate.userChoice instanceof Promise;
}

function isStandaloneDisplay(): boolean {
  const navigatorWithStandalone = navigator as NavigatorStandalone;
  return window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
}

function wasDismissedThisSession(): boolean {
  try {
    return sessionStorage.getItem(SESSION_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberDismissal(): void {
  try {
    sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

export function InstallPromptHost() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(wasDismissedThisSession);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event): void => {
      if (!isInstallPromptEvent(event) || isStandaloneDisplay()) return;
      event.preventDefault();
      setPromptEvent(event);
    };

    const onAppInstalled = (): void => {
      setPromptEvent(null);
      setInstalling(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    rememberDismissal();
    setDismissed(true);
  }, []);

  const install = useCallback(async () => {
    const current = promptEvent;
    if (!current || installing) return;
    setInstalling(true);
    try {
      await current.prompt();
      await current.userChoice;
      setPromptEvent(null);
    } finally {
      setInstalling(false);
    }
  }, [installing, promptEvent]);

  if (!promptEvent || dismissed || isStandaloneDisplay()) return null;

  return (
    <aside className="install-banner" aria-label="Kent Rehberi uygulamasını yükle">
      <span className="install-banner-icon" aria-hidden="true"><Icon name="download" size={18} /></span>
      <div className="install-banner-copy">
        <strong>Kent Rehberi'ni cihazınıza ekleyin</strong>
        <span>Daha hızlı açılış ve uygulama benzeri tam ekran kullanım için yükleyebilirsiniz.</span>
      </div>
      <button type="button" className="primary-button install-banner-action" disabled={installing} onClick={() => void install()}>
        {installing ? "Hazırlanıyor…" : "Yükle"}
      </button>
      <button type="button" className="icon-ghost install-banner-dismiss" onClick={dismiss} aria-label="Yükleme önerisini kapat">
        <Icon name="close" size={14} />
      </button>
    </aside>
  );
}
