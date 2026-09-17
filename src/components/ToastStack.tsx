import { Icon } from "./Icon";

export interface ToastItem {
  id: string;
  message: string;
  tone: "info" | "success" | "error";
}

export function ToastStack({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: string) => void }) {
  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      {items.map((item) => (
        <button type="button" key={item.id} className={`toast toast-${item.tone}`} onClick={() => onDismiss(item.id)}>
          <Icon name={item.tone === "success" ? "check" : item.tone === "error" ? "warning" : "info"} size={16} />
          <span>{item.message}</span>
          <Icon name="close" size={13} />
        </button>
      ))}
    </div>
  );
}
