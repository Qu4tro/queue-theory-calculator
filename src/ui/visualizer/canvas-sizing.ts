import { clamp } from "../math";
import {
  MAX_CANVAS_BACKING_DIMENSION,
  MAX_CANVAS_BACKING_PIXELS,
} from "./style";

export type CanvasDisplaySize = {
  width: number;
  height: number;
  pixelRatio: number;
};

export function resizeCanvasToDisplaySize(
  canvas: HTMLCanvasElement,
): CanvasDisplaySize | null {
  const rect = canvas.getBoundingClientRect();
  const displayWidth = displaySize(rect.width, canvas.clientWidth);
  const displayHeight = displaySize(rect.height, canvas.clientHeight);

  if (displayWidth === null || displayHeight === null) {
    return null;
  }

  const requestedPixelRatio =
    typeof window === "undefined"
      ? 1
      : clamp(window.devicePixelRatio || 1, 1, 3);
  const width = Math.max(1, Math.round(displayWidth));
  const height = Math.max(1, Math.round(displayHeight));
  const pixelRatio = constrainedCanvasPixelRatio(
    width,
    height,
    requestedPixelRatio,
  );
  const pixelWidth = Math.max(1, Math.round(width * pixelRatio));
  const pixelHeight = Math.max(1, Math.round(height * pixelRatio));

  if (canvas.width !== pixelWidth) {
    canvas.width = pixelWidth;
  }

  if (canvas.height !== pixelHeight) {
    canvas.height = pixelHeight;
  }

  return { width, height, pixelRatio };
}

function displaySize(...candidates: readonly number[]): number | null {
  for (const candidate of candidates) {
    if (Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }
  }

  return null;
}

function constrainedCanvasPixelRatio(
  width: number,
  height: number,
  requestedPixelRatio: number,
): number {
  const dimensionRatio = Math.min(
    MAX_CANVAS_BACKING_DIMENSION / width,
    MAX_CANVAS_BACKING_DIMENSION / height,
  );
  const areaRatio = Math.sqrt(MAX_CANVAS_BACKING_PIXELS / (width * height));

  return Math.max(
    Number.EPSILON,
    Math.min(requestedPixelRatio, dimensionRatio, areaRatio),
  );
}
