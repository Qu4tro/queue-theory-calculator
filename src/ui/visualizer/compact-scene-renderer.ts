import { formatInteger } from "../format";
import { clamp } from "../math";
import { pluralTerm, type Terminology } from "../terminology";
import {
  drawArrow,
  drawCapacitySlot,
  drawFittedText,
  drawPanel,
  fillRoundedRect,
  strokeRoundedRect,
} from "./canvas";
import { createCompactLayout, insetRect, serverColumnCount } from "./layout";
import type { QueueCanvasRendererContext } from "./renderer-context";
import {
  isServerBusy,
  queueCustomerEntityId,
  serverCustomerEntityId,
} from "./snapshot";
import { COLORS, canvasFont } from "./style";
import type { NormalizedSnapshot, Rect, VisualizerServerState } from "./types";

export function drawCompactScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  snapshot: NormalizedSnapshot,
  terms: Terminology,
  renderer: QueueCanvasRendererContext,
): void {
  const layout = createCompactLayout(width, height);

  if (!snapshot.hasSnapshot) {
    renderer.entityLayer.clear();
    drawFittedText(
      ctx,
      snapshot.status ?? renderer.defaultEmptyMessage(terms),
      {
        x: width / 2,
        y: height / 2,
        maxWidth: width - 28,
        font: canvasFont(700, 15),
        color: COLORS.text,
        align: "center",
        baseline: "middle",
      },
    );
    return;
  }

  drawCompactQueue(ctx, layout.queue, snapshot, renderer);
  drawArrow(
    ctx,
    {
      x: layout.queue.x + layout.queue.width + 4,
      y: layout.queue.y + layout.queue.height / 2,
    },
    {
      x: layout.servers.x - 4,
      y: layout.servers.y + layout.servers.height / 2,
    },
  );
  drawCompactServers(ctx, layout.servers, snapshot, terms, renderer);
  drawArrow(
    ctx,
    {
      x: layout.servers.x + layout.servers.width + 4,
      y: layout.servers.y + layout.servers.height / 2,
    },
    {
      x: layout.exit.x - 4,
      y: layout.exit.y + layout.exit.height / 2,
    },
  );
  drawCompactExit(ctx, layout.exit);
  renderer.entityLayer.drawExiting(
    ctx,
    renderer.activeEntityIds,
    layout.exitPoint,
  );
  renderer.entityLayer.prune(renderer.activeEntityIds);
}

function drawCompactQueue(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  snapshot: NormalizedSnapshot,
  renderer: QueueCanvasRendererContext,
): void {
  drawPanel(ctx, rect, COLORS.panel, COLORS.panelStroke, 7);

  if (snapshot.serverCapacity === "infinite") {
    drawFittedText(ctx, "Direct", {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
      maxWidth: rect.width - 14,
      font: canvasFont(700, 12),
      color: COLORS.muted,
      align: "center",
      baseline: "middle",
    });
    return;
  }

  const body = insetRect(rect, 9);
  const radius = clamp(Math.min(body.width, body.height) / 8, 4, 8);
  const gap = radius * 0.85;
  const columns = Math.max(1, Math.floor(body.width / (radius * 2 + gap)));
  const rows = Math.max(1, Math.floor(body.height / (radius * 2 + gap)));
  const visualCapacity = Math.max(0, columns * rows);
  const visibleCount = Math.min(
    snapshot.queueLength,
    renderer.maxVisibleQueueCustomers,
    visualCapacity,
  );
  const overflow = Math.max(0, snapshot.queueLength - visibleCount);

  if (snapshot.queueLength === 0) {
    const slotCount = Math.min(
      snapshot.queueCapacity === null ? 3 : snapshot.queueCapacity,
      3,
      visualCapacity,
    );

    for (let index = 0; index < slotCount; index += 1) {
      const column = index % columns;
      const row = Math.floor(index / columns);

      drawCapacitySlot(
        ctx,
        {
          x: body.x + radius + column * (radius * 2 + gap),
          y: body.y + radius + row * (radius * 2 + gap),
        },
        radius,
      );
    }

    return;
  }

  for (let index = 0; index < visibleCount; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const customer = snapshot.queue[index];
    const id = customer
      ? queueCustomerEntityId(customer, index)
      : `queue-placeholder-${index}`;

    renderer.entityLayer.drawCustomer(
      ctx,
      id,
      {
        x: body.x + radius + column * (radius * 2 + gap),
        y: body.y + radius + row * (radius * 2 + gap),
      },
      radius,
      renderer.activeEntityIds,
    );
  }

  if (overflow > 0) {
    drawFittedText(ctx, `+${formatInteger(overflow)}`, {
      x: body.x + body.width,
      y: body.y + body.height,
      maxWidth: body.width,
      font: canvasFont(700, 11),
      color: COLORS.warning,
      align: "right",
      baseline: "bottom",
    });
  }
}

function drawCompactServers(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  snapshot: NormalizedSnapshot,
  terms: Terminology,
  renderer: QueueCanvasRendererContext,
): void {
  if (snapshot.serverCapacity === "infinite") {
    drawCompactActiveServicePool(ctx, rect, snapshot, renderer);
    return;
  }

  drawPanel(ctx, rect, COLORS.panel, COLORS.panelStroke, 7);

  if (snapshot.serverCount > renderer.maxDetailedServers) {
    drawCompactLargeServerSummary(ctx, rect, snapshot);
    return;
  }

  const body = insetRect(rect, 8);

  if (snapshot.serverCount === 0) {
    drawFittedText(
      ctx,
      `No ${pluralTerm(terms, "server", { sentence: true })}`,
      {
        x: body.x + body.width / 2,
        y: body.y + body.height / 2,
        maxWidth: body.width,
        font: canvasFont(700, 12),
        color: COLORS.muted,
        align: "center",
        baseline: "middle",
      },
    );
    return;
  }

  const columns = serverColumnCount(snapshot.serverCount, body);
  const rows = Math.ceil(snapshot.serverCount / columns);
  const gap = 5;
  const cellWidth = Math.max(14, (body.width - gap * (columns - 1)) / columns);
  const cellHeight = Math.max(18, (body.height - gap * (rows - 1)) / rows);

  for (let index = 0; index < snapshot.serverCount; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const busy = isServerBusy(
      snapshot.servers[index],
      index,
      snapshot.busyServers,
    );

    drawCompactServerCell(
      ctx,
      {
        x: body.x + column * (cellWidth + gap),
        y: body.y + row * (cellHeight + gap),
        width: cellWidth,
        height: cellHeight,
      },
      snapshot.servers[index],
      index,
      busy,
      renderer,
    );
  }
}

function drawCompactActiveServicePool(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  snapshot: NormalizedSnapshot,
  renderer: QueueCanvasRendererContext,
): void {
  drawPanel(ctx, rect, COLORS.panel, COLORS.panelStroke, 7);

  const body = insetRect(rect, 9);

  if (snapshot.busyServers === 0) {
    drawFittedText(ctx, "Idle", {
      x: body.x + body.width / 2,
      y: body.y + body.height / 2,
      maxWidth: body.width,
      font: canvasFont(700, 12),
      color: COLORS.muted,
      align: "center",
      baseline: "middle",
    });
    return;
  }

  const radius = clamp(Math.min(body.width, body.height) / 10, 4, 8);
  const gap = radius * 0.95;
  const columns = Math.max(1, Math.floor(body.width / (radius * 2 + gap)));
  const rows = Math.max(1, Math.floor(body.height / (radius * 2 + gap)));
  const visualCapacity = Math.max(0, columns * rows);
  const visibleCount = Math.min(
    snapshot.servers.length,
    snapshot.busyServers,
    renderer.maxServerCells,
    visualCapacity,
  );
  const overflow = Math.max(0, snapshot.busyServers - visibleCount);

  for (let index = 0; index < visibleCount; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);

    renderer.entityLayer.drawCustomer(
      ctx,
      serverCustomerEntityId(snapshot.servers[index], index),
      {
        x: body.x + radius + column * (radius * 2 + gap),
        y: body.y + radius + row * (radius * 2 + gap),
      },
      radius,
      renderer.activeEntityIds,
    );
  }

  if (overflow > 0) {
    drawFittedText(ctx, `+${formatInteger(overflow)}`, {
      x: body.x + body.width,
      y: body.y + body.height,
      maxWidth: body.width,
      font: canvasFont(700, 11),
      color: COLORS.warning,
      align: "right",
      baseline: "bottom",
    });
  }
}

function drawCompactLargeServerSummary(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  snapshot: NormalizedSnapshot,
): void {
  const body = insetRect(rect, 10);
  const busyRatio =
    snapshot.serverCount > 0 ? snapshot.busyServers / snapshot.serverCount : 0;
  const bar = {
    x: body.x,
    y: body.y + body.height / 2 - 6,
    width: body.width,
    height: 12,
  };

  fillRoundedRect(ctx, bar, 6, COLORS.idlePanel);
  fillRoundedRect(
    ctx,
    { ...bar, width: bar.width * clamp(busyRatio, 0, 1) },
    6,
    COLORS.busy,
  );
  drawFittedText(
    ctx,
    `${formatInteger(snapshot.busyServers)}/${formatInteger(
      snapshot.serverCount,
    )}`,
    {
      x: body.x + body.width / 2,
      y: bar.y - 8,
      maxWidth: body.width,
      font: canvasFont(800, 13),
      color: COLORS.text,
      align: "center",
      baseline: "bottom",
    },
  );
}

function drawCompactServerCell(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  server: VisualizerServerState | undefined,
  index: number,
  busy: boolean,
  renderer: QueueCanvasRendererContext,
): void {
  fillRoundedRect(ctx, rect, 5, busy ? COLORS.busyPanel : COLORS.idlePanel);
  strokeRoundedRect(ctx, rect, 5, busy ? COLORS.busy : COLORS.gridStroke);

  fillRoundedRect(
    ctx,
    {
      x: rect.x + rect.width * 0.24,
      y: rect.y + rect.height - 6,
      width: rect.width * 0.52,
      height: 4,
    },
    2,
    busy ? COLORS.busy : COLORS.idle,
  );

  if (!busy) {
    return;
  }

  renderer.entityLayer.drawCustomer(
    ctx,
    serverCustomerEntityId(server, index),
    {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2 - 1,
    },
    clamp(Math.min(rect.width, rect.height) / 4.8, 4, 7),
    renderer.activeEntityIds,
  );
}

function drawCompactExit(ctx: CanvasRenderingContext2D, rect: Rect): void {
  drawPanel(ctx, rect, COLORS.panel, COLORS.panelStroke, 7);
}
