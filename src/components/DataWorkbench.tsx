import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { defaultVisibleFields, filterAttributeRows, formatCell, rowsToCsv } from "../lib/attributeTable";
import { filterNeedsValue, filterOperatorsForField } from "../lib/attributeQuery";
import type {
  AttributeFilter,
  AttributeFilterOperator,
  AttributeQueryOptions,
  AttributeTableResult,
  ServiceDefinition
} from "../types";
import { Icon } from "./Icon";

interface Props {
  services: ServiceDefinition[];
  onQuery: (service: ServiceDefinition, options: AttributeQueryOptions) => Promise<AttributeTableResult>;
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
  const [serverField, setServerField] = useState("");
  const [serverOperator, setServerOperator] = useState<AttributeFilterOperator>("equals");
  const [serverValue, setServerValue] = useState("");
  const [sortField, setSortField] = useState("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [appliedFilter, setAppliedFilter] = useState<AttributeFilter | undefined>();
  const [appliedSort, setAppliedSort] = useState<AttributeQueryOptions["orderBy"]>();
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
  const selectedServerField = result?.fields.find((field) => field.name === serverField);
  const operatorOptions = useMemo(() => filterOperatorsForField(selectedServerField), [selectedServerField]);

  useEffect(() => {
    if (!result?.fields.length) return;
    if (!serverField || !result.fields.some((field) => field.name === serverField)) {
      setServerField(result.fields[0]!.name);
      setServerOperator(filterOperatorsForField(result.fields[0])[0]!.value);
    }
  }, [result, serverField]);

  useEffect(() => {
    if (!operatorOptions.some((option) => option.value === serverOperator)) {
      setServerOperator(operatorOptions[0]!.value);
    }
  }, [operatorOptions, serverOperator]);

  const load = async (
    offset = 0,
    nextFilter: AttributeFilter | undefined = appliedFilter,
    nextSort: AttributeQueryOptions["orderBy"] = appliedSort
  ) => {
    if (!activeService || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await onQuery(activeService, { limit, offset, filter: nextFilter, orderBy: nextSort });
      setResult(next);
      setSelectedFields((current) => {
        const available = new Set(next.fields.map((field) => field.name));
        const retained = current.filter((field) => available.has(field));
        return retained.length ? retained : defaultVisibleFields(next.fields);
      });
      setFilter("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Öznitelik verisi alınamadı.");
    } finally {
      setBusy(false);
    }
  };

  const applyServerQuery = async () => {
    if (!result || !serverField) return;
    const nextFilter: AttributeFilter = {
      field: serverField,
      operator: serverOperator,
      ...(filterNeedsValue(serverOperator) ? { value: serverValue } : {})
    };
    const nextSort = sortField ? { field: sortField, direction: sortDirection } as const : undefined;
    setAppliedFilter(nextFilter);
    setAppliedSort(nextSort);
    await load(0, nextFilter, nextSort);
  };

  const clearServerQuery = async () => {
    setAppliedFilter(undefined);
    setAppliedSort(undefined);
    setServerValue("");
    setSortField("");
    setSortDirection("asc");
    await load(0, undefined, undefined);
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

  const resetForService = (id: string) => {
    setServiceId(id);
    setResult(null);
    setError(null);
    setAppliedFilter(undefined);
    setAppliedSort(undefined);
    setServerField("");
    setServerValue("");
    setSortField("");
    setSortDirection("asc");
  };

  return (
    <div className="operations-body data-workbench">
      <div className="data-workbench-hero">
        <span className="data-hero-icon"><Icon name="database" size={22} /></span>
        <div>
          <strong>Öznitelik Sorgu Stüdyosu</strong>
          <span>Sunucu tarafı filtreleme, sıralama ve sayfalama ile FeatureServer / SceneServer verilerini kontrollü inceleyin.</span>
        </div>
      </div>

      <div className="data-controls">
        <label>
          <span>Katman</span>
          <select value={serviceId} onChange={(event) => resetForService(event.target.value)}>
            {queryable.length === 0 && <option value="">Sorgulanabilir servis yok</option>}
            {queryable.map((service) => <option key={service.id} value={service.id}>{service.displayName} · {service.kind}</option>)}
          </select>
        </label>
        <label>
          <span>Sayfa boyutu</span>
          <select value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
            {limits.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <button type="button" className="primary-button data-load-button" disabled={!activeService || busy} onClick={() => void load(0)}>
          <Icon name={busy ? "refresh" : "table"} size={16} /> {busy ? "Sorgulanıyor…" : "Veriyi getir"}
        </button>
      </div>

      {error && <div className="data-error"><Icon name="warning" /><div><strong>Sorgu tamamlanamadı</strong><span>{error}</span></div></div>}

      {result && (
        <>
          <section className="server-query-studio" aria-label="Sunucu sorgusu">
            <div className="server-query-heading">
              <div><strong>Sunucu sorgusu</strong><span>Filtreler servis tarafında çalışır; yalnız ilgili sayfa tarayıcıya gelir.</span></div>
              {(appliedFilter || appliedSort) && <span className="query-active-badge">AKTİF</span>}
            </div>
            <div className="server-query-grid">
              <label>
                <span>Alan</span>
                <select value={serverField} onChange={(event) => setServerField(event.target.value)}>
                  {result.fields.map((field) => <option key={field.name} value={field.name}>{field.alias}</option>)}
                </select>
              </label>
              <label>
                <span>Operatör</span>
                <select value={serverOperator} onChange={(event) => setServerOperator(event.target.value as AttributeFilterOperator)}>
                  {operatorOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="server-value-field">
                <span>Değer</span>
                <input
                  value={serverValue}
                  onChange={(event) => setServerValue(event.target.value)}
                  disabled={!filterNeedsValue(serverOperator)}
                  placeholder={filterNeedsValue(serverOperator) ? "Filtre değeri…" : "Değer gerekmiyor"}
                />
              </label>
              <label>
                <span>Sırala</span>
                <select value={sortField} onChange={(event) => setSortField(event.target.value)}>
                  <option value="">Sıralama yok</option>
                  {result.fields.map((field) => <option key={field.name} value={field.name}>{field.alias}</option>)}
                </select>
              </label>
              <label>
                <span>Yön</span>
                <select value={sortDirection} onChange={(event) => setSortDirection(event.target.value as "asc" | "desc")} disabled={!sortField}>
                  <option value="asc">Artan</option>
                  <option value="desc">Azalan</option>
                </select>
              </label>
            </div>
            <div className="server-query-actions">
              <button type="button" className="primary-button" disabled={busy || !serverField || (filterNeedsValue(serverOperator) && !serverValue.trim())} onClick={() => void applyServerQuery()}>
                <Icon name="search" size={14} /> Sorguyu uygula
              </button>
              <button type="button" className="catalog-action" disabled={busy || (!appliedFilter && !appliedSort)} onClick={() => void clearServerQuery()}>
                <Icon name="refresh" size={14} /> Temizle
              </button>
            </div>
            <div className="query-expression" title={result.where}>
              <span>WHERE</span><code>{result.where}</code>
              {result.orderBy && <><span>ORDER</span><code>{result.orderBy}</code></>}
            </div>
          </section>

          <div className="data-summary">
            <div><strong>{result.total.toLocaleString("tr-TR")}</strong><span>eşleşen kayıt</span></div>
            <div><strong>{result.rows.length.toLocaleString("tr-TR")}</strong><span>bu sayfa</span></div>
            <div><strong>{result.fields.length}</strong><span>alan</span></div>
            <div><strong>{Math.floor(result.offset / result.limit) + 1}</strong><span>sayfa</span></div>
          </div>

          <div className="data-pagination" aria-label="Sunucu sayfalama">
            <button type="button" className="catalog-action" disabled={busy || !result.hasPrevious} onClick={() => void load(Math.max(0, result.offset - result.limit))}>
              ‹ Önceki
            </button>
            <span>{(result.offset + 1).toLocaleString("tr-TR")}–{Math.min(result.offset + result.rows.length, result.total).toLocaleString("tr-TR")} / {result.total.toLocaleString("tr-TR")}</span>
            <button type="button" className="catalog-action" disabled={busy || !result.hasNext} onClick={() => void load(result.offset + result.limit)}>
              Sonraki ›
            </button>
          </div>

          <div className="data-toolbar">
            <label className="search-field data-search">
              <Icon name="search" size={15} />
              <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Bu sayfada hızlı ara…" />
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
                <tr>{visibleFields.map((field) => <th key={field.name} title={field.name}>{field.alias}</th>)}</tr>
              </thead>
              <tbody>
                {filteredRows.map((row, index) => (
                  <tr key={result.objectIdField && row[result.objectIdField] != null ? String(row[result.objectIdField]) : index}>
                    {visibleFields.map((field) => <td key={field.name} title={formatCell(row[field.name])}>{formatCell(row[field.name])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredRows.length === 0 && <div className="empty-state compact"><Icon name="search" size={22} /><strong>Kayıt bulunamadı</strong><span>İstemci aramasını veya sunucu sorgusunu değiştirin.</span></div>}
          </div>

          <div className="data-footer">
            <span>{filteredRows.length.toLocaleString("tr-TR")} satır gösteriliyor</span>
            <span>Salt-okunur · geometri indirilmez · sunucu sayfalama</span>
          </div>
        </>
      )}

      {!result && !error && (
        <div className="empty-state data-empty">
          <Icon name="table" size={30} />
          <strong>Sorgu stüdyosunu başlatın</strong>
          <span>Bir FeatureServer veya SceneServer seçip ilk sayfayı yükleyin.</span>
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
