export const DEFAULT_WIDTH = 720;
export const DEFAULT_HEIGHT = 420;
export const DEFAULT_SPEED = 1;
export const DEFAULT_MAX_SPEED = 25;
export const DEFAULT_MAX_FRAME_DELTA_SECONDS = 0.25;
export const DEFAULT_MAX_VISIBLE_QUEUE_CUSTOMERS = 30;
export const DEFAULT_MAX_DETAILED_SERVERS = 48;
export const DEFAULT_MAX_SERVER_CELLS = 180;
export const MAX_CANVAS_BACKING_DIMENSION = 16_384;
export const MAX_CANVAS_BACKING_PIXELS = 16_777_216;
export const EXIT_ANIMATION_SECONDS = 0.75;
export const EXITING_ENTITY_CACHE_BUFFER = 32;

const CANVAS_FONT_FAMILY =
  '"Commissioner Variable", Commissioner, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export function canvasFont(weight: number, sizePx: number): string {
  return `${weight} ${sizePx}px ${CANVAS_FONT_FAMILY}`;
}

export const COLORS = {
  backgroundTop: "#07111f",
  backgroundBottom: "#101827",
  panel: "#101827",
  panelStroke: "#2c3b52",
  gridStroke: "#33445f",
  text: "#e8eef8",
  muted: "#98a7bb",
  faint: "#607086",
  customer: "#5eead4",
  customerStroke: "#ccfbf1",
  customerShadow: "rgba(20, 184, 166, 0.24)",
  busy: "#2dd4bf",
  busyPanel: "#12373a",
  idle: "#64748b",
  idlePanel: "#1b2536",
  warning: "#f4b860",
  exit: "#a78bfa",
};
