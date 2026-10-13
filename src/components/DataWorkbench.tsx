import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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
  const queryGenerationRef = useRef(0);
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
  const [failedQuery, setFailedQuery] = useState<AttributeQueryOptions | null>(null);

  useEffect(() => () => {
    queryGenerationRef.current += 1;
  }, []);

  useEffect(() => {
    if (queryable.length === 0) {
      if (serviceId) queryGenerationRef.current += 1;
      setServiceId("");
      setBusy(false);
      return;
    }
    if (serviceId && queryable.some((service) => service.id === serviceId)) return;
    queryGenerationRef.current += 1;
    setBusy(false);
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
    if (serverField && !result.fields.some((field) => field.name === serverField)) setServerField("");
  }, [result, serverField]);

  useEffect(() => {
    if (!operatorOptions.some((option) => option.value === serverOperator)) {
      setServerOperator(operatorOptions[0]!.value);
    }
  }, [operatorOptions, serverOperator]);

  const load = async (
    offset = 0,
    nextFilter: AttributeFilter | undefined | null = appliedFilter,
    nextSort: AttributeQueryOptions["orderBy"] | null = appliedSort,
    requestedLimit = limit
  ) => {
    if (!activeService || busy) return;
    const generation = ++queryGenerationRef.current;
    const requestedService = activeService;
    setBusy(true);
    setError(null);
    setFailedQuery(null);
    const options = { limit: requestedLimit, offset, filter: nextFilter ?? undefined, orderBy: nextSort ?? undefined };
    try {
      const next = await onQuery(requestedService, options);
      if (generation !== queryGenerationRef.current) return;
      setResult(next);
      setLimit(next.limit);
      setAppliedFilter(options.filter);
      setAppliedSort(options.orderBy);
      setSelectedFields((current) => {
        const available = new Set(next.fields.map((field) => field.name));
        const retained = current.filter((field) => available.has(field));
        return retained.length ? retained : defaultVisibleFields(next.fields);
      });
      setFilter("");
    } catch (reason) {
      if (generation !== queryGenerationRef.current) return;
      setError(reason instanceof Error ? reason.message : "Öznitelik verisi alınamadı.");
      setFailedQuery(options);
      if (result) setLimit(result.limit);
    } finally {
      if (generation === queryGenerationRef.current) setBusy(false);
    }
  };

  const applyServerQuery = async () => {
    if (!result || busy || (serverField && filterNeedsValue(serverOperator) && !serverValue.trim())) return;
    const nextFilter: AttributeFilter | undefined = serverField ? {
      field: serverField,
      operator: serverOperator,
      ...(filterNeedsValue(serverOperator) ? { value: serverValue } : {})
    } : undefined;
    const nextSort = sortField ? { field: sortField, direction: sortDirection } as const : undefined;
    await load(0, nextFilter ?? null, nextSort ?? null);
  };

  const clearServerQuery = async () => {
    setServerField("");
    setServerValue("");
    setSortField("");
    setSortDirection("asc");
    await load(0, null, null);
  };

  const retryQuery = () => {
    if (!failedQuery) return;
    void load(failedQuery.offset, failedQuery.filter ?? null, failedQuery.orderBy ?? null, failedQuery.limit);
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
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
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
    queryGenerationRef.current += 1;
    setBusy(false);
    setServiceId(id);
    setResult(null);
    setError(null);
    setFailedQuery(null);
    setFilter("");
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
          <strong>Harita verisini inceleyin</strong>
          <span>Katman seçin, kayıtları filtreleyin ve sonuç tablosunu CSV olarak indirin.</span>
        </div>
      </div>

      <div className="data-controls">
        <label>
          <span>Katman</span>
          <select value={serviceId} disabled={queryable.length === 0} onChange={(event) => resetForService(event.target.value)}>
            {queryable.length === 0 && <option value="">Sorgulanabilir servis yok</option>}
            {queryable.map((service) => <option key={service.id} value={service.id}>{service.displayName} · {service.kind}</option>)}
          </select>
        </label>
        <label>
          <span>Sayfa boyutu</span>
          <select value={limit} disabled={busy || !activeService} onChange={(event) => {
            const nextLimit = Number(event.target.value);
            setLimit(nextLimit);
            if (result) void load(0, appliedFilter, appliedSort, nextLimit);
          }}>
            {limits.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <button type="button" className="primary-button data-load-button" disabled={!activeService || busy} onClick={() => void load(0)}>
          <Icon name={busy ? "refresh" : "table"} size={16} /> {busy ? "Sorgulanıyor…" : "Veriyi getir"}
        </button>
      </div>

      <div className="data-query-status" role="status" aria-live="polite" aria-atomic="true">
        {busy ? <><Icon name="refresh" size={16} /> Kayıtlar yükleniyor…</> : result && !error ? `${result.total.toLocaleString("tr-TR")} kayıt bulundu. Bu sayfada ${result.rows.length.toLocaleString("tr-TR")} kayıt var.` : null}
      </div>

      {error && (
        <div className="data-error" role="alert">
          <Icon name="warning" />
          <div>
            <strong>Sorgu tamamlanamadı</strong>
            <span>{error}</span>
            {result && <span>Son başarılı sonuçlar gösteriliyor.</span>}
            {failedQuery && <button type="button" className="catalog-action" disabled={busy} onClick={retryQuery}><Icon name="refresh" size={14} /> Yeniden dene</button>}
          </div>
        </div>
      )}

      <div className="data-results" aria-busy={busy}>

      {result && (
        <>
          <details className="server-query-studio">
            <summary className="server-query-heading">
              <strong>Filtre ve sıralama</strong>
              {(appliedFilter || appliedSort) && <span className="query-active-badge">Uygulandı</span>}
            </summary>
            <p className="server-query-note">Bir filtre seçebilir veya yalnızca sıralama uygulayabilirsiniz. Bu ayarlar tüm kayıtlarda çalışır.</p>
            <form onSubmit={(event) => { event.preventDefault(); void applyServerQuery(); }}>
            <div className="server-query-grid">
              <label>
                <span>Alan</span>
                <select value={serverField} disabled={busy} onChange={(event) => { setServerField(event.target.value); setServerValue(""); }}>
                  <option value="">Filtre yok</option>
                  {result.fields.map((field) => <option key={field.name} value={field.name}>{field.alias}</option>)}
                </select>
              </label>
              <label>
                <span>Operatör</span>
                <select value={serverOperator} disabled={busy || !serverField} onChange={(event) => setServerOperator(event.target.value as AttributeFilterOperator)}>
                  {operatorOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="server-value-field">
                <span>Değer</span>
                <input
                  value={serverValue}
                  onChange={(event) => setServerValue(event.target.value)}
                  disabled={busy || !serverField || !filterNeedsValue(serverOperator)}
                  required={Boolean(serverField) && filterNeedsValue(serverOperator)}
                  inputMode={/integer|double|single|oid|int|float/i.test(selectedServerField?.type ?? "") ? "decimal" : "text"}
                  placeholder={!serverField ? "Önce bir filtre alanı seçin" : filterNeedsValue(serverOperator) ? "Filtre değeri…" : "Değer gerekmiyor"}
                />
              </label>
              <label>
                <span>Sırala</span>
                <select value={sortField} disabled={busy} onChange={(event) => setSortField(event.target.value)}>
                  <option value="">Sıralama yok</option>
                  {result.fields.map((field) => <option key={field.name} value={field.name}>{field.alias}</option>)}
                </select>
              </label>
              <label>
                <span>Yön</span>
                <select value={sortDirection} onChange={(event) => setSortDirection(event.target.value as "asc" | "desc")} disabled={busy || !sortField}>
                  <option value="asc">Artan</option>
                  <option value="desc">Azalan</option>
                </select>
              </label>
            </div>
            <div className="server-query-actions">
              <button type="submit" className="primary-button" disabled={busy || Boolean(serverField && filterNeedsValue(serverOperator) && !serverValue.trim())}>
                <Icon name="search" size={14} /> Sorguyu uygula
              </button>
              <button type="button" className="catalog-action" disabled={busy || (!appliedFilter && !appliedSort)} onClick={() => void clearServerQuery()}>
                <Icon name="refresh" size={14} /> Temizle
              </button>
            </div>
            </form>
            <details className="query-preview">
              <summary>Sorgu ayrıntıları</summary>
              <div className="query-expression" title={result.where}>
                <span>WHERE</span><code>{result.where}</code>
                {result.orderBy && <><span>ORDER</span><code>{result.orderBy}</code></>}
              </div>
            </details>
          </details>

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
            <span>{(result.rows.length ? result.offset + 1 : 0).toLocaleString("tr-TR")}–{Math.min(result.offset + result.rows.length, result.total).toLocaleString("tr-TR")} / {result.total.toLocaleString("tr-TR")}</span>
            <button type="button" className="catalog-action" disabled={busy || !result.hasNext} onClick={() => void load(result.offset + result.limit)}>
              Sonraki ›
            </button>
          </div>

          <div className="data-toolbar">
            <label className="search-field data-search">
              <Icon name="search" size={15} />
              <input aria-label="Bu sayfada hızlı ara" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Bu sayfada hızlı ara…" />
              {filter && <button type="button" className="icon-ghost" onClick={() => setFilter("")} aria-label="Filtreyi temizle"><Icon name="close" size={13} /></button>}
            </label>
            <button type="button" className="catalog-action" onClick={exportCsv} disabled={busy || filteredRows.length === 0} aria-label={`Görünen ${filteredRows.length} kaydı CSV olarak indir`}>
              <Icon name="download" size={14} /> CSV indir
            </button>
          </div>

          <details className="field-picker">
            <summary><Icon name="table" size={14} /> Sütunlar <span>{selectedFields.length}/{result.fields.length}</span></summary>
            <div className="field-picker-grid">
              {result.fields.map((field) => (
                <label key={field.name} title={field.name}>
                  <input type="checkbox" checked={selectedFields.includes(field.name)} disabled={selectedFields.length === 1 && selectedFields.includes(field.name)} onChange={() => toggleField(field.name)} />
                  <span>{field.alias}</span>
                </label>
              ))}
            </div>
            <p className="field-picker-note">En az bir sütun seçili kalır.</p>
          </details>

          <div className="attribute-table-wrap" role="region" aria-label="Öznitelik sonuç tablosu" tabIndex={0}>
            <table className="attribute-table">
              <caption className="visually-hidden">{result.serviceName} öznitelik sonuçları</caption>
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
            {filteredRows.length === 0 && <div className="empty-state compact"><Icon name="search" size={22} /><strong>Kayıt bulunamadı</strong><span>{filter ? "Bu sayfadaki aramayla eşleşen kayıt yok." : "Seçilen sorguyla eşleşen kayıt yok."}</span>{filter ? <button type="button" className="catalog-action" onClick={() => setFilter("")}>Sayfa aramasını temizle</button> : (appliedFilter || appliedSort) ? <button type="button" className="catalog-action" disabled={busy} onClick={() => void clearServerQuery()}>Sorguyu temizle</button> : null}</div>}
          </div>

          <div className="data-footer">
            <span>{filteredRows.length.toLocaleString("tr-TR")} satır gösteriliyor</span>
            <span>CSV yalnızca bu sayfadaki görünen kayıtları içerir.</span>
          </div>
        </>
      )}

      {!result && !error && !busy && (
        <div className="empty-state data-empty">
          <Icon name="table" size={30} />
          <strong>{activeService ? "Katman kayıtlarını görüntüleyin" : "Sorgulanabilir katman yok"}</strong>
          <span>{activeService ? "Bir katman seçin ve Veriyi getir düğmesiyle kayıtları yükleyin." : "Bu katalogdaki katmanlar öznitelik sorgusunu desteklemiyor."}</span>
        </div>
      )}
      </div>
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
