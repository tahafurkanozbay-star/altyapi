import { useCallback, useEffect, useRef, useState } from "react";
import type { ToastItem } from "../components/ToastStack";

const MAX_TOASTS = 4;
const TOAST_TTL_MS: Record<ToastItem["tone"], number> = {
  success: 4_200,
  info: 5_200,
  error: 7_000
};

export function useToastQueue() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, number>());

  const dismissToast = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.current.delete(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const pushToast = useCallback((message: string, tone: ToastItem["tone"] = "info") => {
    const normalized = message.replace(/\s+/g, " ").trim().slice(0, 240);
    if (!normalized) return;

    const id = createId();
    setItems((current) => [...current.slice(-(MAX_TOASTS - 1)), { id, message: normalized, tone }]);
    const timer = window.setTimeout(() => {
      timers.current.delete(id);
      setItems((current) => current.filter((item) => item.id !== id));
    }, TOAST_TTL_MS[tone]);
    timers.current.set(id, timer);
  }, []);

  useEffect(() => () => {
    for (const timer of timers.current.values()) window.clearTimeout(timer);
    timers.current.clear();
  }, []);

  return { items, pushToast, dismissToast } as const;
}

function createId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
