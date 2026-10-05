import { Icon } from "./Icon";

export interface ToastItem {
  id: string;
  message: string;
  tone: "info" | "success" | "error";
}

export function ToastStack({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: string) => void }) {
  return (
    <div className="toast-stack" aria-label="Kent Rehberi bildirimleri">
      {items.map((item) => (
        <div
          key={item.id}
          className={`toast toast-${item.tone}`}
          role={item.tone === "error" ? "alert" : "status"}
          aria-live={item.tone === "error" ? "assertive" : "polite"}
          aria-atomic="true"
        >
          <span className="toast-icon" aria-hidden="true">
            <Icon name={item.tone === "success" ? "check" : item.tone === "error" ? "warning" : "info"} size={16} />
          </span>
          <span className="toast-message">{item.message}</span>
          <button
            type="button"
            className="toast-dismiss"
            onClick={() => onDismiss(item.id)}
            aria-label="Bildirimi kapat"
            title="Bildirimi kapat"
          >
            <Icon name="close" size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
