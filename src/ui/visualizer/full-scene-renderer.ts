import { formatInteger } from "../format";
import { clamp } from "../math";
import { pluralTerm, type Terminology, termLabel } from "../terminology";
import {
  drawArrow,
  drawCapacitySlot,
  drawFittedText,
  drawPanel,
  fillRoundedRect,
} from "./canvas";
import {
  createLayout,
  insetRect,
  serverColumnCount,
  unionRects,
} from "./layout";
import type { QueueCanvasRendererContext } from "./renderer-context";
import {
  isServerBusy,
  queueCustomerEntityId,
  serverCustomerEntityId,
} from "./snapshot";
import { COLORS, canvasFont } from "./style";
import type {
  NormalizedSnapshot,
  Rect,
  SceneLayout,
  VisualizerServerState,
} from "./types";

export function drawFullScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  snapshot: NormalizedSnapshot,
  terms: Terminology,
  renderer: QueueCanvasRendererContext,
): void {
  const layout = createLayout(width, height);

  if (!snapshot.hasSnapshot) {
    renderer.entityLayer.clear();
    drawEmptyState(ctx, layout, terms, snapshot.status, renderer);
    return;
  }

  drawQueue(ctx, layout.queue, snapshot, terms, renderer);
  drawFlow(ctx, layout);
  drawServers(ctx, layout.servers, snapshot, terms, renderer);
  drawExit(ctx, layout.exit);
  renderer.entityLayer.drawExiting(
    ctx,
    renderer.activeEntityIds,
    layout.exitPoint,
  );
  renderer.entityLayer.prune(renderer.activeEntityIds);
}

function drawEmptyState(
  ctx: CanvasRenderingContext2D,
  layout: SceneLayout,
  terms: Terminology,
  status: string | null,
  renderer: QueueCanvasRendererContext,
): void {
  const rect = unionRects(layout.queue, layout.servers, layout.exit);
  drawPanel(ctx, rect, COLORS.panel, COLORS.panelStroke);
  drawFittedText(ctx, status ?? renderer.defaultEmptyMessage(terms), {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2 - 10,
    maxWidth: rect.width - 40,
    font: canvasFont(700, 18),
    color: COLORS.text,
    align: "center",
    baseline: "middle",
  });
  drawFittedText(
    ctx,
    `${pluralTerm(terms, "server")} and ${pluralTerm(terms, "customer", {
      sentence: true,
    })} will render here`,
    {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2 + 18,
      maxWidth: rect.width - 40,
      font: canvasFont(500, 12),
      color: COLORS.muted,
      align: "center",
      baseline: "middle",
    },
  );
}

function drawQueue(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  snapshot: NormalizedSnapshot,
  terms: Terminology,
  renderer: QueueCanvasRendererContext,
): void {
  drawPanel(ctx, rect, COLORS.panel, COLORS.panelStroke);

  if (snapshot.serverCapacity === "infinite") {
    drawFittedText(
      ctx,
      `No waiting ${termLabel(terms, "queue", { sentence: true })}`,
      {
        x: rect.x + 14,
        y: rect.y + 24,
        maxWidth: rect.width - 28,
        font: canvasFont(700, 14),
        color: COLORS.text,
      },
    );
    drawFittedText(
      ctx,
      `${pluralTerm(terms, "arrival")} start service immediately`,
      {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
        maxWidth: rect.width - 28,
        font: canvasFont(600, 12),
        color: COLORS.muted,
        align: "center",
        baseline: "middle",
      },
    );
    return;
  }

  drawFittedText(ctx, termLabel(terms, "queue"), {
    x: rect.x + 14,
    y: rect.y + 24,
    maxWidth: rect.width - 28,
    font: canvasFont(700, 14),
    color: COLORS.text,
  });

  const body = insetRect(
    {
      x: rect.x,
      y: rect.y + 38,
      width: rect.width,
      height: rect.height - 44,
    },
    14,
  );

  if (snapshot.queueLength === 0 && snapshot.queueCapacity === 0) {
    drawFittedText(ctx, "No waiting capacity", {
      x: body.x + body.width / 2,
      y: body.y + body.height / 2,
      maxWidth: body.width,
      font: canvasFont(600, 12),
      color: COLORS.muted,
      align: "center",
      baseline: "middle",
    });
    return;
  }

  const radius = clamp(Math.min(body.width, body.height) / 12, 5, 10);
  const gap = radius * 0.9;
  const columns = Math.max(1, Math.floor(body.width / (radius * 2 + gap)));
  const rows = Math.max(1, Math.floor(body.height / (radius * 2 + gap)));
  const visualCapacity = Math.max(0, columns * rows);
  const visibleCount = Math.min(
    snapshot.queueLength,
    renderer.maxVisibleQueueCustomers,
    visualCapacity,
  );
  const overflow = Math.max(0, snapshot.queueLength - visibleCount);
  const finiteSlotCount =
    snapshot.queueCapacity !== null &&
    snapshot.queueCapacity <= renderer.maxVisibleQueueCustomers
      ? Math.min(snapshot.queueCapacity, visualCapacity)
      : 0;

  for (let index = 0; index < finiteSlotCount; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = body.x + radius + column * (radius * 2 + gap);
    const y = body.y + radius + row * (radius * 2 + gap);

    drawCapacitySlot(ctx, { x, y }, radius);
  }

  if (snapshot.queueLength === 0) {
    drawFittedText(
      ctx,
      `No waiting ${pluralTerm(terms, "customer", { sentence: true })}`,
      {
        x: body.x + body.width / 2,
        y: body.y + body.height / 2,
        maxWidth: body.width,
        font: canvasFont(600, 12),
        color: COLORS.muted,
        align: "center",
        baseline: "middle",
      },
    );
    return;
  }

  for (let index = 0; index < visibleCount; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = body.x + radius + column * (radius * 2 + gap);
    const y = body.y + radius + row * (radius * 2 + gap);
    const customer = snapshot.queue[index];
    const id = customer
      ? queueCustomerEntityId(customer, index)
      : `queue-placeholder-${index}`;

    renderer.entityLayer.drawCustomer(
      ctx,
      id,
      { x, y },
      radius,
      renderer.activeEntityIds,
    );
  }

  if (overflow > 0) {
    drawFittedText(
      ctx,
      `+${formatInteger(overflow)} ${pluralTerm(terms, "customer", {
        sentence: true,
      })}`,
      {
        x: body.x + body.width,
        y: body.y + body.height - 2,
        maxWidth: body.width,
        font: canvasFont(700, 13),
        color: COLORS.warning,
        align: "right",
        baseline: "bottom",
      },
    );
  }
}

function drawServers(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  snapshot: NormalizedSnapshot,
  terms: Terminology,
  renderer: QueueCanvasRendererContext,
): void {
  if (snapshot.serverCapacity === "infinite") {
    drawActiveServicePool(ctx, rect, snapshot, terms, renderer);
    return;
  }

  if (snapshot.serverCount > renderer.maxDetailedServers) {
    drawLargeServerSummary(ctx, rect, snapshot, terms, renderer);
    return;
  }

  drawPanel(ctx, rect, COLORS.panel, COLORS.panelStroke);

  drawFittedText(ctx, pluralTerm(terms, "server"), {
    x: rect.x + 14,
    y: rect.y + 24,
    maxWidth: rect.width - 28,
    font: canvasFont(700, 14),
    color: COLORS.text,
  });

  if (snapshot.serverCount === 0) {
    drawFittedText(
      ctx,
      `No ${pluralTerm(terms, "server", { sentence: true })}`,
      {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
        maxWidth: rect.width - 28,
        font: canvasFont(600, 12),
        color: COLORS.muted,
        align: "center",
        baseline: "middle",
      },
    );
    return;
  }

  const body = insetRect(
    {
      x: rect.x,
      y: rect.y + 38,
      width: rect.width,
      height: rect.height - 44,
    },
    10,
  );
  const columns = serverColumnCount(snapshot.serverCount, body);
  const rows = Math.ceil(snapshot.serverCount / columns);
  const gap = 8;
  const cellWidth = Math.max(20, (body.width - gap * (columns - 1)) / columns);
  const cellHeight = Math.max(22, (body.height - gap * (rows - 1)) / rows);

  for (let index = 0; index < snapshot.serverCount; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const cell = {
      x: body.x + column * (cellWidth + gap),
      y: body.y + row * (cellHeight + gap),
      width: cellWidth,
      height: cellHeight,
    };
    const server = snapshot.servers[index];
    const busy = isServerBusy(server, index, snapshot.busyServers);

    drawServerCell(ctx, cell, server, index, busy, terms, renderer);
  }
}

function drawActiveServicePool(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  snapshot: NormalizedSnapshot,
  terms: Terminology,
  renderer: QueueCanvasRendererContext,
): void {
  drawPanel(ctx, rect, COLORS.panel, COLORS.panelStroke);

  drawFittedText(ctx, "Active services", {
    x: rect.x + 14,
    y: rect.y + 24,
    maxWidth: rect.width - 28,
    font: canvasFont(700, 14),
    color: COLORS.text,
  });

  const body = insetRect(
    {
      x: rect.x,
      y: rect.y + 38,
      width: rect.width,
      height: rect.height - 44,
    },
    14,
  );

  if (snapshot.busyServers === 0) {
    drawFittedText(ctx, "No active services", {
      x: body.x + body.width / 2,
      y: body.y + body.height / 2,
      maxWidth: body.width,
      font: canvasFont(600, 12),
      color: COLORS.muted,
      align: "center",
      baseline: "middle",
    });
    return;
  }

  const radius = clamp(Math.min(body.width, body.height) / 16, 5, 10);
  const gap = radius * 1.1;
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
    const x = body.x + radius + column * (radius * 2 + gap);
    const y = body.y + radius + row * (radius * 2 + gap);

    renderer.entityLayer.drawCustomer(
      ctx,
      serverCustomerEntityId(snapshot.servers[index], index),
      { x, y },
      radius,
      renderer.activeEntityIds,
    );
  }

  if (overflow > 0) {
    drawFittedText(
      ctx,
      `+${formatInteger(overflow)} ${pluralTerm(terms, "customer", {
        sentence: true,
      })}`,
      {
        x: body.x + body.width,
        y: body.y + body.height - 2,
        maxWidth: body.width,
        font: canvasFont(700, 13),
        color: COLORS.warning,
        align: "right",
        baseline: "bottom",
      },
    );
  }
}

function drawServerCell(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  server: VisualizerServerState | undefined,
  index: number,
  busy: boolean,
  terms: Terminology,
  renderer: QueueCanvasRendererContext,
): void {
  const fill = busy ? COLORS.busyPanel : COLORS.idlePanel;
  const stroke = busy ? COLORS.busy : COLORS.gridStroke;
  drawPanel(ctx, rect, fill, stroke, 7);

  const compact = rect.width < 74 || rect.height < 58;
  const displayId =
    typeof server?.id === "number" && Number.isFinite(server.id)
      ? server.id
      : index + 1;

  if (!compact) {
    drawFittedText(
      ctx,
      `${termLabel(terms, "server")} ${formatInteger(displayId)}`,
      {
        x: rect.x + 8,
        y: rect.y + 17,
        maxWidth: rect.width - 16,
        font: canvasFont(600, 11),
        color: COLORS.muted,
      },
    );
  }

  const serverBaseHeight = compact ? 6 : 9;
  fillRoundedRect(
    ctx,
    {
      x: rect.x + rect.width * 0.2,
      y: rect.y + rect.height - serverBaseHeight - 8,
      width: rect.width * 0.6,
      height: serverBaseHeight,
    },
    3,
    busy ? COLORS.busy : COLORS.idle,
  );

  if (busy) {
    const customerId = serverCustomerEntityId(server, index);
    const radius = clamp(Math.min(rect.width, rect.height) / 8, 5, 11);
    renderer.entityLayer.drawCustomer(
      ctx,
      customerId,
      {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2 + (compact ? -1 : 4),
      },
      radius,
      renderer.activeEntityIds,
    );
    return;
  }

  if (!compact) {
    drawFittedText(ctx, "Idle", {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2 + 2,
      maxWidth: rect.width - 12,
      font: canvasFont(700, 12),
      color: COLORS.idle,
      align: "center",
      baseline: "middle",
    });
  }
}

function drawLargeServerSummary(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  snapshot: NormalizedSnapshot,
  terms: Terminology,
  renderer: QueueCanvasRendererContext,
): void {
  drawPanel(ctx, rect, COLORS.panel, COLORS.panelStroke);

  const busyRatio =
    snapshot.serverCount > 0 ? snapshot.busyServers / snapshot.serverCount : 0;

  drawFittedText(ctx, pluralTerm(terms, "server"), {
    x: rect.x + 14,
    y: rect.y + 24,
    maxWidth: rect.width - 28,
    font: canvasFont(700, 14),
    color: COLORS.text,
  });

  const bar = {
    x: rect.x + 14,
    y: rect.y + 42,
    width: rect.width - 28,
    height: 12,
  };
  fillRoundedRect(ctx, bar, 6, COLORS.idlePanel);
  fillRoundedRect(
    ctx,
    { ...bar, width: bar.width * clamp(busyRatio, 0, 1) },
    6,
    COLORS.busy,
  );

  const grid = insetRect(
    {
      x: rect.x + 14,
      y: rect.y + 66,
      width: rect.width - 28,
      height: rect.height - 80,
    },
    0,
  );
  const cellSize = 7;
  const gap = 3;
  const columns = Math.max(1, Math.floor(grid.width / (cellSize + gap)));
  const rows = Math.max(1, Math.floor(grid.height / (cellSize + gap)));
  const visibleCells = Math.min(
    snapshot.serverCount,
    renderer.maxServerCells,
    columns * rows,
  );

  for (let index = 0; index < visibleCells; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const busy = isServerBusy(
      snapshot.servers[index],
      index,
      snapshot.busyServers,
    );
    fillRoundedRect(
      ctx,
      {
        x: grid.x + column * (cellSize + gap),
        y: grid.y + row * (cellSize + gap),
        width: cellSize,
        height: cellSize,
      },
      2,
      busy ? COLORS.busy : COLORS.idle,
    );
  }

  const hiddenCells = snapshot.serverCount - visibleCells;

  if (hiddenCells > 0) {
    drawFittedText(ctx, `+${formatInteger(hiddenCells)} more`, {
      x: grid.x + grid.width,
      y: grid.y + grid.height,
      maxWidth: grid.width,
      font: canvasFont(700, 12),
      color: COLORS.warning,
      align: "right",
      baseline: "bottom",
    });
  }
}

function drawExit(ctx: CanvasRenderingContext2D, rect: Rect): void {
  drawPanel(ctx, rect, COLORS.panel, COLORS.panelStroke);

  if (rect.height < 66) {
    drawFittedText(ctx, "Completed", {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
      maxWidth: rect.width - 20,
      font: canvasFont(700, 12),
      color: COLORS.text,
      align: "center",
      baseline: "middle",
    });
    return;
  }

  drawFittedText(ctx, "Completed", {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2 - 7,
    maxWidth: rect.width - 20,
    font: canvasFont(800, 14),
    color: COLORS.text,
    align: "center",
    baseline: "middle",
  });
  drawFittedText(ctx, "Exit", {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2 + 15,
    maxWidth: rect.width - 20,
    font: canvasFont(600, 11),
    color: COLORS.muted,
    align: "center",
    baseline: "middle",
  });
}

function drawFlow(ctx: CanvasRenderingContext2D, layout: SceneLayout): void {
  if (layout.narrow) {
    drawArrow(
      ctx,
      {
        x: layout.queue.x + layout.queue.width / 2,
        y: layout.queue.y + layout.queue.height + 5,
      },
      {
        x: layout.servers.x + layout.servers.width / 2,
        y: layout.servers.y - 5,
      },
    );
    drawArrow(
      ctx,
      {
        x: layout.servers.x + layout.servers.width / 2,
        y: layout.servers.y + layout.servers.height + 5,
      },
      {
        x: layout.exit.x + layout.exit.width / 2,
        y: layout.exit.y - 5,
      },
    );
    return;
  }

  drawArrow(
    ctx,
    {
      x: layout.queue.x + layout.queue.width + 5,
      y: layout.queue.y + layout.queue.height / 2,
    },
    {
      x: layout.servers.x - 5,
      y: layout.servers.y + layout.servers.height / 2,
    },
  );
  drawArrow(
    ctx,
    {
      x: layout.servers.x + layout.servers.width + 5,
      y: layout.servers.y + layout.servers.height / 2,
    },
    {
      x: layout.exit.x - 5,
      y: layout.exit.y + layout.exit.height / 2,
    },
  );
}
