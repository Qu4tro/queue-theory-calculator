export const QUEUE_VARIABLES = [
  "lambda",
  "mu",
  "s",
  "K",
  "theta",
  "serviceScv",
  "ca2",
  "cs2",
  "a",
  "offeredRho",
  "lambdaEffective",
  "Ls",
  "L",
  "Lq",
  "W",
  "Wq",
  "rho",
  "P0",
  "Pbusy",
  "Pwait",
  "abandonRate",
  "throughput",
  "Pabandon",
  "Pserved",
  "Pblock",
] as const;

export type QueueVariableId = (typeof QUEUE_VARIABLES)[number];

export type QueueInputMap = Partial<Record<QueueVariableId, number>>;

export type QueueModelKind =
  | "mm1"
  | "mms"
  | "mmsk"
  | "mminf"
  | "mg1"
  | "md1"
  | "ggs"
  | "erlang-a";

export interface SolverOptions {
  modelKind?: QueueModelKind;
  lossPreset?: boolean;
}

export interface InfiniteQueueParams {
  lambda: number;
  mu: number;
  s: number;
}

export interface FiniteQueueParams extends InfiniteQueueParams {
  K: number;
}

export interface MmInfinityParams {
  modelKind: "mminf";
  lambda: number;
  mu: number;
}

export interface Mg1Params {
  modelKind: "mg1" | "md1";
  lambda: number;
  mu: number;
  s: 1;
  serviceScv: number;
}

export interface GgSParams extends InfiniteQueueParams {
  modelKind: "ggs";
  ca2: number;
  cs2: number;
}

export interface ErlangAParams extends InfiniteQueueParams {
  modelKind: "erlang-a";
  theta: number;
}

export type BaseQueueParams = InfiniteQueueParams;
export type QueueParams =
  | InfiniteQueueParams
  | FiniteQueueParams
  | MmInfinityParams
  | Mg1Params
  | GgSParams
  | ErlangAParams;
export type MmSParams = InfiniteQueueParams;

export type MetricQuality = "exact" | "approximate" | "mm-s-baseline";

export interface QueueComputationInfo {
  modelKind: QueueModelKind;
  method: "exact-mm-s" | "allen-cunneen-gg-s" | "birth-death-erlang-a";
  metricQuality: Partial<Record<QueueVariableId, MetricQuality>>;
  notes: string[];
}

export interface QueueMetricsBase {
  modelKind?: QueueModelKind;
  lambda: number;
  mu: number;
  a: number;
  P0: number;
  Pwait: number;
  Lq: number;
  Wq: number;
  W: number;
  L: number;
}

type QueueMetricSpecificFields = {
  s: number | null;
  rho: number | null;
  Pbusy: number | null;
  theta: number;
  K: number;
  serviceScv: number;
  ca2: number;
  cs2: number;
  variabilityFactor: number;
  serviceVariance: number;
  serviceSecondMoment: number;
  computation: QueueComputationInfo;
  offeredRho: number;
  lambdaEffective: number;
  Ls: number;
  Pblock: number;
  abandonRate: number;
  throughput: number;
  Pabandon: number;
  Pserved: number;
  busyServers: number;
  stateProbabilities: number[];
};

type QueueMetricSpecificKey = keyof QueueMetricSpecificFields;

type QueueMetricResult<
  TFields extends Partial<QueueMetricsBase & QueueMetricSpecificFields>,
> = QueueMetricsBase &
  TFields & {
    [Key in Exclude<QueueMetricSpecificKey, keyof TFields>]?: never;
  };

export type MmSMetrics = QueueMetricResult<{
  modelKind?: "mm1" | "mms";
  s: number;
  rho: number;
  Pbusy: number;
  serviceScv: 1;
  serviceVariance: number;
  serviceSecondMoment: number;
}>;

export type FiniteQueueMetrics = QueueMetricResult<
  FiniteQueueParams & {
    modelKind?: "mmsk";
    offeredRho: number;
    lambdaEffective: number;
    rho: number;
    Pbusy: number;
    Pblock: number;
    serviceScv: 1;
    serviceVariance: number;
    serviceSecondMoment: number;
    busyServers: number;
    stateProbabilities: number[];
  }
>;

export type MmSKMetrics = FiniteQueueMetrics;

export type MmInfinityMetrics = QueueMetricResult<{
  modelKind: "mminf";
  s: null;
  rho: null;
  Pbusy: null;
  serviceScv: 1;
  serviceVariance: number;
  serviceSecondMoment: number;
  Pwait: 0;
  Lq: 0;
  Wq: 0;
}>;

export type Mg1Metrics = QueueMetricResult<{
  modelKind: "mg1" | "md1";
  s: 1;
  rho: number;
  Pbusy: number;
  serviceScv: number;
  serviceVariance: number;
  serviceSecondMoment: number;
}>;

export type GgSMetrics = QueueMetricResult<{
  modelKind: "ggs";
  s: number;
  rho: number;
  Pbusy: number;
  ca2: number;
  cs2: number;
  variabilityFactor: number;
  serviceVariance: number;
  serviceSecondMoment: number;
  computation: QueueComputationInfo;
}>;

export type ErlangAMetrics = QueueMetricResult<{
  modelKind: "erlang-a";
  theta: number;
  s: number;
  offeredRho: number;
  rho: number;
  Pbusy: number;
  serviceScv: 1;
  serviceVariance: number;
  serviceSecondMoment: number;
  Ls: number;
  abandonRate: number;
  throughput: number;
  Pabandon: number;
  Pserved: number;
  computation: QueueComputationInfo;
}>;

export type QueueMetrics =
  | MmSMetrics
  | MmSKMetrics
  | MmInfinityMetrics
  | Mg1Metrics
  | GgSMetrics
  | ErlangAMetrics;

export interface ValidationError {
  field?: QueueVariableId | "params" | "numeric";
  code: string;
  message: string;
}

export type MmSFormulaResult =
  | { status: "ok"; metrics: MmSMetrics; errors: [] }
  | { status: "invalid"; errors: ValidationError[] }
  | { status: "unstable"; errors: ValidationError[] };

export type MmSKFormulaResult =
  | { status: "ok"; metrics: MmSKMetrics; errors: [] }
  | { status: "invalid"; errors: ValidationError[] };

export type MmInfinityFormulaResult =
  | { status: "ok"; metrics: MmInfinityMetrics; errors: [] }
  | { status: "invalid"; errors: ValidationError[] };

export type Mg1FormulaResult =
  | { status: "ok"; metrics: Mg1Metrics; errors: [] }
  | { status: "invalid"; errors: ValidationError[] }
  | { status: "unstable"; errors: ValidationError[] };

export type GgSFormulaResult =
  | { status: "ok"; metrics: GgSMetrics; errors: [] }
  | { status: "invalid"; errors: ValidationError[] }
  | { status: "unstable"; errors: ValidationError[] };

export interface ErlangAWarning {
  code: string;
  message: string;
}

export type ErlangAFormulaResult =
  | {
      status: "ok";
      metrics: ErlangAMetrics;
      errors: [];
      warnings: ErlangAWarning[];
    }
  | { status: "invalid"; errors: ValidationError[] }
  | { status: "numeric-failure"; errors: ValidationError[] };

export type SolverStatus =
  | "invalid-input"
  | "need-more-inputs"
  | "inconsistent"
  | "unstable"
  | "unsupported"
  | "solved";

export interface SolverIssue {
  variable?: QueueVariableId;
  code: string;
  message: string;
}

export type SolverResult =
  | {
      status: "solved";
      params: QueueParams;
      metrics: QueueMetrics;
      computation?: QueueComputationInfo;
      issues: [];
    }
  | { status: "invalid-input"; issues: SolverIssue[] }
  | { status: "need-more-inputs"; issues: SolverIssue[] }
  | {
      status: "inconsistent";
      issues: SolverIssue[];
      candidate?: QueueMetrics;
      params?: QueueParams;
      computation?: QueueComputationInfo;
    }
  | { status: "unstable"; issues: SolverIssue[]; params?: QueueParams }
  | { status: "unsupported"; issues: SolverIssue[] };

export type QueueVariableCategory =
  | "rate"
  | "server-count"
  | "capacity"
  | "variability"
  | "length"
  | "time"
  | "load"
  | "utilization"
  | "probability";

export type QueueVariableDomain =
  | "positive"
  | "non-negative"
  | "integer-positive"
  | "probability"
  | "utilization";

export interface QueueVariableMetadata {
  id: QueueVariableId;
  label: string;
  description: string;
  category: QueueVariableCategory;
  domain: QueueVariableDomain;
  aliasOf?: QueueVariableId;
}

export const QUEUE_VARIABLE_METADATA = {
  lambda: {
    id: "lambda",
    label: "Arrival rate",
    description: "Average arrivals per unit time.",
    category: "rate",
    domain: "positive",
  },
  mu: {
    id: "mu",
    label: "Service rate",
    description: "Average service completions per server per unit time.",
    category: "rate",
    domain: "positive",
  },
  s: {
    id: "s",
    label: "Number of servers",
    description: "Number of parallel servers.",
    category: "server-count",
    domain: "integer-positive",
  },
  K: {
    id: "K",
    label: "System capacity",
    description:
      "Maximum customers allowed in the system, including service and waiting.",
    category: "capacity",
    domain: "integer-positive",
  },
  theta: {
    id: "theta",
    label: "Abandonment rate",
    description:
      "Patience expiration rate for each waiting customer; reciprocal of mean patience.",
    category: "rate",
    domain: "positive",
  },
  serviceScv: {
    id: "serviceScv",
    label: "Service SCV",
    description:
      "Squared coefficient of variation for service times; deterministic service is 0 and exponential service is 1.",
    category: "variability",
    domain: "non-negative",
  },
  ca2: {
    id: "ca2",
    label: "Arrival SCV",
    description: "Squared coefficient of variation of interarrival times.",
    category: "variability",
    domain: "non-negative",
  },
  cs2: {
    id: "cs2",
    label: "Service SCV",
    description: "Squared coefficient of variation of service times.",
    category: "variability",
    domain: "non-negative",
  },
  a: {
    id: "a",
    label: "Offered load",
    description: "Arrival rate divided by service rate.",
    category: "load",
    domain: "positive",
  },
  offeredRho: {
    id: "offeredRho",
    label: "Offered traffic ratio",
    description:
      "External arrival load divided by total service capacity; can exceed 1 in overloaded Erlang A systems.",
    category: "utilization",
    domain: "positive",
  },
  lambdaEffective: {
    id: "lambdaEffective",
    label: "Accepted arrival rate",
    description: "Arrival rate accepted into the system after blocking.",
    category: "rate",
    domain: "positive",
  },
  Ls: {
    id: "Ls",
    label: "Mean number in service",
    description: "Mean number of customers actively in service.",
    category: "length",
    domain: "non-negative",
  },
  L: {
    id: "L",
    label: "Mean number in system",
    description: "Mean number of customers in the system.",
    category: "length",
    domain: "non-negative",
  },
  Lq: {
    id: "Lq",
    label: "Mean number in queue",
    description: "Mean number of customers waiting in the queue.",
    category: "length",
    domain: "non-negative",
  },
  W: {
    id: "W",
    label: "Mean time in system",
    description: "Mean time a customer spends in the system.",
    category: "time",
    domain: "non-negative",
  },
  Wq: {
    id: "Wq",
    label: "Mean waiting time in queue",
    description: "Mean time a customer spends waiting in the queue.",
    category: "time",
    domain: "non-negative",
  },
  rho: {
    id: "rho",
    label: "Traffic intensity",
    description: "Server utilization across all servers.",
    category: "utilization",
    domain: "utilization",
  },
  P0: {
    id: "P0",
    label: "Empty-system probability",
    description: "Probability that the system has zero customers.",
    category: "probability",
    domain: "probability",
  },
  Pbusy: {
    id: "Pbusy",
    label: "Busy-server probability",
    description: "Probability a server is busy; an alias of traffic intensity.",
    category: "utilization",
    domain: "utilization",
    aliasOf: "rho",
  },
  Pwait: {
    id: "Pwait",
    label: "Delay probability",
    description:
      "Probability that an accepted arrival must wait before service; blocking is reported separately as Pblock.",
    category: "probability",
    domain: "probability",
  },
  abandonRate: {
    id: "abandonRate",
    label: "Abandonment rate",
    description: "Average customers abandoning from the queue per unit time.",
    category: "rate",
    domain: "non-negative",
  },
  throughput: {
    id: "throughput",
    label: "Service throughput",
    description: "Average customers completing service per unit time.",
    category: "rate",
    domain: "non-negative",
  },
  Pabandon: {
    id: "Pabandon",
    label: "Abandonment probability",
    description: "Probability an arrival abandons before service.",
    category: "probability",
    domain: "probability",
  },
  Pserved: {
    id: "Pserved",
    label: "Service probability",
    description: "Probability an arrival eventually completes service.",
    category: "probability",
    domain: "probability",
  },
  Pblock: {
    id: "Pblock",
    label: "Blocking probability",
    description: "Probability that an attempted arrival is blocked.",
    category: "probability",
    domain: "probability",
  },
} as const satisfies Record<QueueVariableId, QueueVariableMetadata>;
