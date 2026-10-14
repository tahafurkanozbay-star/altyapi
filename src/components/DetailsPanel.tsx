import { useRef, useState } from "react";
import type { IdentifyResult } from "../types";
import { Icon } from "./Icon";

export function DetailsPanel({ result, onClose }: { result: IdentifyResult | null; onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState<{ result: IdentifyResult | null; text: string }>({ result: null, text: "" });
  const query = search.result === result ? search.text : "";
  const normalized = query.trim().normalize("NFKC").toLocaleLowerCase("tr-TR");
  const attributes = result?.attributes.filter((item) =>
    !normalized || `${item.key} ${item.value}`.normalize("NFKC").toLocaleLowerCase("tr-TR").includes(normalized)
  ) ?? [];
  const clearSearch = () => {
    setSearch({ result, text: "" });
    inputRef.current?.focus();
  };
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
          <input ref={inputRef} type="search" aria-label="Özniteliklerde ara" placeholder="Alan adı veya değer ara…" value={query} onChange={(event) => setSearch({ result, text: event.target.value })} />
          {query && <button type="button" className="icon-ghost" onClick={clearSearch} aria-label="Öznitelik aramasını temizle"><Icon name="close" size={15} /></button>}
        </label>
        <span role="status" aria-live="polite">{attributes.length} / {result.attributes.length} alan</span>
      </div>
      <div className="details-content" role="region" aria-label="Nesne öznitelikleri" tabIndex={0}>
      <dl className="details-grid">
        {attributes.map((item) => (
          <div key={item.key}><dt>{item.key}</dt><dd>{item.value}</dd></div>
        ))}
      </dl>
      {attributes.length === 0 && <div className="details-empty"><p>{result.attributes.length ? "Aramanızla eşleşen alan bulunamadı." : "Bu nesnenin öznitelik bilgisi bulunmuyor."}</p>{normalized && <button type="button" className="catalog-action" onClick={clearSearch}>Aramayı temizle</button>}</div>}
      </div>
    </aside>
  );
}
