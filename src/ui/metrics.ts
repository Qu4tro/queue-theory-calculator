import { QUEUE_VARIABLES, type QueueVariableId } from "../queue/types";

export const METRIC_KEYS = QUEUE_VARIABLES;

export type MetricKey = QueueVariableId;

export type MetricValueKind =
  | "rate"
  | "integer"
  | "count"
  | "dimensionless"
  | "time"
  | "probability";

export type MetricGroup =
  | "parameters"
  | "throughput-capacity"
  | "steady-state"
  | "probabilities";

export type MetricDefinition = {
  key: MetricKey;
  symbol: string;
  valueKind: MetricValueKind;
  group: MetricGroup;
  editable: boolean;
};

export const METRIC_DEFINITIONS: Record<MetricKey, MetricDefinition> = {
  lambda: {
    key: "lambda",
    symbol: "λ",
    valueKind: "rate",
    group: "parameters",
    editable: true,
  },
  mu: {
    key: "mu",
    symbol: "μ",
    valueKind: "rate",
    group: "parameters",
    editable: true,
  },
  s: {
    key: "s",
    symbol: "s",
    valueKind: "integer",
    group: "parameters",
    editable: true,
  },
  K: {
    key: "K",
    symbol: "K",
    valueKind: "integer",
    group: "parameters",
    editable: true,
  },
  theta: {
    key: "theta",
    symbol: "θ",
    valueKind: "rate",
    group: "parameters",
    editable: true,
  },
  serviceScv: {
    key: "serviceScv",
    symbol: "SCV_s",
    valueKind: "dimensionless",
    group: "parameters",
    editable: true,
  },
  ca2: {
    key: "ca2",
    symbol: "Ca^2",
    valueKind: "dimensionless",
    group: "parameters",
    editable: true,
  },
  cs2: {
    key: "cs2",
    symbol: "Cs^2",
    valueKind: "dimensionless",
    group: "parameters",
    editable: true,
  },
  a: {
    key: "a",
    symbol: "a",
    valueKind: "dimensionless",
    group: "throughput-capacity",
    editable: true,
  },
  offeredRho: {
    key: "offeredRho",
    symbol: "λ/(sμ)",
    valueKind: "dimensionless",
    group: "throughput-capacity",
    editable: true,
  },
  lambdaEffective: {
    key: "lambdaEffective",
    symbol: "λeff",
    valueKind: "rate",
    group: "throughput-capacity",
    editable: false,
  },
  Ls: {
    key: "Ls",
    symbol: "Ls",
    valueKind: "count",
    group: "throughput-capacity",
    editable: true,
  },
  L: {
    key: "L",
    symbol: "L",
    valueKind: "count",
    group: "steady-state",
    editable: true,
  },
  Lq: {
    key: "Lq",
    symbol: "Lq",
    valueKind: "count",
    group: "steady-state",
    editable: true,
  },
  W: {
    key: "W",
    symbol: "W",
    valueKind: "time",
    group: "steady-state",
    editable: true,
  },
  Wq: {
    key: "Wq",
    symbol: "Wq",
    valueKind: "time",
    group: "steady-state",
    editable: true,
  },
  rho: {
    key: "rho",
    symbol: "ρ",
    valueKind: "probability",
    group: "probabilities",
    editable: true,
  },
  P0: {
    key: "P0",
    symbol: "P0",
    valueKind: "probability",
    group: "probabilities",
    editable: true,
  },
  Pbusy: {
    key: "Pbusy",
    symbol: "P(busy)",
    valueKind: "probability",
    group: "probabilities",
    editable: true,
  },
  Pwait: {
    key: "Pwait",
    symbol: "P(wait)",
    valueKind: "probability",
    group: "probabilities",
    editable: true,
  },
  abandonRate: {
    key: "abandonRate",
    symbol: "λab",
    valueKind: "rate",
    group: "throughput-capacity",
    editable: true,
  },
  throughput: {
    key: "throughput",
    symbol: "λserved",
    valueKind: "rate",
    group: "throughput-capacity",
    editable: true,
  },
  Pabandon: {
    key: "Pabandon",
    symbol: "P(abandon)",
    valueKind: "probability",
    group: "probabilities",
    editable: true,
  },
  Pserved: {
    key: "Pserved",
    symbol: "P(served)",
    valueKind: "probability",
    group: "probabilities",
    editable: true,
  },
  Pblock: {
    key: "Pblock",
    symbol: "P(block)",
    valueKind: "probability",
    group: "throughput-capacity",
    editable: true,
  },
};

export const METRIC_SYMBOLS: Record<MetricKey, string> = {
  lambda: METRIC_DEFINITIONS.lambda.symbol,
  mu: METRIC_DEFINITIONS.mu.symbol,
  s: METRIC_DEFINITIONS.s.symbol,
  K: METRIC_DEFINITIONS.K.symbol,
  theta: METRIC_DEFINITIONS.theta.symbol,
  serviceScv: METRIC_DEFINITIONS.serviceScv.symbol,
  ca2: METRIC_DEFINITIONS.ca2.symbol,
  cs2: METRIC_DEFINITIONS.cs2.symbol,
  a: METRIC_DEFINITIONS.a.symbol,
  offeredRho: METRIC_DEFINITIONS.offeredRho.symbol,
  lambdaEffective: METRIC_DEFINITIONS.lambdaEffective.symbol,
  Ls: METRIC_DEFINITIONS.Ls.symbol,
  L: METRIC_DEFINITIONS.L.symbol,
  Lq: METRIC_DEFINITIONS.Lq.symbol,
  W: METRIC_DEFINITIONS.W.symbol,
  Wq: METRIC_DEFINITIONS.Wq.symbol,
  rho: METRIC_DEFINITIONS.rho.symbol,
  P0: METRIC_DEFINITIONS.P0.symbol,
  Pbusy: METRIC_DEFINITIONS.Pbusy.symbol,
  Pwait: METRIC_DEFINITIONS.Pwait.symbol,
  abandonRate: METRIC_DEFINITIONS.abandonRate.symbol,
  throughput: METRIC_DEFINITIONS.throughput.symbol,
  Pabandon: METRIC_DEFINITIONS.Pabandon.symbol,
  Pserved: METRIC_DEFINITIONS.Pserved.symbol,
  Pblock: METRIC_DEFINITIONS.Pblock.symbol,
};

export function isMetricKey(value: string): value is MetricKey {
  return METRIC_KEYS.includes(value as MetricKey);
}

export function getMetricDefinition(key: MetricKey): MetricDefinition {
  return METRIC_DEFINITIONS[key];
}

export function getMetricValueKind(key: MetricKey): MetricValueKind {
  return METRIC_DEFINITIONS[key].valueKind;
}
