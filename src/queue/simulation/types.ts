import type {
  QueueStatsSnapshot,
  QueueStatsThresholds,
  QueueTheoreticalMetrics,
} from "../stats";
import type { QueueModelKind } from "../types";

export type ServiceTimeModel =
  | { kind: "exponential" }
  | { kind: "deterministic" }
  | { kind: "gamma"; serviceScv: number };

export type SimulationParams =
  | FiniteSimulationParams
  | MmInfinitySimulationParams;

export interface FiniteSimulationParams {
  modelKind?: Exclude<QueueModelKind, "mminf">;
  lambda: number;
  mu: number;
  s: number;
  K?: number;
  theta?: number;
  serviceScv?: number;
  ca2?: number;
  cs2?: number;
  serviceTime?: ServiceTimeModel;
  seed?: number;
}

export interface MmInfinitySimulationParams {
  modelKind: "mminf";
  lambda: number;
  mu: number;
  seed?: number;
}

export type SimulationModelParams =
  | FiniteSimulationModelParams
  | MmInfinitySimulationModelParams;

export interface FiniteSimulationModelParams {
  modelKind: Exclude<QueueModelKind, "mminf">;
  lambda: number;
  mu: number;
  s: number;
  K?: number;
  theta?: number;
  serviceScv?: number;
  ca2?: number;
  cs2?: number;
}

export interface MmInfinitySimulationModelParams {
  modelKind: "mminf";
  lambda: number;
  mu: number;
}

export interface QueueSimulationOptions {
  maxEventsPerAdvance?: number;
  maxSnapshotQueueItems?: number;
  maxSnapshotServers?: number;
  collectStats?: boolean;
  theoreticalMetrics?: QueueTheoreticalMetrics;
  statsThresholds?: Partial<QueueStatsThresholds>;
}

export interface QueueSimulationResetOptions {
  collectStats?: boolean;
  theoreticalMetrics?: QueueTheoreticalMetrics;
  statsThresholds?: Partial<QueueStatsThresholds>;
}

export interface SimCustomer {
  id: number;
  arrivedAt: number;
  serviceStartedAt: number | null;
  serviceEndsAt: number | null;
  abandonAt: number | null;
  abandonedAt: number | null;
  waitedOnArrival: boolean;
  queuePosition: number | null;
}

export interface ServerState {
  id: number;
  status: "idle" | "busy";
  customerId: number | null;
  customer: SimCustomer | null;
  serviceStartedAt: number | null;
  serviceEndsAt: number | null;
  timeRemaining: number | null;
}

export interface QueueSnapshotPreview {
  customers: SimCustomer[];
  totalLength: number;
  overflow: number;
  maxVisible: number;
}

export interface SimulationAdvanceInfo {
  requestedDeltaTime: number;
  targetTime: number;
  advancedDeltaTime: number;
  remainingDeltaTime: number;
  processedEvents: number;
  eventCapReached: boolean;
}

export interface SimulationAccessibleSnapshot {
  label: string;
  summary: string;
  queueSummary: string;
  serverSummary: string;
}

export interface SimulationVisualSnapshot {
  modelKind: QueueModelKind;
  now: number;
  params: SimulationModelParams;
  queue: SimCustomer[];
  queuePreview: QueueSnapshotPreview;
  queueLength: number;
  queueOverflow: number;
  maxVisibleQueue: number;
  servers: ServerState[];
  busyServers: number;
  idleServers: number | null;
  serverCount: number | null;
  serverCapacity: "finite" | "infinite";
  nextArrivalAt: number;
  arrivals: number;
  acceptedArrivals: number;
  blockedArrivals: number;
  completions: number;
  abandonments: number;
  departures: number;
  nextCustomerId: number;
  lastAdvance: SimulationAdvanceInfo;
}

export interface SimulationSnapshot extends SimulationVisualSnapshot {
  stats: QueueStatsSnapshot | null;
  accessible: SimulationAccessibleSnapshot;
}

export interface SimulationValidationIssue {
  field:
    | "lambda"
    | "mu"
    | "s"
    | "K"
    | "theta"
    | "serviceScv"
    | "ca2"
    | "cs2"
    | "serviceTime"
    | "seed"
    | keyof QueueSimulationOptions
    | "system";
  code: string;
  message: string;
}

export type SimulationValidationResult =
  | { status: "ok"; params: ValidatedSimulationParams }
  | { status: "invalid"; errors: SimulationValidationIssue[] }
  | { status: "unstable"; errors: SimulationValidationIssue[] };

export class SimulationParameterError extends Error {
  readonly errors: SimulationValidationIssue[];

  constructor(errors: SimulationValidationIssue[]) {
    super(errors.map((error) => error.message).join(" "));
    this.name = "SimulationParameterError";
    this.errors = errors;
  }
}

export type ValidatedSimulationParams =
  | ValidatedFiniteSimulationParams
  | ValidatedMmInfinitySimulationParams;

export interface ValidatedFiniteSimulationParams {
  modelKind: Exclude<QueueModelKind, "mminf">;
  lambda: number;
  mu: number;
  s: number;
  K?: number;
  theta?: number;
  serviceScv?: number;
  ca2?: number;
  cs2?: number;
  serviceTime: ServiceTimeModel;
  seed?: number;
}

export interface ValidatedMmInfinitySimulationParams {
  modelKind: "mminf";
  lambda: number;
  mu: number;
  seed?: number;
}

export interface NormalizedSimulationOptions {
  maxEventsPerAdvance: number;
  maxSnapshotQueueItems: number;
  maxSnapshotServers: number;
  collectStats: boolean;
  theoreticalMetrics?: QueueTheoreticalMetrics;
  statsThresholds?: Partial<QueueStatsThresholds>;
}
