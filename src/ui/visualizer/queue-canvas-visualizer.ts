import { clamp } from "../math";
import {
  defaultTerminology,
  normalizeTerminology,
  type Terminology,
  termLabel,
} from "../terminology";
import { drawBackground } from "./canvas";
import { resizeCanvasToDisplaySize as resizeCanvasBackingStore } from "./canvas-sizing";
import { drawCompactScene } from "./compact-scene-renderer";
import { drawFullScene } from "./full-scene-renderer";
import type { QueueCanvasRendererContext } from "./renderer-context";
import { normalizeSnapshot, positiveInteger, positiveNumber } from "./snapshot";
import {
  DEFAULT_HEIGHT,
  DEFAULT_MAX_DETAILED_SERVERS,
  DEFAULT_MAX_FRAME_DELTA_SECONDS,
  DEFAULT_MAX_SERVER_CELLS,
  DEFAULT_MAX_SPEED,
  DEFAULT_MAX_VISIBLE_QUEUE_CUSTOMERS,
  DEFAULT_SPEED,
  DEFAULT_WIDTH,
} from "./style";
import type {
  QueueCanvasVisualizerOptions,
  QueueCanvasVisualizerVariant,
  SimulationAdvanceCallback,
  VisualizerSnapshot,
  VisualizerSnapshotGetter,
  VisualizerTerminologyGetter,
} from "./types";
import { VisualEntityLayer } from "./visual-entities";

export class QueueCanvasVisualizer {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private getSnapshot: VisualizerSnapshotGetter;
  private getTerminology: VisualizerTerminologyGetter;
  private advanceSimulation: SimulationAdvanceCallback | null;
  private readonly maxSpeed: number;
  private readonly maxFrameDeltaSeconds: number;
  private readonly maxVisibleQueueCustomers: number;
  private readonly maxDetailedServers: number;
  private readonly maxServerCells: number;
  private readonly emptyMessage: string | null;
  private readonly variant: QueueCanvasVisualizerVariant;
  private readonly entityLayer: VisualEntityLayer;
  private readonly activeEntityIds = new Set<string>();
  private readonly rendererContext: QueueCanvasRendererContext;
  private resizeObserver: ResizeObserver | null = null;
  private frameId: number | null = null;
  private renderLoopActive = false;
  private playing = false;
  private disposed = false;
  private speed: number;
  private width = DEFAULT_WIDTH;
  private height = DEFAULT_HEIGHT;
  private pixelRatio = 1;
  private lastFrameTimestamp: number | null = null;
  private reducedMotionQuery: MediaQueryList | null = null;
  private resizeDirty = true;

  private readonly handleFrame = (timestamp: number): void => {
    this.frameId = null;

    if (this.disposed) {
      return;
    }

    if (this.isDocumentHidden()) {
      this.lastFrameTimestamp = null;
      return;
    }

    const deltaSeconds = this.frameDelta(timestamp);
    this.entityLayer.setAnimationTime(timestamp / 1000);

    if (
      this.renderLoopActive &&
      this.playing &&
      this.advanceSimulation &&
      deltaSeconds > 0
    ) {
      this.advanceSimulation(deltaSeconds * this.speed);
    }

    this.draw();

    if (this.renderLoopActive) {
      this.scheduleFrame();
    }
  };

  private readonly handleVisibilityChange = (): void => {
    this.lastFrameTimestamp = null;
    this.resizeDirty = true;

    if (this.isDocumentHidden()) {
      this.cancelFrame();
      return;
    }

    this.redraw();

    if (this.renderLoopActive) {
      this.scheduleFrame();
    }
  };

  private readonly handleWindowResize = (): void => {
    this.resize();
  };

  private readonly handleReducedMotionChange = (): void => {
    this.entityLayer.setPrefersReducedMotion(
      this.reducedMotionQuery?.matches ?? false,
    );
    this.entityLayer.snapToTargets();
    this.redraw();
  };

  constructor(options: QueueCanvasVisualizerOptions) {
    this.canvas = options.canvas;
    const context = this.canvas.getContext("2d");

    if (!context) {
      throw new Error("QueueCanvasVisualizer requires a 2D canvas context.");
    }

    this.context = context;
    this.getSnapshot = options.getSnapshot;
    this.getTerminology = options.getTerminology ?? (() => defaultTerminology);
    this.advanceSimulation = resolveAdvanceCallback(options);
    this.maxSpeed = positiveNumber(options.maxSpeed, DEFAULT_MAX_SPEED);
    this.maxFrameDeltaSeconds = positiveNumber(
      options.maxFrameDeltaSeconds,
      DEFAULT_MAX_FRAME_DELTA_SECONDS,
    );
    this.maxVisibleQueueCustomers = positiveInteger(
      options.maxVisibleQueueCustomers,
      DEFAULT_MAX_VISIBLE_QUEUE_CUSTOMERS,
    );
    this.maxDetailedServers = positiveInteger(
      options.maxDetailedServers,
      DEFAULT_MAX_DETAILED_SERVERS,
    );
    this.maxServerCells = positiveInteger(
      options.maxServerCells,
      DEFAULT_MAX_SERVER_CELLS,
    );
    this.emptyMessage = options.emptyMessage ?? null;
    this.variant = options.variant ?? "full";
    this.entityLayer = new VisualEntityLayer({
      maxVisibleQueueCustomers: this.maxVisibleQueueCustomers,
      maxDetailedServers: this.maxDetailedServers,
    });
    this.rendererContext = {
      entityLayer: this.entityLayer,
      activeEntityIds: this.activeEntityIds,
      maxVisibleQueueCustomers: this.maxVisibleQueueCustomers,
      maxDetailedServers: this.maxDetailedServers,
      maxServerCells: this.maxServerCells,
      defaultEmptyMessage: (terms) => this.defaultEmptyMessage(terms),
    };
    this.speed = this.normalizeSpeed(options.speed);
    this.playing =
      options.playing ?? Boolean(options.advanceSimulation || options.onFrame);

    this.attachObservers();
    this.resizeCanvasToDisplaySize();
    this.draw();

    if (options.playing === true) {
      this.start();
    }
  }

  start(): void {
    if (this.disposed) {
      return;
    }

    this.renderLoopActive = true;
    this.scheduleFrame();
  }

  stop(): void {
    this.renderLoopActive = false;
    this.lastFrameTimestamp = null;
    this.cancelFrame();
  }

  play(): void {
    this.playing = true;
    this.start();
  }

  pause(): void {
    this.playing = false;
    this.stop();
    this.draw();
  }

  setPlaying(playing: boolean): void {
    if (playing) {
      this.play();
      return;
    }

    this.pause();
  }

  isPlaying(): boolean {
    return this.playing;
  }

  setSpeed(speed: number): void {
    this.speed = this.normalizeSpeed(speed);
  }

  getSpeed(): number {
    return this.speed;
  }

  setSnapshotGetter(getSnapshot: VisualizerSnapshotGetter): void {
    this.getSnapshot = getSnapshot;
    this.redraw();
  }

  setTerminologyGetter(getTerminology: VisualizerTerminologyGetter): void {
    this.getTerminology = getTerminology;
    this.redraw();
  }

  setTerminology(terminology: Partial<Terminology>): void {
    const normalized = normalizeTerminology(terminology);
    this.getTerminology = () => normalized;
    this.redraw();
  }

  setAdvanceCallback(
    advanceSimulation: SimulationAdvanceCallback | null,
  ): void {
    this.advanceSimulation = advanceSimulation;
  }

  resize(): void {
    this.resizeDirty = true;
    this.redraw();
  }

  redraw(): void {
    if (this.disposed) {
      return;
    }

    this.scheduleFrame();
  }

  draw(
    snapshot: VisualizerSnapshot | null | undefined = this.getSnapshot(),
  ): void {
    if (this.disposed) {
      return;
    }

    if (this.resizeDirty && !this.resizeCanvasToDisplaySize()) {
      return;
    }

    const ctx = this.context;
    const terms = normalizeTerminology(this.getTerminology());
    const normalized = normalizeSnapshot(snapshot);
    this.activeEntityIds.clear();
    this.entityLayer.setRenderLoopActive(this.renderLoopActive);

    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    drawBackground(ctx, this.width, this.height);

    if (this.variant === "compact") {
      drawCompactScene(
        ctx,
        this.width,
        this.height,
        normalized,
        terms,
        this.rendererContext,
      );
      return;
    }

    drawFullScene(
      ctx,
      this.width,
      this.height,
      normalized,
      terms,
      this.rendererContext,
    );
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.stop();
    this.entityLayer.clear();

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (typeof window !== "undefined") {
      window.removeEventListener("resize", this.handleWindowResize);
    }

    if (typeof document !== "undefined") {
      document.removeEventListener(
        "visibilitychange",
        this.handleVisibilityChange,
      );
    }

    if (this.reducedMotionQuery) {
      this.reducedMotionQuery.removeEventListener(
        "change",
        this.handleReducedMotionChange,
      );
      this.reducedMotionQuery = null;
    }
  }

  private defaultEmptyMessage(terms: Terminology): string {
    return (
      this.emptyMessage ??
      `Waiting for stable ${termLabel(terms, "queue", {
        sentence: true,
      })} inputs`
    );
  }

  private attachObservers(): void {
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => {
        this.resize();
      });
      this.resizeObserver.observe(this.canvas);
    } else if (typeof window !== "undefined") {
      window.addEventListener("resize", this.handleWindowResize);
    }

    if (typeof document !== "undefined") {
      document.addEventListener(
        "visibilitychange",
        this.handleVisibilityChange,
      );
    }

    if (typeof window !== "undefined" && "matchMedia" in window) {
      this.reducedMotionQuery = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      );
      this.entityLayer.setPrefersReducedMotion(this.reducedMotionQuery.matches);
      this.reducedMotionQuery.addEventListener(
        "change",
        this.handleReducedMotionChange,
      );
    }
  }

  private resizeCanvasToDisplaySize(): boolean {
    const displaySize = resizeCanvasBackingStore(this.canvas);

    if (!displaySize) {
      return false;
    }

    this.width = displaySize.width;
    this.height = displaySize.height;
    this.pixelRatio = displaySize.pixelRatio;
    this.resizeDirty = false;
    return true;
  }

  private scheduleFrame(): void {
    if (this.frameId !== null || this.disposed || this.isDocumentHidden()) {
      return;
    }

    this.frameId = requestAnimationFrame(this.handleFrame);
  }

  private cancelFrame(): void {
    if (this.frameId === null) {
      return;
    }

    cancelAnimationFrame(this.frameId);
    this.frameId = null;
  }

  private frameDelta(timestamp: number): number {
    if (this.lastFrameTimestamp === null) {
      this.lastFrameTimestamp = timestamp;
      return 0;
    }

    const rawDelta = (timestamp - this.lastFrameTimestamp) / 1000;
    this.lastFrameTimestamp = timestamp;

    if (!Number.isFinite(rawDelta) || rawDelta <= 0) {
      return 0;
    }

    return Math.min(rawDelta, this.maxFrameDeltaSeconds);
  }

  private normalizeSpeed(value: number | undefined): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      return DEFAULT_SPEED;
    }

    return clamp(value, 0.05, this.maxSpeed);
  }

  private isDocumentHidden(): boolean {
    return (
      typeof document !== "undefined" && document.visibilityState === "hidden"
    );
  }
}

function resolveAdvanceCallback(
  options: QueueCanvasVisualizerOptions,
): SimulationAdvanceCallback | null {
  if (options.advanceSimulation) {
    return options.advanceSimulation;
  }

  if (options.onFrame) {
    return (deltaTimeSeconds: number) => {
      options.onFrame?.(deltaTimeSeconds);
      return undefined;
    };
  }

  return null;
}
