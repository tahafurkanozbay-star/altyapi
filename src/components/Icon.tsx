import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "layers" | "health" | "bookmark" | "home" | "legend" | "basemap" | "distance" | "area"
  | "daylight" | "slice" | "sight" | "elevation" | "camera" | "share" | "command" | "star"
  | "eye" | "eyeOff" | "zoom" | "refresh" | "info" | "close" | "plus" | "trash" | "download"
  | "chevron" | "search" | "speed" | "theme" | "help" | "check" | "warning" | "menu" | "table" | "database" | "upload" | "workspace";

const paths: Record<IconName, ReactNode> = {
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 16 9 5 9-5"/></>,
  health: <><path d="M3 12h4l2-6 4 12 2-6h6"/><path d="M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" opacity=".35"/></>,
  bookmark: <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z"/>,
  home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></>,
  legend: <><path d="M4 6h3M4 12h3M4 18h3M10 6h10M10 12h10M10 18h10"/><circle cx="5.5" cy="6" r="1.5"/><rect x="4" y="10.5" width="3" height="3" rx=".5"/><path d="m4 20 1.5-4L7 20Z"/></>,
  basemap: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></>,
  distance: <><path d="M4 18 18 4M4 14v4h4M14 4h4v4"/><path d="m9 12 3 3"/></>,
  area: <><path d="M5 5h14v14H5z"/><path d="m5 14 5-4 4 3 5-5"/></>,
  daylight: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.41M17.66 6.34l1.41-1.41"/></>,
  slice: <><path d="M4 5h16v14H4z"/><path d="m4 16 16-8"/></>,
  sight: <><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
  elevation: <><path d="m3 19 6-8 4 5 3-4 5 7"/><path d="M3 5h18"/></>,
  camera: <><path d="M4 7h4l2-3h4l2 3h4a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"/><circle cx="12" cy="13" r="4"/></>,
  share: <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/></>,
  command: <path d="M9 5a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v14a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V5Z"/>,
  star: <path d="m12 2.7 2.8 5.7 6.3.9-4.5 4.4 1 6.3-5.6-3-5.6 3 1-6.3-4.5-4.4 6.3-.9L12 2.7Z"/>,
  eye: <><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
  eyeOff: <><path d="m3 3 18 18"/><path d="M10.6 6.2A11 11 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-2 2.6M6.7 6.7C3.7 8.5 2 12 2 12s4 6 10 6c1.7 0 3.2-.5 4.5-1.2"/></>,
  zoom: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5M10.5 7v7M7 10.5h7"/></>,
  refresh: <><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M6.1 8A7 7 0 0 1 18.7 7L20 12M4 12l1.3 5A7 7 0 0 0 17.9 16"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></>,
  close: <path d="m6 6 12 12M18 6 6 18"/>, plus: <path d="M12 5v14M5 12h14"/>,
  trash: <><path d="M4 7h16M9 3h6l1 4H8l1-4ZM7 7l1 14h8l1-14M10 11v6M14 11v6"/></>,
  download: <><path d="M12 3v12M7 10l5 5 5-5M4 20h16"/></>, chevron: <path d="m9 6 6 6-6 6"/>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></>,
  speed: <><path d="M4 17a8 8 0 1 1 16 0"/><path d="m12 13 5-4"/><circle cx="12" cy="17" r="1"/></>,
  theme: <path d="M20 15.3A8.5 8.5 0 0 1 8.7 4a8.5 8.5 0 1 0 11.3 11.3Z"/>,
  help: <><circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.5 2.5 0 1 1 4 2c-1.2.8-1.7 1.3-1.7 2.8M12 17h.01"/></>,
  check: <path d="m5 12 4 4L19 6"/>, warning: <><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v4M12 17h.01"/></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
  table: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10M15 10v10"/></>,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></>,
  upload: <><path d="M12 21V9M7 14l5-5 5 5M4 4h16"/></>,
  workspace: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16M8 10h13M3 10h5"/></>
};

export function Icon({ name, size = 18, ...props }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
