import type {
  QueueMetrics,
  QueueVariableId,
  SolverIssue,
} from "../queue/types";
import type { MetricKey } from "./metrics";
import { BASE_PARAM_KEYS, MMINF_NOT_APPLICABLE_KEYS } from "./model-config";

export function issuesByVariable(
  issues: readonly SolverIssue[],
): Partial<Record<QueueVariableId, SolverIssue>> {
  const grouped: Partial<Record<QueueVariableId, SolverIssue>> = {};

  for (const issue of issues) {
    if (issue.variable && grouped[issue.variable] === undefined) {
      grouped[issue.variable] = issue;
    }
  }

  return grouped;
}

export function metricNumber(
  metrics: QueueMetrics,
  key: MetricKey,
): number | null {
  if (key === "Pbusy") {
    return metrics.Pbusy;
  }

  const value = metrics[key];

  return typeof value === "number" ? value : null;
}

export function metricNotApplicable(
  metrics: QueueMetrics,
  key: MetricKey,
): boolean {
  return (
    metrics.modelKind === "mminf" && MMINF_NOT_APPLICABLE_KEYS.includes(key)
  );
}

export function modelKey(metrics: QueueMetrics): string {
  if (metrics.modelKind === "mminf") {
    return [
      "mminf",
      metrics.lambda.toPrecision(15),
      metrics.mu.toPrecision(15),
    ].join("|");
  }

  if (metrics.modelKind === "mg1" || metrics.modelKind === "md1") {
    return [
      metrics.modelKind,
      metrics.lambda.toPrecision(15),
      metrics.mu.toPrecision(15),
      metrics.serviceScv.toPrecision(15),
    ].join("|");
  }

  if (metrics.modelKind === "ggs") {
    return [
      metrics.modelKind,
      metrics.lambda.toPrecision(15),
      metrics.mu.toPrecision(15),
      metrics.s.toPrecision(15),
      metrics.ca2.toPrecision(15),
      metrics.cs2.toPrecision(15),
    ].join("|");
  }

  if (metrics.modelKind === "erlang-a") {
    return [
      metrics.modelKind,
      metrics.lambda.toPrecision(15),
      metrics.mu.toPrecision(15),
      metrics.s.toPrecision(15),
      metrics.theta.toPrecision(15),
    ].join("|");
  }

  const keys: QueueVariableId[] =
    metrics.K === undefined ? BASE_PARAM_KEYS : [...BASE_PARAM_KEYS, "K"];

  return keys.map((key) => metrics[key]?.toPrecision(15) ?? "").join("|");
}

export function comparisonThresholds(metrics: QueueMetrics) {
  if (metrics.modelKind === "mminf") {
    return {
      warmupDuration: Math.max(
        20 / metrics.lambda,
        20 / metrics.mu,
        5 * metrics.W,
      ),
      minComparisonDuration: Math.max(50 / metrics.lambda, 10 * metrics.W),
      minArrivals: 50,
      minCompletions: 30,
    };
  }

  const effectiveRate = Math.max(
    Number.EPSILON,
    metrics.lambdaEffective ?? metrics.throughput ?? metrics.lambda,
  );

  return {
    warmupDuration: Math.max(
      20 / metrics.lambda,
      20 / effectiveRate,
      5 * metrics.W,
    ),
    minComparisonDuration: Math.max(
      50 / metrics.lambda,
      50 / effectiveRate,
      10 * metrics.W,
    ),
    minArrivals: 50,
    minCompletions: 30,
  };
}

export function comparisonMetricKeys(metrics: QueueMetrics): MetricKey[] {
  if (metrics.modelKind === "mminf") {
    return [
      "lambda",
      "mu",
      "s",
      "a",
      "L",
      "Lq",
      "W",
      "Wq",
      "rho",
      "P0",
      "Pbusy",
      "Pwait",
    ];
  }

  if (metrics.modelKind === "mg1" || metrics.modelKind === "md1") {
    return [
      "lambda",
      "mu",
      "s",
      "serviceScv",
      "L",
      "Lq",
      "W",
      "Wq",
      "rho",
      "P0",
      "Pbusy",
      "Pwait",
    ];
  }

  if (metrics.modelKind === "ggs") {
    return [
      "lambda",
      "mu",
      "s",
      "ca2",
      "cs2",
      "L",
      "Lq",
      "W",
      "Wq",
      "rho",
      "P0",
      "Pbusy",
      "Pwait",
    ];
  }

  if (metrics.modelKind === "erlang-a") {
    return [
      "lambda",
      "mu",
      "s",
      "theta",
      "offeredRho",
      "throughput",
      "abandonRate",
      "Ls",
      "L",
      "Lq",
      "W",
      "Wq",
      "rho",
      "P0",
      "Pbusy",
      "Pwait",
      "Pabandon",
      "Pserved",
    ];
  }

  return metrics.K === undefined
    ? ["lambda", "mu", "s", "L", "Lq", "W", "Wq", "rho", "P0", "Pbusy", "Pwait"]
    : [
        "lambda",
        "lambdaEffective",
        "mu",
        "s",
        "K",
        "L",
        "Lq",
        "W",
        "Wq",
        "rho",
        "P0",
        "Pbusy",
        "Pwait",
        "Pblock",
      ];
}
