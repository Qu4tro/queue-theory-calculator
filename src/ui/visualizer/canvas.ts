import { COLORS } from "./style";
import type { Point, Rect, VisualEntity } from "./types";

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, COLORS.backgroundTop);
  gradient.addColorStop(1, COLORS.backgroundBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

export function drawPanel(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  fill: string,
  stroke: string,
  radius = 8,
): void {
  fillRoundedRect(ctx, rect, radius, fill);
  strokeRoundedRect(ctx, rect, radius, stroke);
}

export function drawCapacitySlot(
  ctx: CanvasRenderingContext2D,
  center: Point,
  radius: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = COLORS.gridStroke;
  ctx.globalAlpha = 0.58;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([3, 3]);
  ctx.stroke();
  ctx.restore();
}

export function fillRoundedRect(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  radius: number,
  fill: string,
): void {
  roundedRectPath(ctx, rect, radius);
  ctx.fillStyle = fill;
  ctx.fill();
}

export function strokeRoundedRect(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  radius: number,
  stroke: string,
): void {
  roundedRectPath(ctx, rect, radius);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  radius: number,
): void {
  const safeRadius = Math.min(radius, rect.width / 2, rect.height / 2);
  const x = rect.x;
  const y = rect.y;
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;

  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(right - safeRadius, y);
  ctx.quadraticCurveTo(right, y, right, y + safeRadius);
  ctx.lineTo(right, bottom - safeRadius);
  ctx.quadraticCurveTo(right, bottom, right - safeRadius, bottom);
  ctx.lineTo(x + safeRadius, bottom);
  ctx.quadraticCurveTo(x, bottom, x, bottom - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
}

export function drawFittedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  options: {
    x: number;
    y: number;
    maxWidth: number;
    font: string;
    color: string;
    align?: CanvasTextAlign;
    baseline?: CanvasTextBaseline;
  },
): void {
  ctx.save();
  ctx.font = options.font;
  ctx.fillStyle = options.color;
  ctx.textAlign = options.align ?? "left";
  ctx.textBaseline = options.baseline ?? "alphabetic";
  ctx.fillText(
    truncateCanvasText(ctx, text, options.maxWidth),
    options.x,
    options.y,
  );
  ctx.restore();
}

function truncateCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (maxWidth <= 0) {
    return "";
  }

  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }

  const suffix = "...";

  if (ctx.measureText(suffix).width > maxWidth) {
    return "";
  }

  const characters = Array.from(text);
  let low = 0;
  let high = characters.length;

  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = `${characters.slice(0, mid).join("").trimEnd()}${suffix}`;

    if (ctx.measureText(candidate).width <= maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return `${characters.slice(0, low).join("").trimEnd()}${suffix}`;
}

export function drawArrow(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
): void {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const headLength = 8;

  ctx.save();
  ctx.strokeStyle = COLORS.faint;
  ctx.fillStyle = COLORS.faint;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(
    to.x - headLength * Math.cos(angle - Math.PI / 6),
    to.y - headLength * Math.sin(angle - Math.PI / 6),
  );
  ctx.lineTo(
    to.x - headLength * Math.cos(angle + Math.PI / 6),
    to.y - headLength * Math.sin(angle + Math.PI / 6),
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawCustomer(
  ctx: CanvasRenderingContext2D,
  entity: VisualEntity,
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = COLORS.customerShadow;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(entity.x, entity.y, entity.radius, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.customer;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = COLORS.customerStroke;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

export function moveEntityTowardTarget(
  entity: VisualEntity,
  amount: number,
): void {
  entity.x += (entity.targetX - entity.x) * amount;
  entity.y += (entity.targetY - entity.y) * amount;
}
