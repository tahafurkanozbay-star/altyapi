import type { PanelId, ToolDefinition, ToolId } from "../types";
import { Icon, type IconName } from "./Icon";

export const mapTools: ToolDefinition[] = [
  { id: "legend", label: "Lejant", icon: "legend", keywords: ["lejant", "sembol"] },
  { id: "basemap", label: "Altlık galerisi", icon: "basemap", keywords: ["altlık", "uydu", "harita"] },
  { id: "distance", label: "3B mesafe", icon: "distance", keywords: ["ölç", "mesafe", "uzunluk"] },
  { id: "area", label: "3B alan", icon: "area", keywords: ["ölç", "alan"] },
  { id: "daylight", label: "Gün ışığı", icon: "daylight", keywords: ["güneş", "gölge", "saat"] },
  { id: "slice", label: "Kesit", icon: "slice", keywords: ["kesit", "slice"] },
  { id: "lineOfSight", label: "Görüş hattı", icon: "sight", keywords: ["görüş", "hat"] },
  { id: "elevation", label: "Yükseklik profili", icon: "elevation", keywords: ["profil", "yükseklik", "eğim"] }
];

interface Props {
  activePanel: PanelId;
  activeTool: ToolId;
  onPanel: (panel: Exclude<PanelId, null>) => void;
  onTool: (tool: Exclude<ToolId, null>) => void;
  onHome: () => void;
  onScreenshot: () => void;
  onCommand: () => void;
}

export function ToolRail({ activePanel, activeTool, onPanel, onTool, onHome, onScreenshot, onCommand }: Props) {
  return (
    <nav className="tool-rail" aria-label="CBS komuta araçları">
      <div className="tool-rail-mark" aria-hidden="true"><span>3B</span></div>

      <div className="tool-group" aria-label="Çalışma alanı">
        <span className="tool-group-label">Çalışma alanı</span>
        <ToolButton icon="layers" label="Katman kataloğu" shortcut="L" active={activePanel === "layers"} onClick={() => onPanel("layers")} />
        <ToolButton icon="health" label="Servis sağlığı" active={activePanel === "health"} onClick={() => onPanel("health")} />
        <ToolButton icon="bookmark" label="Yer imleri" active={activePanel === "bookmarks"} onClick={() => onPanel("bookmarks")} />
      </div>

      <div className="tool-group" aria-label="Navigasyon">
        <span className="tool-group-label">Navigasyon</span>
        <ToolButton icon="home" label="Ankara başlangıç görünümü" shortcut="H" onClick={onHome} />
      </div>

      <div className="tool-group tool-group-analysis" aria-label="3B analiz araçları">
        <span className="tool-group-label">3B analiz</span>
        {mapTools.map((tool) => (
          <ToolButton
            key={tool.id}
            icon={tool.icon as IconName}
            label={tool.label}
            active={activeTool === tool.id}
            onClick={() => onTool(tool.id)}
          />
        ))}
      </div>

      <div className="tool-group tool-group-bottom" aria-label="Oturum araçları">
        <span className="tool-group-label">Oturum</span>
        <ToolButton icon="camera" label="Harita ekran görüntüsü" onClick={onScreenshot} />
        <ToolButton icon="command" label="Komut paleti" shortcut="⌘K" onClick={onCommand} />
        <ToolButton icon="help" label="Yardım ve kısayollar" active={activePanel === "help"} onClick={() => onPanel("help")} />
      </div>
    </nav>
  );
}

function ToolButton({ icon, label, shortcut, active, onClick }: { icon: IconName; label: string; shortcut?: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`tool-button ${active ? "is-active" : ""}`}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active ?? false}
      title={label}
    >
      <Icon name={icon} size={18} />
      <span className="tool-tooltip">
        <strong>{label}</strong>
        {shortcut && <kbd>{shortcut}</kbd>}
      </span>
    </button>
  );
}
