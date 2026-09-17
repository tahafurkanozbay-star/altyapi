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
    <nav className="tool-rail" aria-label="Harita araçları">
      <ToolButton icon="layers" label="Katmanlar" active={activePanel === "layers"} onClick={() => onPanel("layers")} />
      <ToolButton icon="health" label="Servis sağlığı" active={activePanel === "health"} onClick={() => onPanel("health")} />
      <ToolButton icon="bookmark" label="Yer imleri" active={activePanel === "bookmarks"} onClick={() => onPanel("bookmarks")} />
      <div className="tool-separator" />
      <ToolButton icon="home" label="Başlangıç görünümü" onClick={onHome} />
      {mapTools.map((tool) => (
        <ToolButton
          key={tool.id}
          icon={tool.icon as IconName}
          label={tool.label}
          active={activeTool === tool.id}
          onClick={() => onTool(tool.id)}
        />
      ))}
      <div className="tool-separator" />
      <ToolButton icon="camera" label="Ekran görüntüsü" onClick={onScreenshot} />
      <ToolButton icon="command" label="Komut paleti" onClick={onCommand} />
      <ToolButton icon="help" label="Yardım" active={activePanel === "help"} onClick={() => onPanel("help")} />
    </nav>
  );
}

function ToolButton({ icon, label, active, onClick }: { icon: IconName; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`tool-button ${active ? "is-active" : ""}`} onClick={onClick} aria-label={label} title={label}>
      <Icon name={icon} size={19} />
      <span className="tool-tooltip">{label}</span>
    </button>
  );
}
