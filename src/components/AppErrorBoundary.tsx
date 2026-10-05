import { Component, createRef, type ErrorInfo, type ReactNode } from "react";
import { clearPreferences } from "../lib/storage";
import { Icon } from "./Icon";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };
  private readonly fatalRef = createRef<HTMLElement>();

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[Ankara Kent Rehberi] React render error", error, info.componentStack);
  }

  override componentDidUpdate(_previousProps: Props, previousState: State): void {
    if (!previousState.error && this.state.error) {
      this.fatalRef.current?.focus({ preventScroll: true });
    }
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <main
        ref={this.fatalRef}
        className="fatal-screen"
        role="alert"
        aria-labelledby="fatal-screen-title"
        aria-describedby="fatal-screen-description"
        tabIndex={-1}
      >
        <Icon name="warning" size={34} />
        <h1 id="fatal-screen-title">Kent Rehberi beklenmeyen bir hatayla durdu</h1>
        <p id="fatal-screen-description">
          {import.meta.env.DEV
            ? (this.state.error.message || "Bilinmeyen bir istemci hatası oluştu.")
            : "Harita oturumu güvenli biçimde durduruldu. Sayfayı yeniden yükleyebilir veya yerel tercihleri sıfırlayıp temiz bir oturum başlatabilirsiniz."}
        </p>
        <div className="fatal-actions">
          <button type="button" className="primary-button" onClick={() => window.location.reload()} autoFocus>
            <Icon name="refresh" size={16} /> Yeniden yükle
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
        </div>
        {import.meta.env.DEV && (
          <details className="fatal-details">
            <summary>Geliştirici ayrıntıları</summary>
            <pre>{this.state.error.stack ?? this.state.error.message}</pre>
          </details>
        )}
      </main>
    );
  }
}
