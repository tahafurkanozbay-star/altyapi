import { Component, type ErrorInfo, type ReactNode } from "react";
import { Icon } from "./Icon";

interface Props {
  children: ReactNode;
  resetKey: string;
  onClose: () => void;
}

interface State {
  failed: boolean;
}

export class PanelErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[Ankara Kent Rehberi] Panel render error", error, info.componentStack);
  }

  override componentDidUpdate(previous: Props): void {
    if (previous.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="panel-recovery" role="alert">
        <span className="panel-recovery-icon" aria-hidden="true"><Icon name="warning" size={24} /></span>
        <div>
          <strong>Bu bölüm şu anda hazırlanamadı</strong>
          <p>Harita çalışmaya devam ediyor. Bölümü kapatıp tekrar deneyebilir veya sayfayı yenileyebilirsiniz.</p>
        </div>
        <div className="panel-recovery-actions">
          <button type="button" className="catalog-action" onClick={this.props.onClose}>Paneli kapat</button>
          <button type="button" className="primary-button" onClick={() => window.location.reload()}>
            <Icon name="refresh" size={15} /> Sayfayı yenile
          </button>
        </div>
      </div>
    );
  }
}
