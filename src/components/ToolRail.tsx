import type { PanelId, ToolDefinition, ToolId } from "../types";
import {
  MAP_TOOL_METADATA,
  shortcutFor,
  type CitizenShortcutCommand
} from "../platform/citizenActions";
import { Icon, type IconName } from "./Icon";

const TOOL_ICONS = {
  legend: "legend",
  basemap: "basemap",
  distance: "distance",
  area: "area",
  daylight: "daylight",
  slice: "slice",
  lineOfSight: "sight",
  elevation: "elevation"
} as const satisfies Record<Exclude<ToolId, null>, IconName>;

export const mapTools = (Object.entries(MAP_TOOL_METADATA) as Array<[
  Exclude<ToolId, null>,
  (typeof MAP_TOOL_METADATA)[Exclude<ToolId, null>]
]>).map(([id, metadata]) => ({
  id,
  label: metadata.label,
  icon: TOOL_ICONS[id],
  keywords: [...metadata.keywords]
})) satisfies ReadonlyArray<ToolDefinition & { icon: IconName }>;

const LAYERS_SHORTCUT = shortcutFor("layers");
const DATA_SHORTCUT = shortcutFor("data");
const HOME_SHORTCUT = shortcutFor("home");
const HELP_SHORTCUT = shortcutFor("help");

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
    <nav id="kent-rehberi-tools" className="tool-rail" aria-label="Kent Rehberi ana araçları" aria-describedby="tool-rail-keyboard-hint">
      <span id="tool-rail-keyboard-hint" className="visually-hidden">Araçlar arasında ok tuşlarıyla, ilk ve son araca Home ve End tuşlarıyla geçebilirsiniz.</span>
      <div className="tool-rail-mark" aria-hidden="true"><span>3B</span></div>

      <div className="tool-group" role="group" aria-label="İçerik" data-tool-group="content">
        <span className="tool-group-label">İçerik</span>
        <ToolButton icon="layers" label="Katmanlar" shortcut={LAYERS_SHORTCUT} commandTarget="layers" panelTarget="layers" active={activePanel === "layers"} onClick={() => onPanel("layers")} />
        <ToolButton icon="table" label="Harita verisi" shortcut={DATA_SHORTCUT} commandTarget="data" panelTarget="data" active={activePanel === "data"} onClick={() => onPanel("data")} />
        <ToolButton icon="bookmark" label="Yer imleri" panelTarget="bookmarks" active={activePanel === "bookmarks"} onClick={() => onPanel("bookmarks")} />
      </div>

      <div className="tool-group" role="group" aria-label="Harita konumu" data-tool-group="location">
        <span className="tool-group-label">Konum</span>
        <ToolButton icon="home" label="Ankara başlangıç görünümü" shortcut={HOME_SHORTCUT} commandTarget="home" onClick={onHome} />
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
        <ToolButton icon="help" label="Yardım ve kısayollar" shortcut={HELP_SHORTCUT} commandTarget="help" panelTarget="help" active={activePanel === "help"} onClick={() => onPanel("help")} />
      </div>
    </nav>
  );
}

interface ShortcutPresentation {
  display: string;
  ariaKeyShortcuts: string;
}

interface ToolButtonProps {
  icon: IconName;
  label: string;
  shortcut?: ShortcutPresentation;
  commandTarget?: CitizenShortcutCommand;
  panelTarget?: Exclude<PanelId, null>;
  toolTarget?: Exclude<ToolId, null>;
  active?: boolean;
  onClick: () => void;
}

function ToolButton({ icon, label, shortcut, commandTarget, panelTarget, toolTarget, active, onClick }: ToolButtonProps) {
  const isToggle = active !== undefined;
  return (
    <button
      type="button"
      className={`tool-button ${active ? "is-active" : ""}`}
      onClick={onClick}
      aria-label={label}
      aria-pressed={isToggle ? active : undefined}
      aria-keyshortcuts={shortcut?.ariaKeyShortcuts}
      aria-controls={panelTarget ? "kent-rehberi-panels" : undefined}
      aria-expanded={panelTarget ? Boolean(active) : undefined}
      data-command-target={commandTarget}
      data-panel-target={panelTarget}
      data-tool-target={toolTarget}
      data-toggle={isToggle ? "true" : "false"}
      title={shortcut ? `${label} (${shortcut.display})` : label}
    >
      <Icon name={icon} size={18} />
      <span className="tool-mobile-label" aria-hidden="true">{label}</span>
      <span className="tool-tooltip" aria-hidden="true">
        <strong>{label}</strong>
        {shortcut && <kbd>{shortcut.display}</kbd>}
      </span>
    </button>
  );
}
