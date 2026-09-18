import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { defaultVisibleFields, filterAttributeRows, formatCell, rowsToCsv } from "../lib/attributeTable";
import type { AttributeTableResult, ServiceDefinition } from "../types";
import { Icon } from "./Icon";

interface Props {
  services: ServiceDefinition[];
  onQuery: (service: ServiceDefinition, limit: number) => Promise<AttributeTableResult>;
}

const limits = [50, 100, 250, 500] as const;

export function DataWorkbench({ services, onQuery }: Props) {
  const queryable = useMemo(
    () => services.filter((service) => service.kind === "FeatureServer" || service.kind === "SceneServer"),
    [services]
  );
  const [serviceId, setServiceId] = useState("");
  const [limit, setLimit] = useState<number>(100);
  const [result, setResult] = useState<AttributeTableResult | null>(null);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const deferredFilter = useDeferredValue(filter);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (queryable.length === 0) {
      setServiceId("");
      return;
    }
    if (serviceId && queryable.some((service) => service.id === serviceId)) return;
    setServiceId(queryable.find((service) => service.visible)?.id ?? queryable[0]!.id);
  }, [queryable, serviceId]);

  const activeService = queryable.find((service) => service.id === serviceId);
  const visibleFields = useMemo(
    () => result?.fields.filter((field) => selectedFields.includes(field.name)) ?? [],
    [result, selectedFields]
  );
  const filteredRows = useMemo(
    () => result ? filterAttributeRows(result.rows, visibleFields.length ? visibleFields : result.fields, deferredFilter) : [],
    [result, visibleFields, deferredFilter]
  );

  const load = async () => {
    if (!activeService || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await onQuery(activeService, limit);
      setResult(next);
      setSelectedFields(defaultVisibleFields(next.fields));
      setFilter("");
    } catch (reason) {
      setResult(null);
      setError(reason instanceof Error ? reason.message : "Öznitelik verisi alınamadı.");
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    if (!result) return;
    const fields = visibleFields.length ? visibleFields : result.fields;
    const csv = rowsToCsv(filteredRows, fields);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeName(result.serviceName)}-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const toggleField = (name: string) => {
    setSelectedFields((current) => {
      if (current.includes(name)) {
        if (current.length === 1) return current;
        return current.filter((item) => item !== name);
      }
      return [...current, name];
    });
  };

  return (
    <div className="operations-body data-workbench">
      <div className="data-workbench-hero">
        <span className="data-hero-icon"><Icon name="database" size={22} /></span>
        <div>
          <strong>Öznitelik Veri Atölyesi</strong>
          <span>FeatureServer ve SceneServer kayıtlarını salt-okunur sorgulayın, filtreleyin ve CSV dışa aktarın.</span>
        </div>
      </div>

      <div className="data-controls">
        <label>
          <span>Katman</span>
          <select value={serviceId} onChange={(event) => { setServiceId(event.target.value); setResult(null); setError(null); }}>
            {queryable.length === 0 && <option value="">Sorgulanabilir servis yok</option>}
            {queryable.map((service) => <option key={service.id} value={service.id}>{service.displayName} · {service.kind}</option>)}
          </select>
        </label>
        <label>
          <span>Kayıt limiti</span>
          <select value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
            {limits.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <button type="button" className="primary-button data-load-button" disabled={!activeService || busy} onClick={() => void load()}>
          <Icon name={busy ? "refresh" : "table"} size={16} /> {busy ? "Sorgulanıyor…" : "Veriyi getir"}
        </button>
      </div>

      {error && <div className="data-error"><Icon name="warning" /><div><strong>Sorgu tamamlanamadı</strong><span>{error}</span></div></div>}

      {result && (
        <>
          <div className="data-summary">
            <div><strong>{result.total.toLocaleString("tr-TR")}</strong><span>toplam kayıt</span></div>
            <div><strong>{result.rows.length.toLocaleString("tr-TR")}</strong><span>yüklenen</span></div>
            <div><strong>{result.fields.length}</strong><span>alan</span></div>
            <div><strong>{new Date(result.fetchedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</strong><span>son sorgu</span></div>
          </div>

          {result.truncated && (
            <div className="health-note compact-note"><Icon name="info" /><div><strong>Örneklenmiş görünüm</strong><span>Serviste daha fazla kayıt var. Tablo performansı için ilk {result.rows.length} kayıt gösteriliyor.</span></div></div>
          )}

          <div className="data-toolbar">
            <label className="search-field data-search">
              <Icon name="search" size={15} />
              <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Yüklenen kayıtlarda ara…" />
              {filter && <button type="button" className="icon-ghost" onClick={() => setFilter("")} aria-label="Filtreyi temizle"><Icon name="close" size={13} /></button>}
            </label>
            <button type="button" className="catalog-action" onClick={exportCsv} disabled={filteredRows.length === 0}>
              <Icon name="download" size={14} /> CSV
            </button>
          </div>

          <details className="field-picker">
            <summary><Icon name="table" size={14} /> Sütunlar <span>{selectedFields.length}/{result.fields.length}</span></summary>
            <div className="field-picker-grid">
              {result.fields.map((field) => (
                <label key={field.name} title={field.name}>
                  <input type="checkbox" checked={selectedFields.includes(field.name)} onChange={() => toggleField(field.name)} />
                  <span>{field.alias}</span>
                </label>
              ))}
            </div>
          </details>

          <div className="attribute-table-wrap">
            <table className="attribute-table">
              <thead>
                <tr>
                  {visibleFields.map((field) => <th key={field.name} title={field.name}>{field.alias}</th>)}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, index) => (
                  <tr key={result.objectIdField && row[result.objectIdField] != null ? String(row[result.objectIdField]) : index}>
                    {visibleFields.map((field) => <td key={field.name} title={formatCell(row[field.name])}>{formatCell(row[field.name])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredRows.length === 0 && <div className="empty-state compact"><Icon name="search" size={22} /><strong>Kayıt bulunamadı</strong><span>Arama ifadesini veya sütun seçimini değiştirin.</span></div>}
          </div>

          <div className="data-footer">
            <span>{filteredRows.length.toLocaleString("tr-TR")} satır gösteriliyor</span>
            <span>Salt-okunur · geometri indirilmez</span>
          </div>
        </>
      )}

      {!result && !error && (
        <div className="empty-state data-empty">
          <Icon name="table" size={30} />
          <strong>Veri görünümünü başlatın</strong>
          <span>Bir FeatureServer veya SceneServer seçip “Veriyi getir” düğmesine basın.</span>
        </div>
      )}
    </div>
  );
}

function safeName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "baskent-cbs";
}
