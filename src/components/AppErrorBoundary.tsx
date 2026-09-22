import { Component, type ErrorInfo, type ReactNode } from "react";
import { clearPreferences } from "../lib/storage";
import { clearApplicationCachesAndReload } from "../lib/clientRecovery";
import { buildLabel } from "../lib/buildInfo";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[Başkent 3B CBS] React render error", error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <main className="fatal-screen" role="alert">
        <div aria-hidden="true" style={{ fontSize: 34 }}>⚠</div>
        <h1>Uygulama beklenmeyen bir hatayla durdu</h1>
        <p>{this.state.error.message || "Bilinmeyen bir istemci hatası oluştu."}</p>
        <small style={{ color: "#718796", marginTop: -4 }}>{buildLabel()}</small>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          <button type="button" className="primary-button" onClick={() => window.location.reload()}>
            Yeniden yükle
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              clearPreferences();
              window.location.reload();
            }}
          >
            Tercihleri sıfırla
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => void clearApplicationCachesAndReload()}
          >
            Önbelleği temizle
          </button>
        </div>
        {import.meta.env.DEV && (
          <details style={{ maxWidth: 760, textAlign: "left", marginTop: 14 }}>
            <summary>Geliştirici ayrıntıları</summary>
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{this.state.error.stack ?? this.state.error.message}</pre>
          </details>
        )}
      </main>
    );
  }
}
