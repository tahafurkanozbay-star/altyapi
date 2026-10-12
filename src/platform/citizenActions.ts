import type { ToolId } from "../types";

export type CitizenShortcutCommand =
  | "home"
  | "layers"
  | "data"
  | "focus-mode"
  | "search"
  | "help"
  | "fullscreen";

export type CitizenPanelId = "layers" | "data" | "bookmarks" | "help";

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
} as const satisfies Record<CitizenPanelId, string>;

export const MAP_TOOL_METADATA = {
  legend: { label: "Lejant", keywords: ["lejant", "sembol"], instructions: "Açık katmanların renk ve sembollerini inceleyin. Lejant görmek için bir katman açın." },
  basemap: { label: "Harita görünümü", keywords: ["altlık", "uydu", "harita"], instructions: "Bir harita görünümü seçin. Seçiminiz üst menüye, yer imlerine ve paylaşılan görünüme yansır." },
  distance: { label: "Mesafe ölç", keywords: ["ölç", "mesafe", "uzunluk"], instructions: "Yeni ölçüm düğmesine basın; haritada başlangıç ve bitiş noktalarını seçin." },
  area: { label: "Alan ölç", keywords: ["ölç", "alan"], instructions: "Yeni ölçüm başlatın; haritada alanın köşelerini seçin ve son noktaya çift tıklayarak tamamlayın." },
  daylight: { label: "Gün ışığı", keywords: ["güneş", "gölge", "saat"], instructions: "Tarih ve saati değiştirerek gün ışığını inceleyin. Yapı gölgeleri için 3B yapı katmanını açın." },
  slice: { label: "3B kesit", keywords: ["kesit", "slice"], instructions: "Önce bir 3B yapı katmanı açın. Yeni kesit başlatıp kesit düzlemini haritada konumlandırın." },
  lineOfSight: { label: "Görüş hattı", keywords: ["görüş", "hat"], instructions: "Yeni analiz başlatın; haritada gözlemci ve hedef noktalarını seçin. Engelleri görmek için 3B yapı katmanını açın." },
  elevation: { label: "Yükseklik profili", keywords: ["profil", "yükseklik", "eğim"], instructions: "Yeni profil düğmesine basın; haritada bir çizgi çizin ve çift tıklayarak tamamlayın." }
} as const satisfies Record<Exclude<ToolId, null>, { label: string; keywords: readonly string[]; instructions: string }>;

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

export function panelLabel(panel: CitizenPanelId): string {
  return PANEL_LABELS[panel];
}

export function mapToolLabel(tool: Exclude<ToolId, null>): string {
  return MAP_TOOL_METADATA[tool].label;
}
