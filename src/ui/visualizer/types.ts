import type { Terminology } from "../terminology";

export type VisualizerCustomer = {
  id?: number | string;
  customerId?: number | string | null;
  arrivedAt?: number | null;
  serviceStartedAt?: number | null;
  serviceEndsAt?: number | null;
};

export type VisualizerServerState = {
  id?: number;
  status?: "idle" | "busy";
  customerId?: number | string | null;
  customer?: VisualizerCustomer | null;
  serviceStartedAt?: number | null;
  serviceEndsAt?: number | null;
  timeRemaining?: number | null;
};

export type VisualizerQueuePreview = {
  customers?: readonly VisualizerCustomer[];
  totalLength?: number;
  overflow?: number;
  maxVisible?: number;
};

export type VisualizerSnapshot = {
  modelKind?: string;
  now?: number;
  params?: { modelKind?: string; s?: number | null; K?: number };
  queue?: readonly VisualizerCustomer[];
  queuePreview?: VisualizerQueuePreview;
  queueLength?: number;
  queueOverflow?: number;
  maxVisibleQueue?: number;
  servers?: readonly VisualizerServerState[];
  serverCount?: number | null;
  serverCapacity?: "finite" | "infinite";
  s?: number;
  busyServers?: number;
  idleServers?: number | null;
  systemCount?: number;
  nextArrivalAt?: number;
  arrivals?: number;
  acceptedArrivals?: number;
  blockedArrivals?: number;
  completions?: number;
  abandonments?: number;
  status?: string;
};

export type VisualizerSnapshotGetter = () =>
  | VisualizerSnapshot
  | null
  | undefined;
export type VisualizerTerminologyGetter = () => Terminology;
export type SimulationAdvanceCallback = (
  deltaTimeSeconds: number,
) => VisualizerSnapshot | undefined;
export type QueueCanvasVisualizerVariant = "full" | "compact";

export type QueueCanvasVisualizerOptions = {
  canvas: HTMLCanvasElement;
  getSnapshot: VisualizerSnapshotGetter;
  getTerminology?: VisualizerTerminologyGetter;
  advanceSimulation?: SimulationAdvanceCallback;
  onFrame?: (deltaSeconds: number) => void;
  speed?: number;
  playing?: boolean;
  maxSpeed?: number;
  maxFrameDeltaSeconds?: number;
  maxVisibleQueueCustomers?: number;
  maxDetailedServers?: number;
  maxServerCells?: number;
  emptyMessage?: string;
  variant?: QueueCanvasVisualizerVariant;
};

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Point = {
  x: number;
  y: number;
};

export type SceneLayout = {
  narrow: boolean;
  queue: Rect;
  servers: Rect;
  exit: Rect;
  exitPoint: Point;
};

export type CompactSceneLayout = {
  queue: Rect;
  servers: Rect;
  exit: Rect;
  exitPoint: Point;
};

export type NormalizedSnapshot = {
  hasSnapshot: boolean;
  now: number;
  queue: readonly VisualizerCustomer[];
  queueLength: number;
  servers: readonly VisualizerServerState[];
  serverCount: number;
  serverCapacity: "finite" | "infinite";
  capacity: number | null;
  queueCapacity: number | null;
  busyServers: number;
  systemCount: number;
  arrivals: number;
  acceptedArrivals: number;
  blockedArrivals: number;
  completions: number;
  abandonments: number;
  status: string | null;
};

export type VisualEntity = {
  id: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  radius: number;
  lastSeenAt: number;
  exitingUntil: number | null;
};
