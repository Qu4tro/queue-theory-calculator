import { calculateErlangA } from "../erlang-a";
import { calculateGgS } from "../gg-s";
import { calculateMg1 } from "../mg-1";
import { calculateMmInfinity } from "../mm-infinity";
import { calculateMmS } from "../mm-s";
import { calculateMmSK } from "../mm-s-k";
import type {
  BaseQueueParams,
  ErlangAParams,
  FiniteQueueParams,
  GgSParams,
  Mg1Params,
  MmInfinityParams,
  QueueMetrics,
  QueueParams,
  QueueVariableId,
  SolverIssue,
  SolverResult,
} from "../types";
import { QUEUE_VARIABLES } from "../types";
import { isErlangAOnlySuppliedMetric, type NormalizedInput } from "./normalize";
import { nearlyEqual, SOLVER_REL_TOLERANCE } from "./root";
import {
  areQueueParamsFinite,
  formulaResultToSolverResult,
  GGS_UNSUPPORTED_PROBABILITY_VARIABLES,
  has,
  metricValue,
  PROBABILITY_ABS_TOLERANCE,
  PROBABILITY_VARIABLES,
} from "./shared";

export function finalizeCandidate(
  params: QueueParams,
  input: NormalizedInput,
): SolverResult {
  if (!areQueueParamsFinite(params, input.modelKind)) {
    return {
      status: "invalid-input",
      issues: [
        {
          code: "params-not-finite",
          message:
            "Base queue parameters could not be inferred as finite positive values.",
        },
      ],
    };
  }

  const result =
    input.modelKind === "mminf"
      ? calculateMmInfinity(params as MmInfinityParams)
      : input.modelKind === "mmsk"
        ? calculateMmSK(params as FiniteQueueParams)
        : input.modelKind === "mg1" || input.modelKind === "md1"
          ? calculateMg1(params as Mg1Params)
          : input.modelKind === "ggs"
            ? calculateGgS(params as GgSParams)
            : input.modelKind === "erlang-a"
              ? calculateErlangA(params as ErlangAParams)
              : calculateMmS(params as BaseQueueParams);

  if (result.status !== "ok") {
    return formulaResultToSolverResult(result, params);
  }

  const unsupportedProbabilityIssues =
    validateUnsupportedGgSProbabilityConstraints(input);

  if (unsupportedProbabilityIssues.length > 0) {
    return {
      status: "unsupported",
      issues: unsupportedProbabilityIssues,
    };
  }

  const consistencyIssues = validateSuppliedValues(input, result.metrics);

  if (consistencyIssues.length > 0) {
    return {
      status: "inconsistent",
      issues: consistencyIssues,
      candidate: result.metrics,
      params,
      computation: result.metrics.computation,
    };
  }

  return {
    status: "solved",
    params,
    metrics: result.metrics,
    computation: result.metrics.computation,
    issues: [],
  };
}

export function validateSuppliedValues(
  input: NormalizedInput,
  metrics: QueueMetrics,
  options: { includeScaleMetrics?: boolean } = {},
): SolverIssue[] {
  const includeScaleMetrics = options.includeScaleMetrics ?? true;
  const issues: SolverIssue[] = [];

  for (const id of QUEUE_VARIABLES) {
    const suppliedValue = input.supplied[id];

    if (suppliedValue === undefined) {
      continue;
    }

    if (
      !includeScaleMetrics &&
      (id === "lambda" || id === "mu" || id === "W" || id === "Wq")
    ) {
      continue;
    }

    const actual = metricValue(metrics, id);

    if (isInapplicableSuppliedMetric(input, id, actual)) {
      continue;
    }

    if (!suppliedValueMatches(id, actual, suppliedValue)) {
      issues.push({
        variable: id,
        code: "value-mismatch",
        message: `${id} does not match the solved value ${actual}.`,
      });
    }
  }

  if (
    input.modelKind === "erlang-a" &&
    has(input.supplied, "throughput") &&
    has(input.supplied, "abandonRate") &&
    has(input.supplied, "lambda") &&
    !nearlyEqual(
      input.supplied.throughput + input.supplied.abandonRate,
      input.supplied.lambda,
    )
  ) {
    issues.push({
      variable: "throughput",
      code: "erlang-a-flow-mismatch",
      message:
        "throughput plus abandonRate must match lambda for Erlang A flow balance.",
    });
  }

  return issues;
}

export function isInapplicableSuppliedMetric(
  input: NormalizedInput,
  id: QueueVariableId,
  actual: number,
): boolean {
  return (
    input.modelKind !== "erlang-a" &&
    Number.isNaN(actual) &&
    isErlangAOnlySuppliedMetric(id)
  );
}

export function suppliedValueMatches(
  id: QueueVariableId,
  actual: number,
  expected: number,
): boolean {
  if (isDiscreteVariable(id)) {
    return actual === expected;
  }

  return isProbabilityVariable(id)
    ? probabilityNearlyEqual(actual, expected)
    : nearlyEqual(actual, expected);
}

export function isDiscreteVariable(id: QueueVariableId): boolean {
  return id === "s" || id === "K";
}

export function isProbabilityVariable(id: QueueVariableId): boolean {
  return (PROBABILITY_VARIABLES as readonly QueueVariableId[]).includes(id);
}

export function probabilityNearlyEqual(
  actual: number,
  expected: number,
): boolean {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) {
    return false;
  }

  const difference = Math.abs(actual - expected);

  if (difference <= PROBABILITY_ABS_TOLERANCE) {
    return true;
  }

  const probabilityScale = Math.max(Math.abs(actual), Math.abs(expected));
  const complementScale = Math.max(
    Math.abs(1 - actual),
    Math.abs(1 - expected),
  );

  return (
    difference <= SOLVER_REL_TOLERANCE * probabilityScale &&
    difference <= SOLVER_REL_TOLERANCE * complementScale
  );
}

export function validateUnsupportedGgSProbabilityConstraints(
  input: NormalizedInput,
): SolverIssue[] {
  if (
    input.modelKind !== "ggs" ||
    (has(input.values, "ca2") &&
      has(input.values, "cs2") &&
      nearlyEqual(input.values.ca2, 1) &&
      nearlyEqual(input.values.cs2, 1))
  ) {
    return [];
  }

  return GGS_UNSUPPORTED_PROBABILITY_VARIABLES.flatMap((variable) =>
    input.supplied[variable] === undefined
      ? []
      : [
          {
            variable,
            code: "ggs-probability-unsupported",
            message:
              "The G/G/s approximation does not determine P0 or Pwait from SCV inputs; those values are M/M/s baselines unless ca2 and cs2 are both 1.",
          },
        ],
  );
}
