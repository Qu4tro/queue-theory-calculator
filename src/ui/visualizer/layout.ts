import { clamp } from "../math";
import type { CompactSceneLayout, Rect, SceneLayout } from "./types";

export function createLayout(width: number, height: number): SceneLayout {
  const padding = clamp(Math.min(width, height) * 0.035, 10, 18);
  const contentY = padding;
  const contentHeight = Math.max(120, height - padding * 2);
  const narrow = width < 620;

  if (narrow) {
    const queueHeight = clamp(contentHeight * 0.24, 82, 132);
    const exitHeight = clamp(contentHeight * 0.16, 54, 76);
    const serversHeight = Math.max(
      96,
      contentHeight - queueHeight - exitHeight - padding * 2,
    );
    const queue = {
      x: padding,
      y: contentY,
      width: width - padding * 2,
      height: queueHeight,
    };
    const servers = {
      x: padding,
      y: queue.y + queue.height + padding,
      width: width - padding * 2,
      height: serversHeight,
    };
    const exit = {
      x: padding,
      y: servers.y + servers.height + padding,
      width: width - padding * 2,
      height: exitHeight,
    };

    return {
      narrow,
      queue,
      servers,
      exit,
      exitPoint: { x: exit.x + exit.width / 2, y: exit.y + exit.height / 2 },
    };
  }

  const queueWidth = clamp(width * 0.28, 170, 260);
  const exitWidth = clamp(width * 0.14, 88, 132);
  const queue = {
    x: padding,
    y: contentY,
    width: queueWidth,
    height: contentHeight,
  };
  const exit = {
    x: width - padding - exitWidth,
    y: contentY,
    width: exitWidth,
    height: contentHeight,
  };
  const servers = {
    x: queue.x + queue.width + padding,
    y: contentY,
    width: Math.max(130, exit.x - (queue.x + queue.width) - padding * 2),
    height: contentHeight,
  };

  return {
    narrow,
    queue,
    servers,
    exit,
    exitPoint: { x: exit.x + exit.width / 2, y: exit.y + exit.height / 2 },
  };
}

export function createCompactLayout(
  width: number,
  height: number,
): CompactSceneLayout {
  const padding = clamp(Math.min(width, height) * 0.075, 9, 14);
  const gap = clamp(width * 0.035, 9, 14);
  const content = {
    x: padding,
    y: padding,
    width: Math.max(1, width - padding * 2),
    height: Math.max(1, height - padding * 2),
  };
  const exitWidth = clamp(content.width * 0.16, 34, 48);
  const queueWidth = clamp(content.width * 0.28, 62, 92);
  const serversWidth = Math.max(
    88,
    content.width - queueWidth - exitWidth - gap * 2,
  );
  const queue = {
    x: content.x,
    y: content.y,
    width: queueWidth,
    height: content.height,
  };
  const servers = {
    x: queue.x + queue.width + gap,
    y: content.y,
    width: serversWidth,
    height: content.height,
  };
  const exit = {
    x: servers.x + servers.width + gap,
    y: content.y,
    width: Math.max(28, width - padding - (servers.x + servers.width + gap)),
    height: content.height,
  };

  return {
    queue,
    servers,
    exit,
    exitPoint: { x: exit.x + exit.width / 2, y: exit.y + exit.height / 2 },
  };
}

export function serverColumnCount(serverCount: number, rect: Rect): number {
  const aspect = rect.width / Math.max(1, rect.height);
  return clamp(
    Math.ceil(Math.sqrt(serverCount * aspect)),
    1,
    Math.max(1, serverCount),
  );
}

export function insetRect(rect: Rect, inset: number): Rect {
  return {
    x: rect.x + inset,
    y: rect.y + inset,
    width: Math.max(0, rect.width - inset * 2),
    height: Math.max(0, rect.height - inset * 2),
  };
}

export function unionRects(...rects: Rect[]): Rect {
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}
