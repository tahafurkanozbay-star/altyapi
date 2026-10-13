import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** App and platform notices share one scrollable surface outside the map shell. */
export function NotificationPortal({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setHost(document.getElementById("kent-rehberi-notices"));
  }, []);
  return host ? createPortal(children, host) : null;
}
