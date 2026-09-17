import type { IdentifyResult } from "../types";
import { Icon } from "./Icon";

export function DetailsPanel({ result, onClose }: { result: IdentifyResult | null; onClose: () => void }) {
  if (!result) return null;
  return (
    <aside className="details-drawer" aria-label="Seçili nesne detayları">
      <div className="details-header">
        <div>
          <span className="eyebrow">SEÇİLİ NESNE</span>
          <h3>{result.title}</h3>
          {result.subtitle && <p>{result.subtitle}</p>}
        </div>
        <button type="button" className="icon-ghost" onClick={onClose} aria-label="Detayları kapat"><Icon name="close" /></button>
      </div>
      <div className="details-grid">
        {result.attributes.length === 0 && <div className="empty-state compact">Öznitelik bulunamadı.</div>}
        {result.attributes.map((item) => (
          <div key={item.key}><dt>{item.key}</dt><dd>{item.value}</dd></div>
        ))}
      </div>
    </aside>
  );
}
