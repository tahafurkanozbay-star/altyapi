import type { PanelId, ToolId } from "../types";

export type CitizenShortcutCommand =
  | "home"
  | "layers"
  | "data"
  | "focus-mode"
  | "search"
  | "help"
  | "fullscreen";

export interface CitizenShortcutDefinition {
  command: CitizenShortcutCommand;
  key: string;
  alt: boolean;
  primary: boolean;
  shift: boolean;
  label: string;
  display: string;
  ariaKeyShortcuts: string;
}

export const CITIZEN_SHORTCUTS = [
  {
    command: "layers",
    key: "l",
    alt: true,
    primary: false,
    shift: false,
    label: "Katmanlar",
    display: "Alt + L",
    ariaKeyShortcuts: "Alt+L"
  },
  {
    command: "data",
    key: "d",
    alt: true,
    primary: false,
    shift: false,
    label: "Harita verisi",
    display: "Alt + D",
    ariaKeyShortcuts: "Alt+D"
  },
  {
    command: "home",
    key: "h",
    alt: true,
    primary: false,
    shift: false,
    label: "Başlangıç görünümü",
    display: "Alt + H",
    ariaKeyShortcuts: "Alt+H"
  },
  {
    command: "focus-mode",
    key: "m",
    alt: true,
    primary: false,
    shift: false,
    label: "Haritaya odaklan",
    display: "Alt + M",
    ariaKeyShortcuts: "Alt+M"
  },
  {
    command: "search",
    key: "k",
    alt: false,
    primary: true,
    shift: false,
    label: "Arama alanına git",
    display: "Ctrl/⌘ + K",
    ariaKeyShortcuts: "Control+K Meta+K"
  },
  {
    command: "help",
    key: "/",
    alt: false,
    primary: true,
    shift: false,
    label: "Yardımı aç",
    display: "Ctrl/⌘ + /",
    ariaKeyShortcuts: "Control+/ Meta+/"
  },
  {
    command: "fullscreen",
    key: "f",
    alt: false,
    primary: true,
    shift: true,
    label: "Tam ekran",
    display: "Ctrl/⌘ + Shift + F",
    ariaKeyShortcuts: "Control+Shift+F Meta+Shift+F"
  }
] as const satisfies readonly CitizenShortcutDefinition[];

export const PANEL_LABELS = {
  layers: "Katmanlar",
  data: "Harita Verisi",
  bookmarks: "Yer İmleri",
  help: "Yardım ve Kısayollar"
} as const satisfies Record<Exclude<PanelId, null>, string>;

export const MAP_TOOL_METADATA = {
  legend: { label: "Lejant", keywords: ["lejant", "sembol"] },
  basemap: { label: "Harita görünümü", keywords: ["altlık", "uydu", "harita"] },
  distance: { label: "Mesafe ölç", keywords: ["ölç", "mesafe", "uzunluk"] },
  area: { label: "Alan ölç", keywords: ["ölç", "alan"] },
  daylight: { label: "Gün ışığı", keywords: ["güneş", "gölge", "saat"] },
  slice: { label: "3B kesit", keywords: ["kesit", "slice"] },
  lineOfSight: { label: "Görüş hattı", keywords: ["görüş", "hat"] },
  elevation: { label: "Yükseklik profili", keywords: ["profil", "yükseklik", "eğim"] }
} as const satisfies Record<Exclude<ToolId, null>, { label: string; keywords: readonly string[] }>;

export const STATIC_HELP_SHORTCUTS = [
  { display: "Esc", label: "En üstteki açık aracı veya paneli kapat" },
  { display: "← ↑ ↓ →", label: "Araç dock'unda gezin" },
  { display: "Home / End", label: "İlk veya son araca git" }
] as const;

export function shortcutFor(command: CitizenShortcutCommand): CitizenShortcutDefinition {
  const shortcut = CITIZEN_SHORTCUTS.find((item) => item.command === command);
  if (!shortcut) throw new Error(`Kısayol tanımı bulunamadı: ${command}`);
  return shortcut;
}

export function panelLabel(panel: Exclude<PanelId, null>): string {
  return PANEL_LABELS[panel];
}

export function mapToolLabel(tool: Exclude<ToolId, null>): string {
  return MAP_TOOL_METADATA[tool].label;
}
