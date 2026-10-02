import type { PanelId, ToolDefinition, ToolId } from "../types";
import { Icon, type IconName } from "./Icon";

export const mapTools = [
  { id: "legend", label: "Lejant", icon: "legend", keywords: ["lejant", "sembol"] },
  { id: "basemap", label: "Harita görünümü", icon: "basemap", keywords: ["altlık", "uydu", "harita"] },
  { id: "distance", label: "Mesafe ölç", icon: "distance", keywords: ["ölç", "mesafe", "uzunluk"] },
  { id: "area", label: "Alan ölç", icon: "area", keywords: ["ölç", "alan"] },
  { id: "daylight", label: "Gün ışığı", icon: "daylight", keywords: ["güneş", "gölge", "saat"] },
  { id: "slice", label: "3B kesit", icon: "slice", keywords: ["kesit", "slice"] },
  { id: "lineOfSight", label: "Görüş hattı", icon: "sight", keywords: ["görüş", "hat"] },
  { id: "elevation", label: "Yükseklik profili", icon: "elevation", keywords: ["profil", "yükseklik", "eğim"] }
] satisfies ReadonlyArray<ToolDefinition & { icon: IconName }>;

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

      <div className="tool-group" role="group" aria-label="İçerik" data-tool-group="content">
        <span className="tool-group-label">İçerik</span>
        <ToolButton icon="layers" label="Katmanlar" shortcut="L" panelTarget="layers" active={activePanel === "layers"} onClick={() => onPanel("layers")} />
        <ToolButton icon="table" label="Harita verisi" shortcut="D" panelTarget="data" active={activePanel === "data"} onClick={() => onPanel("data")} />
        <ToolButton icon="bookmark" label="Yer imleri" panelTarget="bookmarks" active={activePanel === "bookmarks"} onClick={() => onPanel("bookmarks")} />
      </div>

      <div className="tool-group" role="group" aria-label="Harita konumu" data-tool-group="location">
        <span className="tool-group-label">Konum</span>
        <ToolButton icon="home" label="Ankara başlangıç görünümü" shortcut="H" onClick={onHome} />
      </div>

      <div className="tool-group tool-group-analysis" role="group" aria-label="Harita araçları" data-tool-group="analysis">
        <span className="tool-group-label">Araçlar</span>
        {mapTools.map((tool) => (
          <ToolButton
            key={tool.id}
            icon={tool.icon}
            label={tool.label}
            toolTarget={tool.id}
            active={activeTool === tool.id}
            onClick={() => onTool(tool.id)}
          />
        ))}
      </div>

      <div className="tool-group tool-group-bottom" role="group" aria-label="Yardımcı araçlar" data-tool-group="utility">
        <span className="tool-group-label">Diğer</span>
        <ToolButton icon="camera" label="Ekran görüntüsü" onClick={onScreenshot} />
        <ToolButton icon="help" label="Yardım ve kısayollar" shortcut="?" panelTarget="help" active={activePanel === "help"} onClick={() => onPanel("help")} />
      </div>
    </nav>
  );
}

interface ToolButtonProps {
  icon: IconName;
  label: string;
  shortcut?: string;
  panelTarget?: Exclude<PanelId, null>;
  toolTarget?: Exclude<ToolId, null>;
  active?: boolean;
  onClick: () => void;
}

function ToolButton({ icon, label, shortcut, panelTarget, toolTarget, active, onClick }: ToolButtonProps) {
  const isToggle = active !== undefined;
  return (
    <button
      type="button"
      className={`tool-button ${active ? "is-active" : ""}`}
      onClick={onClick}
      aria-label={label}
      aria-pressed={isToggle ? active : undefined}
      aria-keyshortcuts={shortcut}
      aria-controls={panelTarget ? "kent-rehberi-panels" : undefined}
      aria-expanded={panelTarget ? Boolean(active) : undefined}
      data-panel-target={panelTarget}
      data-tool-target={toolTarget}
      data-toggle={isToggle ? "true" : "false"}
      title={shortcut ? `${label} (${shortcut})` : label}
    >
      <Icon name={icon} size={18} />
      <span className="tool-mobile-label" aria-hidden="true">{label}</span>
      <span className="tool-tooltip" aria-hidden="true">
        <strong>{label}</strong>
        {shortcut && <kbd>{shortcut}</kbd>}
      </span>
    </button>
  );
}
