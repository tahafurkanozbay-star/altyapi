import type { PanelId, ToolDefinition, ToolId } from "../types";
import { Icon, type IconName } from "./Icon";

export const mapTools: ToolDefinition[] = [
  { id: "legend", label: "Lejant", icon: "legend", keywords: ["lejant", "sembol"] },
  { id: "basemap", label: "Harita görünümü", icon: "basemap", keywords: ["altlık", "uydu", "harita"] },
  { id: "distance", label: "Mesafe ölç", icon: "distance", keywords: ["ölç", "mesafe", "uzunluk"] },
  { id: "area", label: "Alan ölç", icon: "area", keywords: ["ölç", "alan"] },
  { id: "daylight", label: "Gün ışığı", icon: "daylight", keywords: ["güneş", "gölge", "saat"] },
  { id: "slice", label: "3B kesit", icon: "slice", keywords: ["kesit", "slice"] },
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
}

export function ToolRail({ activePanel, activeTool, onPanel, onTool, onHome, onScreenshot }: Props) {
  return (
    <nav id="kent-rehberi-tools" className="tool-rail" aria-label="Kent Rehberi ana araçları">
      <div className="tool-rail-mark" aria-hidden="true"><span>3B</span></div>

      <div className="tool-group" aria-label="İçerik">
        <span className="tool-group-label">İçerik</span>
        <ToolButton icon="layers" label="Katmanlar" shortcut="L" active={activePanel === "layers"} onClick={() => onPanel("layers")} />
        <ToolButton icon="table" label="Harita verisi" shortcut="D" active={activePanel === "data"} onClick={() => onPanel("data")} />
        <ToolButton icon="bookmark" label="Yer imleri" active={activePanel === "bookmarks"} onClick={() => onPanel("bookmarks")} />
      </div>

      <div className="tool-group" aria-label="Harita konumu">
        <span className="tool-group-label">Konum</span>
        <ToolButton icon="home" label="Ankara başlangıç görünümü" shortcut="H" onClick={onHome} />
      </div>

      <div className="tool-group tool-group-analysis" aria-label="Harita araçları">
        <span className="tool-group-label">Araçlar</span>
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

      <div className="tool-group tool-group-bottom" aria-label="Yardımcı araçlar">
        <span className="tool-group-label">Diğer</span>
        <ToolButton icon="camera" label="Ekran görüntüsü" onClick={onScreenshot} />
        <ToolButton icon="help" label="Yardım ve kısayollar" shortcut="?" active={activePanel === "help"} onClick={() => onPanel("help")} />
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
      aria-current={active ? "page" : undefined}
      aria-keyshortcuts={shortcut}
      title={shortcut ? `${label} (${shortcut})` : label}
    >
      <Icon name={icon} size={18} />
      <span className="tool-tooltip" aria-hidden="true">
        <strong>{label}</strong>
        {shortcut && <kbd>{shortcut}</kbd>}
      </span>
    </button>
  );
}
