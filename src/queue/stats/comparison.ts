import type {
  QueueMetricComparison,
  QueueMetricComparisonBadge,
  QueueMetricId,
  QueueStatsSnapshot,
  QueueTheoreticalMetrics,
} from "./types";

const INFINITE_METRIC_ORDER: QueueMetricId[] = [
  "lambda",
  "mu",
  "s",
  "L",
  "Lq",
  "W",
  "Wq",
  "rho",
  "P0",
  "Pbusy",
  "Pwait",
];
const MMINF_METRIC_ORDER: QueueMetricId[] = [
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
const GENERAL_SERVICE_METRIC_ORDER: QueueMetricId[] = [
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
const GGS_METRIC_ORDER: QueueMetricId[] = [
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
const FINITE_METRIC_ORDER: QueueMetricId[] = [
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
const ERLANG_A_METRIC_ORDER: QueueMetricId[] = [
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
const PROBABILITY_METRICS: QueueMetricId[] = [
  "rho",
  "P0",
  "Pbusy",
  "Pwait",
  "Pabandon",
  "Pserved",
  "Pblock",
];

export function compareQueueStatsToTheory(
  theoretical: QueueTheoreticalMetrics,
  snapshot: QueueStatsSnapshot,
): QueueMetricComparison[] {
  const metricOrder = comparisonMetricOrder(theoretical);

  return metricOrder.flatMap((metric) => {
    const theoreticalValue = theoretical[metric];
    const simulatedValue = snapshot.metrics[metric];

    if (theoreticalValue === undefined) {
      return [];
    }

    if (theoreticalValue === null) {
      return {
        metric,
        theoretical: null,
        simulated: simulatedValue,
        absoluteDiff: null,
        relativeDiff: null,
        badge:
          theoretical.modelKind === "mminf" && metric === "s"
            ? "configured"
            : "unavailable",
      };
    }

    if (metric === "s" || metric === "K") {
      return {
        metric,
        theoretical: theoreticalValue,
        simulated: simulatedValue,
        absoluteDiff: null,
        relativeDiff: null,
        badge: simulatedValue === null ? "unavailable" : "configured",
      };
    }

    if (simulatedValue === null) {
      return {
        metric,
        theoretical: theoreticalValue,
        simulated: null,
        absoluteDiff: null,
        relativeDiff: null,
        badge: "unavailable",
      };
    }

    const absoluteDiff = simulatedValue - theoreticalValue;
    const relativeDiff =
      theoreticalValue === 0 ? null : absoluteDiff / Math.abs(theoreticalValue);

    return {
      metric,
      theoretical: theoreticalValue,
      simulated: simulatedValue,
      absoluteDiff,
      relativeDiff,
      badge:
        snapshot.status === "comparable"
          ? comparisonBadge(metric, absoluteDiff, relativeDiff)
          : "pending",
    };
  });
}

function comparisonBadge(
  metric: QueueMetricId,
  absoluteDiff: number,
  relativeDiff: number | null,
): QueueMetricComparisonBadge {
  if (PROBABILITY_METRICS.includes(metric)) {
    const probabilityPointDiff = Math.abs(absoluteDiff);

    if (probabilityPointDiff <= 0.05) {
      return "near";
    }

    return probabilityPointDiff <= 0.1 ? "watch" : "wide";
  }

  if (relativeDiff === null) {
    return Math.abs(absoluteDiff) <= 0.05 ? "near" : "watch";
  }

  const relative = Math.abs(relativeDiff);

  if (relative <= 0.1) {
    return "near";
  }

  return relative <= 0.25 ? "watch" : "wide";
}

function comparisonMetricOrder(
  theoretical: QueueTheoreticalMetrics,
): QueueMetricId[] {
  if (theoretical.modelKind === "erlang-a") {
    return ERLANG_A_METRIC_ORDER;
  }

  if (theoretical.modelKind === "ggs") {
    return GGS_METRIC_ORDER;
  }

  if (theoretical.modelKind === "mg1" || theoretical.modelKind === "md1") {
    return GENERAL_SERVICE_METRIC_ORDER;
  }

  if (theoretical.modelKind === "mminf" || theoretical.s === null) {
    return MMINF_METRIC_ORDER;
  }

  return theoretical.K === undefined
    ? INFINITE_METRIC_ORDER
    : FINITE_METRIC_ORDER;
}
