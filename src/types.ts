export type ServiceKind = "WMS" | "WFS" | "MapServer" | "FeatureServer" | "SceneServer";
export type ServiceStatus = "idle" | "loading" | "ready" | "error";
export type ThemeMode = "dark" | "light" | "system";
export type PerformanceProfile = "high" | "balanced" | "eco";
export type PanelId = "layers" | "data" | "health" | "bookmarks" | "diagnostics" | "help" | null;
export type ToolId = "legend" | "basemap" | "distance" | "area" | "daylight" | "slice" | "lineOfSight" | "elevation" | null;

export interface RawServiceDefinition {
  ustKurumAdi: string;
  metaveriSahibiKurumAdi: string;
  cografiVeriKatmanAdi: string;
  servisTuruAdi: ServiceKind | string;
  tokenUrl: string;
}

export interface ServicesDocument {
  services: RawServiceDefinition[];
}

export interface ServiceDefinition extends RawServiceDefinition {
  id: string;
  kind: ServiceKind;
  displayName: string;
  organization: string;
  owner: string;
  url: string;
  status: ServiceStatus;
  error?: string;
  visible: boolean;
  opacity: number;
  favorite: boolean;
  latencyMs?: number;
  lastLoadedAt?: string;
}

export interface CameraState {
  longitude: number;
  latitude: number;
  z: number;
  heading: number;
  tilt: number;
}

export interface Bookmark {
  id: string;
  name: string;
  camera: CameraState;
  layerIds: string[];
  createdAt: string;
}

export interface AppPreferences {
  basemap: string;
  theme: ThemeMode;
  performance: PerformanceProfile | "auto";
  layerVisibility: Record<string, boolean>;
  layerOpacity: Record<string, number>;
  favorites: string[];
  camera?: CameraState;
  bookmarks: Bookmark[];
}

export interface IdentifyResult {
  title: string;
  subtitle?: string;
  attributes: Array<{ key: string; value: string }>;
}

export interface SceneTelemetry {
  latitude?: number;
  longitude?: number;
  altitude: number;
  tilt: number;
  heading: number;
  scale?: number;
}

export interface ToolDefinition {
  id: Exclude<ToolId, null>;
  label: string;
  icon: string;
  keywords: string[];
}

export interface BrowserCapabilities {
  webgl2: boolean;
  secureContext: boolean;
  online: boolean;
  hardwareConcurrency: number;
  deviceMemory?: number;
  maxTouchPoints: number;
  devicePixelRatio: number;
  reducedMotion: boolean;
  colorGamut: "srgb" | "p3" | "rec2020";
  connectionType?: string;
  saveData?: boolean;
}


export type AttributeValue = string | number | boolean | null;
export type AttributeRow = Record<string, AttributeValue>;

export interface AttributeField {
  name: string;
  alias: string;
  type?: string;
}

export interface AttributeTableResult {
  serviceId: string;
  serviceName: string;
  fields: AttributeField[];
  rows: AttributeRow[];
  total: number;
  truncated: boolean;
  objectIdField?: string;
  fetchedAt: string;
}

export interface ServiceHealthSummary {
  ready: number;
  loading: number;
  error: number;
  idle: number;
  active: number;
  averageLatencyMs?: number;
  p95LatencyMs?: number;
}
