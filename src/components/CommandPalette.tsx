import { useEffect, useMemo, useRef, useState } from "react";
import { mapTools } from "./ToolRail";
import type { PanelId, ServiceDefinition, ToolId } from "../types";
import { Icon, type IconName } from "./Icon";

interface Props {
  open: boolean;
  services: ServiceDefinition[];
  onClose: () => void;
  onLayer: (service: ServiceDefinition) => void;
  onTool: (tool: Exclude<ToolId, null>) => void;
  onPanel: (panel: Exclude<PanelId, null>) => void;
  onHome: () => void;
  onScreenshot: () => void;
}

type Command = {
  id: string;
  label: string;
  subtitle: string;
  icon: IconName;
  keywords: string;
  run: () => void;
};

export function CommandPalette({ open, services, onClose, onLayer, onTool, onPanel, onHome, onScreenshot }: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(() => [
    { id: "home", label: "Başlangıç görünümüne dön", subtitle: "Harita", icon: "home", keywords: "home başlangıç ankara", run: onHome },
    { id: "overview", label: "Operasyon özetini aç", subtitle: "Intelligence", icon: "dashboard", keywords: "operasyon özet hazırlık skor dashboard intelligence durum", run: () => onPanel("overview") },
    { id: "layers", label: "Katman kataloğunu aç", subtitle: "Panel", icon: "layers", keywords: "katman servis katalog", run: () => onPanel("layers") },
    { id: "data", label: "Sorgu stüdyosunu aç", subtitle: "Veri", icon: "table", keywords: "öznitelik tablo csv veri sorgu feature kayıt filtre sıralama", run: () => onPanel("data") },
    { id: "workspace", label: "Çalışma alanı paketini aç", subtitle: "Oturum", icon: "archive", keywords: "çalışma alanı workspace dışa aktar içe aktar yedek json", run: () => onPanel("workspace") },
    { id: "health", label: "Servis sağlığını aç", subtitle: "Panel", icon: "health", keywords: "servis sağlık hata durum", run: () => onPanel("health") },
    { id: "diagnostics", label: "Sistem tanılamayı aç", subtitle: "Platform", icon: "speed", keywords: "webgl gpu cihaz sistem tanılama performans", run: () => onPanel("diagnostics") },
    { id: "bookmarks", label: "Yer imlerini aç", subtitle: "Panel", icon: "bookmark", keywords: "yer imi bookmark", run: () => onPanel("bookmarks") },
    { id: "shot", label: "Ekran görüntüsü al", subtitle: "Harita", icon: "camera", keywords: "ekran screenshot png indir", run: onScreenshot },
    ...mapTools.map((tool) => ({
      id: `tool-${tool.id}`,
      label: tool.label,
      subtitle: "3B araç",
      icon: tool.icon as IconName,
      keywords: `${tool.label} ${tool.keywords.join(" ")}`,
      run: () => onTool(tool.id)
    })),
    ...services.map((service) => ({
      id: `layer-${service.id}`,
      label: service.displayName,
      subtitle: `${service.kind} · ${service.visible ? "Açık" : "Kapalı"}`,
      icon: service.visible ? "eye" as const : "layers" as const,
      keywords: `${service.displayName} ${service.organization} ${service.owner} ${service.kind}`,
      run: () => onLayer(service)
    }))
  ], [services, onHome, onPanel, onScreenshot, onTool, onLayer]);

  const results = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    if (!needle) return commands.slice(0, 16);
    return commands.filter((command) => `${command.label} ${command.subtitle} ${command.keywords}`.toLocaleLowerCase("tr-TR").includes(needle)).slice(0, 18);
  }, [commands, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => setSelected((value) => Math.min(value, Math.max(0, results.length - 1))), [results.length]);

  if (!open) return null;
  return (
    <div className="command-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="command-palette" role="dialog" aria-modal="true" aria-label="Komut paleti">
        <div className="command-search"><Icon name="search" /><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); setSelected((value) => Math.min(results.length - 1, value + 1)); }
          if (event.key === "ArrowUp") { event.preventDefault(); setSelected((value) => Math.max(0, value - 1)); }
          if (event.key === "Enter" && results[selected]) { results[selected].run(); onClose(); }
          if (event.key === "Escape") onClose();
        }} placeholder="Katman, araç veya komut ara…" /><kbd>ESC</kbd></div>
        <div className="command-results">
          {results.map((command, index) => (
            <button key={command.id} type="button" className={index === selected ? "is-selected" : ""} onMouseEnter={() => setSelected(index)} onClick={() => { command.run(); onClose(); }}>
              <span className="command-icon"><Icon name={command.icon} /></span>
              <span><strong>{command.label}</strong><small>{command.subtitle}</small></span>
              <Icon name="chevron" size={15} />
            </button>
          ))}
          {results.length === 0 && <div className="empty-state compact">Komut bulunamadı.</div>}
        </div>
        <div className="command-footer"><span><kbd>↑</kbd><kbd>↓</kbd> seç</span><span><kbd>Enter</kbd> çalıştır</span><span><kbd>Esc</kbd> kapat</span></div>
      </div>
    </div>
  );
}
