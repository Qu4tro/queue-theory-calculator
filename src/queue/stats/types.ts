import type { QueueModelKind, QueueVariableId } from "../types";

export type QueueMetricId = QueueVariableId;

export interface FiniteQueueStatsParams {
  modelKind?: Exclude<QueueModelKind, "mminf">;
  lambda: number;
  mu: number;
  s: number;
  K?: number;
  theta?: number;
  serviceScv?: number;
  ca2?: number;
  cs2?: number;
}

export interface MmInfinityStatsParams {
  modelKind: "mminf";
  lambda: number;
  mu: number;
}

export type QueueStatsParams = FiniteQueueStatsParams | MmInfinityStatsParams;

export interface QueueTheoreticalMetrics {
  modelKind?: QueueModelKind;
  lambda: number;
  mu: number;
  s: number | null;
  K?: number;
  theta?: number;
  serviceScv?: number;
  ca2?: number;
  cs2?: number;
  a: number;
  offeredRho?: number;
  lambdaEffective?: number | null;
  Ls?: number;
  L: number;
  Lq: number;
  W: number;
  Wq: number;
  rho: number | null;
  P0: number;
  Pbusy: number | null;
  Pwait: number;
  Pblock?: number;
  abandonRate?: number;
  throughput?: number;
  Pabandon?: number;
  Pserved?: number;
}

export interface QueueStatsThresholds {
  warmupDuration: number;
  minComparisonDuration: number;
  minArrivals: number;
  minCompletions: number;
}

export interface QueueStatsConfig {
  params: QueueStatsParams;
  theoretical?: Partial<QueueTheoreticalMetrics>;
  thresholds?: Partial<QueueStatsThresholds>;
}

export type QueueStatsStatus =
  | "inactive"
  | "warming-up"
  | "collecting"
  | "comparable";

export interface QueueStateCounts {
  systemCount: number;
  queueLength: number;
  busyServers: number;
}

export interface QueueArrivalStatsEvent {
  type: "arrival";
  time: number;
  customerId: number;
  arrivalTime: number;
  waitedOnArrival: boolean;
}

export interface QueueBlockedArrivalStatsEvent {
  type: "blocked-arrival";
  time: number;
}

export interface QueueServiceStartStatsEvent {
  type: "service-start";
  time: number;
  customerId: number;
  serverId: number;
  arrivalTime: number;
  serviceStartedAt: number;
  serviceEndsAt: number;
  serviceDuration: number;
  waitedOnArrival: boolean;
}

export interface QueueServiceCompletionStatsEvent {
  type: "service-completion";
  time: number;
  customerId: number;
  serverId: number;
  arrivalTime: number;
  serviceStartedAt: number;
  serviceEndsAt: number;
  serviceDuration: number;
  waitedOnArrival: boolean;
}

export interface QueueAbandonmentStatsEvent {
  type: "abandonment";
  time: number;
  customerId: number;
  arrivalTime: number;
  abandonedAt: number;
  waitedOnArrival: true;
}

export type QueueStatsEvent =
  | QueueArrivalStatsEvent
  | QueueBlockedArrivalStatsEvent
  | QueueServiceStartStatsEvent
  | QueueServiceCompletionStatsEvent
  | QueueAbandonmentStatsEvent;

export interface QueueStatsCounters {
  arrivalsObserved: number;
  attemptedArrivalsObserved: number;
  acceptedArrivalsObserved: number;
  blockedArrivalsObserved: number;
  arrivalsThatWaited: number;
  servicesStarted: number;
  completedCustomers: number;
  abandonedCustomers: number;
  abandonmentsObserved: number;
  departedCustomers: number;
  completedServices: number;
  totalSystemTime: number;
  totalQueueWaitTime: number;
  totalTimeToExit: number;
  totalQueueTimeToExit: number;
  totalCompletedServiceTime: number;
  totalCompletedServiceTimeSquared: number;
  completedServiceTimeMean: number;
  completedServiceTimeM2: number;
  interarrivalDurationsObserved: number;
  totalInterarrivalTime: number;
  totalInterarrivalTimeSquared: number;
  interarrivalTimeMean: number;
  interarrivalTimeM2: number;
  areaSystemCount: number;
  areaQueueLength: number;
  areaBusyServers: number;
  emptySystemTime: number;
}

export interface QueueStatsMetrics {
  lambda: number | null;
  mu: number | null;
  s: number | null;
  K: number | null;
  theta: number | null;
  serviceScv: number | null;
  ca2: number | null;
  cs2: number | null;
  a: number | null;
  offeredRho: number | null;
  lambdaEffective: number | null;
  Ls: number | null;
  L: number | null;
  Lq: number | null;
  W: number | null;
  Wq: number | null;
  rho: number | null;
  P0: number | null;
  Pbusy: number | null;
  Pwait: number | null;
  Pblock: number | null;
  abandonRate: number | null;
  throughput: number | null;
  Pabandon: number | null;
  Pserved: number | null;
}

export type QueueStatsComparisonGate =
  | "warmup"
  | "sample-duration"
  | "arrivals"
  | "completions";

export interface QueueStatsSnapshot {
  status: QueueStatsStatus;
  params: QueueStatsParams | null;
  sampleStartTime: number | null;
  warmupEndsAt: number | null;
  lastIntegratedTime: number;
  sampleElapsed: number;
  thresholds: QueueStatsThresholds | null;
  counters: QueueStatsCounters;
  metrics: QueueStatsMetrics;
  comparable: boolean;
  missingComparability: QueueStatsComparisonGate[];
}

export type QueueMetricComparisonBadge =
  | "pending"
  | "near"
  | "watch"
  | "wide"
  | "configured"
  | "unavailable";

export interface QueueMetricComparison {
  metric: QueueMetricId;
  theoretical: number | null;
  simulated: number | null;
  absoluteDiff: number | null;
  relativeDiff: number | null;
  badge: QueueMetricComparisonBadge;
}

export interface QueueStatsValidationIssue {
  field:
    | "lambda"
    | "mu"
    | "s"
    | "K"
    | "theta"
    | "ca2"
    | "cs2"
    | keyof QueueStatsThresholds
    | "theoretical.W"
    | "system";
  code: string;
  message: string;
}

export type QueueStatsValidationResult =
  | {
      status: "ok";
      params: QueueStatsParams;
      thresholds: QueueStatsThresholds;
    }
  | { status: "invalid"; errors: QueueStatsValidationIssue[] }
  | { status: "unstable"; errors: QueueStatsValidationIssue[] };

export class QueueStatsParameterError extends Error {
  readonly errors: QueueStatsValidationIssue[];

  constructor(errors: QueueStatsValidationIssue[]) {
    super(errors.map((error) => error.message).join(" "));
    this.name = "QueueStatsParameterError";
    this.errors = errors;
  }
}

export function normalizeStatsParams(
  params: QueueStatsParams,
): QueueStatsParams {
  if (isMmInfinityStatsParams(params)) {
    return {
      modelKind: "mminf",
      lambda: params.lambda,
      mu: params.mu,
    };
  }

  return params.K === undefined
    ? {
        modelKind: params.modelKind,
        lambda: params.lambda,
        mu: params.mu,
        s: params.s,
        theta: params.theta,
        serviceScv: params.serviceScv,
        ca2: params.ca2,
        cs2: params.cs2,
      }
    : {
        modelKind: params.modelKind,
        lambda: params.lambda,
        mu: params.mu,
        s: params.s,
        K: params.K,
        theta: params.theta,
        serviceScv: params.serviceScv,
        ca2: params.ca2,
        cs2: params.cs2,
      };
}

export function isMmInfinityStatsParams(
  params: QueueStatsParams,
): params is MmInfinityStatsParams {
  return params.modelKind === "mminf";
}

export function isErlangAStatsParams(
  params: QueueStatsParams,
): params is FiniteQueueStatsParams & { modelKind: "erlang-a"; theta: number } {
  return params.modelKind === "erlang-a";
}
