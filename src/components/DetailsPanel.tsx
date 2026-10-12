import { useState } from "react";
import type { IdentifyResult } from "../types";
import { Icon } from "./Icon";

export function DetailsPanel({ result, onClose }: { result: IdentifyResult | null; onClose: () => void }) {
  const [search, setSearch] = useState<{ result: IdentifyResult | null; text: string }>({ result: null, text: "" });
  const query = search.result === result ? search.text : "";
  const normalized = query.trim().normalize("NFKC").toLocaleLowerCase("tr-TR");
  const attributes = result?.attributes.filter((item) =>
    !normalized || `${item.key} ${item.value}`.normalize("NFKC").toLocaleLowerCase("tr-TR").includes(normalized)
  ) ?? [];
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
      <div className="details-search">
        <label className="search-field">
          <Icon name="search" size={15} />
          <input type="search" aria-label="Özniteliklerde ara" placeholder="Alan adı veya değer ara…" value={query} onChange={(event) => setSearch({ result, text: event.target.value })} />
        </label>
        <span role="status" aria-live="polite">{attributes.length} / {result.attributes.length} alan</span>
      </div>
      <dl className="details-grid">
        {attributes.map((item) => (
          <div key={item.key}><dt>{item.key}</dt><dd>{item.value}</dd></div>
        ))}
      </dl>
      {attributes.length === 0 && <p className="details-empty">{result.attributes.length ? "Aramanızla eşleşen alan bulunamadı." : "Bu nesnenin öznitelik bilgisi bulunmuyor."}</p>}
    </aside>
  );
}
