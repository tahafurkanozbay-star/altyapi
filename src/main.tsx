import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/app.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root bulunamadı.");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("./sw.js").catch(() => undefined);
  });
}
