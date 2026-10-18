import { Component, type ErrorInfo, type ReactNode } from "react";
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

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Raw React component stacks and Error messages can contain provider details.
    console.error("[3D Altyapı / Üstyapı Koordinasyon Web Uygulaması] React görüntüleme hatası (ayrıntılar gizlendi).");
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <main className="fatal-screen" role="alert">
        <Icon name="warning" size={34} />
        <h1>3D Altyapı / Üstyapı Koordinasyon Web Uygulaması beklenmeyen bir hatayla durdu</h1>
        <p>
          {import.meta.env.DEV
            ? (this.state.error.message || "Bilinmeyen bir istemci hatası oluştu.")
            : "Harita oturumu güvenli biçimde durduruldu. Sayfayı yeniden yükleyebilir veya yerel tercihleri sıfırlayıp temiz bir oturum başlatabilirsiniz."}
        </p>
        <div className="fatal-actions">
          <button type="button" className="primary-button" onClick={() => window.location.reload()}>
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
