import { describe, expect, it, vi } from "vitest";

import { QueueCanvasVisualizer, type VisualizerSnapshot } from "./visualizer";

function createCanvasFixture(
  width = 720,
  height = 420,
): {
  canvas: HTMLCanvasElement;
  texts: string[];
} {
  const texts: string[] = [];
  const gradient = { addColorStop: vi.fn() };
  const methods = {
    createLinearGradient: () => gradient,
    fillText: (text: string) => {
      texts.push(text);
    },
    getLineDash: () => [],
    measureText: (text: string) => ({ width: text.length * 7 }),
    setLineDash: () => undefined,
  };
  const context = new Proxy(methods, {
    get(target, property) {
      if (property in target) {
        return target[property as keyof typeof methods];
      }

      return vi.fn();
    },
    set(target, property, value) {
      (target as Record<PropertyKey, unknown>)[property] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  const canvas = {
    width: 0,
    height: 0,
    clientWidth: width,
    clientHeight: height,
    getBoundingClientRect: () => ({ width, height }),
    getContext: (contextId: string) => (contextId === "2d" ? context : null),
  } as unknown as HTMLCanvasElement;

  return { canvas, texts };
}

describe("QueueCanvasVisualizer", () => {
  it("renders the main queue, server, and exit structure to canvas", () => {
    const { canvas, texts } = createCanvasFixture();
    const snapshot: VisualizerSnapshot = {
      now: 10,
      params: { s: 2, K: 5 },
      queue: [{ id: "queued-1" }, { id: "queued-2" }],
      queueLength: 2,
      servers: [
        { id: 1, status: "busy", customer: { id: "active-1" } },
        { id: 2, status: "idle" },
      ],
      serverCount: 2,
      busyServers: 1,
      completions: 3,
    };
    const visualizer = new QueueCanvasVisualizer({
      canvas,
      getSnapshot: () => snapshot,
      playing: false,
    });

    expect(canvas.width).toBe(720);
    expect(canvas.height).toBe(420);
    expect(texts).toEqual(
      expect.arrayContaining(["Queue", "Servers", "Completed", "Exit"]),
    );

    visualizer.dispose();
  });

  it("renders an accessible empty-state message without a snapshot", () => {
    const { canvas, texts } = createCanvasFixture();
    const visualizer = new QueueCanvasVisualizer({
      canvas,
      emptyMessage: "Need stable inputs",
      getSnapshot: () => null,
      playing: false,
    });

    expect(texts).toContain("Need stable inputs");
    expect(texts.some((text) => text.includes("will render here"))).toBe(true);

    visualizer.dispose();
  });

  it("renders compact direct-service snapshots", () => {
    const { canvas, texts } = createCanvasFixture(360, 120);
    const snapshot: VisualizerSnapshot = {
      modelKind: "mminf",
      busyServers: 0,
      servers: [],
    };
    const visualizer = new QueueCanvasVisualizer({
      canvas,
      getSnapshot: () => snapshot,
      playing: false,
      variant: "compact",
    });

    expect(texts).toEqual(expect.arrayContaining(["Direct", "Idle"]));

    visualizer.dispose();
  });

  it("renders a large-server summary when detailed cells would be noisy", () => {
    const { canvas, texts } = createCanvasFixture();
    const snapshot: VisualizerSnapshot = {
      servers: Array.from({ length: 60 }, (_, index) => ({
        status: index < 42 ? "busy" : "idle",
      })),
      serverCount: 60,
      busyServers: 42,
    };
    const visualizer = new QueueCanvasVisualizer({
      canvas,
      getSnapshot: () => snapshot,
      maxServerCells: 12,
      playing: false,
    });

    expect(texts).toEqual(expect.arrayContaining(["Servers", "+48 more"]));

    visualizer.dispose();
  });
});
