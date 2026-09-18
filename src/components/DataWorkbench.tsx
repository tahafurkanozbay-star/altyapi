import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { defaultVisibleFields, filterAttributeRows, formatCell, rowsToCsv } from "../lib/attributeTable";
import { isNumericField } from "../lib/queryBuilder";
import type {
  AttributeFilter,
  AttributeQueryOptions,
  AttributeTableResult,
  QueryOperator,
  ServiceDefinition
} from "../types";
import { Icon } from "./Icon";

interface Props {
  services: ServiceDefinition[];
  onQuery: (service: ServiceDefinition, options: AttributeQueryOptions) => Promise<AttributeTableResult>;
}

const limits = [50, 100, 250, 500] as const;

const textOperators: Array<{ value: QueryOperator; label: string }> = [
  { value: "contains", label: "İçerir" },
  { value: "startsWith", label: "İle başlar" },
  { value: "eq", label: "Eşittir" },
  { value: "ne", label: "Eşit değildir" },
  { value: "isNull", label: "Boş" },
  { value: "isNotNull", label: "Boş değil" }
];

const numericOperators: Array<{ value: QueryOperator; label: string }> = [
  { value: "eq", label: "=" },
  { value: "ne", label: "≠" },
  { value: "gt", label: ">" },
  { value: "gte", label: "≥" },
  { value: "lt", label: "<" },
  { value: "lte", label: "≤" },
  { value: "isNull", label: "Boş" },
  { value: "isNotNull", label: "Boş değil" }
];

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
  const [serverField, setServerField] = useState("");
  const [serverOperator, setServerOperator] = useState<QueryOperator>("contains");
  const [serverValue, setServerValue] = useState("");
  const [sortField, setSortField] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [offset, setOffset] = useState(0);

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

  const activeServerField = result?.fields.find((field) => field.name === serverField);
  const operatorOptions = activeServerField && isNumericField(activeServerField) ? numericOperators : textOperators;
  const operatorNeedsValue = serverOperator !== "isNull" && serverOperator !== "isNotNull";

  useEffect(() => {
    if (!operatorOptions.some((option) => option.value === serverOperator)) {
      setServerOperator(operatorOptions[0]!.value);
    }
  }, [operatorOptions, serverOperator]);

  const buildOptions = (targetOffset: number): AttributeQueryOptions => {
    const serverFilter: AttributeFilter | undefined = serverField
      ? { field: serverField, operator: serverOperator, value: operatorNeedsValue ? serverValue : undefined }
      : undefined;
    return {
      limit,
      offset: targetOffset,
      filter: serverFilter,
      orderByField: sortField || undefined,
      order: sortField ? sortOrder : undefined
    };
  };

  const load = async (targetOffset = offset) => {
    if (!activeService || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await onQuery(activeService, buildOptions(targetOffset));
      setResult(next);
      setSelectedFields((current) => current.length ? current.filter((name) => next.fields.some((field) => field.name === name)) : defaultVisibleFields(next.fields));
      setOffset(next.offset ?? targetOffset);
      setFilter("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Öznitelik verisi alınamadı.");
    } finally {
      setBusy(false);
    }
  };

  const resetQuery = () => {
    setServerField("");
    setServerOperator("contains");
    setServerValue("");
    setSortField("");
    setSortOrder("asc");
    setOffset(0);
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

  const changeService = (nextServiceId: string) => {
    setServiceId(nextServiceId);
    setResult(null);
    setError(null);
    setSelectedFields([]);
    setFilter("");
    resetQuery();
  };

  const canGoBack = (result?.offset ?? 0) > 0;
  const canGoForward = Boolean(result?.hasMore);

  return (
    <div className="operations-body data-workbench">
      <div className="data-workbench-hero">
        <span className="data-hero-icon"><Icon name="database" size={22} /></span>
        <div>
          <strong>Öznitelik Veri Atölyesi</strong>
          <span>Servis tarafında filtreleyin ve sıralayın; yüklenen kayıtları yerelde arayın, sütunları yönetin ve CSV dışa aktarın.</span>
        </div>
      </div>

      <div className="data-controls">
        <label>
          <span>Katman</span>
          <select value={serviceId} onChange={(event) => changeService(event.target.value)}>
            {queryable.length === 0 && <option value="">Sorgulanabilir servis yok</option>}
            {queryable.map((service) => <option key={service.id} value={service.id}>{service.displayName} · {service.kind}</option>)}
          </select>
        </label>
        <label>
          <span>Sayfa boyutu</span>
          <select value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setOffset(0); }}>
            {limits.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <button type="button" className="primary-button data-load-button" disabled={!activeService || busy} onClick={() => void load(0)}>
          <Icon name={busy ? "refresh" : "table"} size={16} /> {busy ? "Sorgulanıyor…" : result ? "Sorguyu yenile" : "Veriyi getir"}
        </button>
      </div>

      {result && (
        <details className="query-builder" open={Boolean(serverField || sortField)}>
          <summary><Icon name="search" size={14} /> Sunucu sorgusu <span>{result.where && result.where !== "1=1" ? "filtre aktif" : "opsiyonel"}</span></summary>
          <div className="query-builder-grid">
            <label className="query-field">
              <span>Filtre alanı</span>
              <select value={serverField} onChange={(event) => { setServerField(event.target.value); setServerValue(""); setOffset(0); }}>
                <option value="">Filtre yok</option>
                {result.fields.map((field) => <option key={field.name} value={field.name}>{field.alias}</option>)}
              </select>
            </label>

            <label className="query-operator">
              <span>Operatör</span>
              <select value={serverOperator} disabled={!serverField} onChange={(event) => setServerOperator(event.target.value as QueryOperator)}>
                {operatorOptions.map((operator) => <option key={operator.value} value={operator.value}>{operator.label}</option>)}
              </select>
            </label>

            <label className="query-value">
              <span>Değer</span>
              <input
                value={serverValue}
                disabled={!serverField || !operatorNeedsValue}
                inputMode={activeServerField && isNumericField(activeServerField) ? "decimal" : "text"}
                onChange={(event) => setServerValue(event.target.value)}
                placeholder={operatorNeedsValue ? "Filtre değeri…" : "Değer gerekmiyor"}
              />
            </label>

            <label className="query-sort">
              <span>Sırala</span>
              <select value={sortField} onChange={(event) => { setSortField(event.target.value); setOffset(0); }}>
                <option value="">Varsayılan</option>
                {result.fields.map((field) => <option key={field.name} value={field.name}>{field.alias}</option>)}
              </select>
            </label>

            <label className="query-order">
              <span>Yön</span>
              <select value={sortOrder} disabled={!sortField} onChange={(event) => setSortOrder(event.target.value as "asc" | "desc")}>
                <option value="asc">Artan</option>
                <option value="desc">Azalan</option>
              </select>
            </label>
          </div>
          <div className="query-builder-actions">
            <button type="button" className="catalog-action" onClick={resetQuery} disabled={!serverField && !sortField}><Icon name="refresh" size={14} /> Temizle</button>
            <button
              type="button"
              className="primary-button"
              onClick={() => void load(0)}
              disabled={busy || (Boolean(serverField) && operatorNeedsValue && !serverValue.trim())}
            >
              <Icon name="search" size={14} /> Sunucuda uygula
            </button>
          </div>
        </details>
      )}

      {error && <div className="data-error"><Icon name="warning" /><div><strong>Sorgu tamamlanamadı</strong><span>{error}</span></div></div>}

      {result && (
        <>
          <div className="data-summary">
            <div><strong>{result.total.toLocaleString("tr-TR")}</strong><span>eşleşen kayıt</span></div>
            <div><strong>{result.rows.length.toLocaleString("tr-TR")}</strong><span>bu sayfada</span></div>
            <div><strong>{result.fields.length}</strong><span>alan</span></div>
            <div><strong>{new Date(result.fetchedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</strong><span>son sorgu</span></div>
          </div>

          {(result.where && result.where !== "1=1" || result.orderBy) && (
            <div className="query-summary" aria-label="Aktif sunucu sorgusu">
              <Icon name="info" size={14} />
              <span>{result.where && result.where !== "1=1" ? result.where : "Filtre yok"}{result.orderBy ? ` · ORDER BY ${result.orderBy}` : ""}</span>
            </div>
          )}

          <div className="data-toolbar">
            <label className="search-field data-search">
              <Icon name="search" size={15} />
              <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Bu sayfadaki kayıtlarda ara…" />
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
            {filteredRows.length === 0 && <div className="empty-state compact"><Icon name="search" size={22} /><strong>Kayıt bulunamadı</strong><span>Yerel arama ifadesini veya sunucu sorgusunu değiştirin.</span></div>}
          </div>

          <div className="data-pagination">
            <button type="button" className="catalog-action" disabled={!canGoBack || busy} onClick={() => void load(Math.max(0, (result.offset ?? 0) - (result.limit ?? limit)))}>
              ‹ Önceki
            </button>
            <span>{result.total === 0 ? "0" : `${(result.offset ?? 0) + 1}–${Math.min(result.total, (result.offset ?? 0) + result.rows.length)}`} / {result.total.toLocaleString("tr-TR")}</span>
            <button type="button" className="catalog-action" disabled={!canGoForward || busy} onClick={() => void load((result.offset ?? 0) + (result.limit ?? limit))}>
              Sonraki ›
            </button>
          </div>

          <div className="data-footer">
            <span>{filteredRows.length.toLocaleString("tr-TR")} satır görünür</span>
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
