import { areMetricNumbersFinite } from "./metric-finiteness";
import { calculateMmS, validateMmSParams } from "./mm-s";
import type {
  GgSFormulaResult,
  GgSMetrics,
  GgSParams,
  MetricQuality,
  QueueComputationInfo,
  QueueVariableId,
  ValidationError,
} from "./types";
import {
  asFieldIssue,
  isNonNegativeFinite,
  scvNonNegativeIssue,
} from "./validation";

const GGS_EXACT_VARIABLES = [
  "lambda",
  "mu",
  "s",
  "ca2",
  "cs2",
  "rho",
  "Pbusy",
] as const satisfies readonly QueueVariableId[];
const GGS_MEAN_VARIABLES = [
  "L",
  "Lq",
  "W",
  "Wq",
] as const satisfies readonly QueueVariableId[];
const GGS_BASELINE_PROBABILITY_VARIABLES = [
  "P0",
  "Pwait",
] as const satisfies readonly QueueVariableId[];

export function validateGgSParams(params: GgSParams): ValidationError[] {
  const errors = validateMmSParams(params);

  if (!isNonNegativeFinite(params.ca2)) {
    errors.push(asFieldIssue(scvNonNegativeIssue("ca2")));
  }

  if (!isNonNegativeFinite(params.cs2)) {
    errors.push(asFieldIssue(scvNonNegativeIssue("cs2")));
  }

  return errors;
}

export function calculateGgS(params: GgSParams): GgSFormulaResult {
  const errors = validateGgSParams(params);

  if (errors.length > 0) {
    return { status: "invalid", errors };
  }

  const baseline = calculateMmS(params);

  if (baseline.status !== "ok") {
    return baseline.status === "unstable"
      ? { status: "unstable", errors: baseline.errors }
      : { status: "invalid", errors: baseline.errors };
  }

  const { lambda, mu, s, ca2, cs2 } = params;
  const a = lambda / mu;
  const rho = lambda / (s * mu);
  const variabilityFactor = (ca2 + cs2) / 2;
  const matchesMmS = ca2 === 1 && cs2 === 1;
  const Wq = matchesMmS
    ? baseline.metrics.Wq
    : variabilityFactor * baseline.metrics.Wq;
  const Lq = matchesMmS ? baseline.metrics.Lq : lambda * Wq;
  const W = matchesMmS ? baseline.metrics.W : Wq + 1 / mu;
  const L = matchesMmS ? baseline.metrics.L : lambda * W;
  const serviceVariance = cs2 / (mu * mu);
  const serviceSecondMoment = (1 + cs2) / (mu * mu);
  const computation = buildComputationInfo(params);
  const metrics: GgSMetrics = {
    modelKind: "ggs",
    lambda,
    mu,
    s,
    a,
    rho,
    P0: baseline.metrics.P0,
    Pbusy: rho,
    Pwait: baseline.metrics.Pwait,
    ca2,
    cs2,
    variabilityFactor,
    serviceVariance,
    serviceSecondMoment,
    Lq,
    Wq,
    W,
    L,
    computation,
  };

  if (!areMetricNumbersFinite(metrics)) {
    return numericOverflow();
  }

  return { status: "ok", metrics, errors: [] };
}

function buildComputationInfo(params: GgSParams): QueueComputationInfo {
  const matchesMmS = params.ca2 === 1 && params.cs2 === 1;
  const meanQuality: MetricQuality = matchesMmS ? "exact" : "approximate";
  const probabilityQuality: MetricQuality = matchesMmS
    ? "exact"
    : "mm-s-baseline";
  const metricQuality: Partial<Record<QueueVariableId, MetricQuality>> = {};

  for (const variable of GGS_EXACT_VARIABLES) {
    metricQuality[variable] = "exact";
  }

  for (const variable of GGS_MEAN_VARIABLES) {
    metricQuality[variable] = meanQuality;
  }

  for (const variable of GGS_BASELINE_PROBABILITY_VARIABLES) {
    metricQuality[variable] = probabilityQuality;
  }

  return {
    modelKind: "ggs",
    method: matchesMmS ? "exact-mm-s" : "allen-cunneen-gg-s",
    metricQuality,
    notes: matchesMmS
      ? [
          "ca2 and cs2 are both 1, so this G/G/s case matches the exact M/M/s baseline.",
        ]
      : [
          "Mean waiting metrics use Allen-Cunneen scaling over the exact M/M/s baseline.",
          "P0 and Pwait are M/M/s baseline values; SCV-only G/G/s inputs do not determine those probabilities.",
        ],
  };
}

function numericOverflow(): GgSFormulaResult {
  return {
    status: "invalid",
    errors: [
      {
        field: "numeric",
        code: "numeric-overflow",
        message:
          "The G/G/s approximation exceeded JavaScript numeric limits for these inputs.",
      },
    ],
  };
}
