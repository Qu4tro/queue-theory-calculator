import { MAX_SERVERS_FOR_MATH } from "../mm-s";
import { calculateMmSK, MAX_CAPACITY_FOR_MATH } from "../mm-s-k";
import type {
  FiniteQueueParams,
  QueueMetrics,
  QueueParams,
  SolverIssue,
  SolverResult,
} from "../types";
import {
  finalizeCandidate,
  probabilityNearlyEqual,
  validateSuppliedValues,
} from "./finalize";
import type { NormalizedInput } from "./normalize";
import type { RootResult } from "./root";
import { nearlyEqual } from "./root";
import {
  ambiguousFiniteCapacity,
  ambiguousFiniteOfferedLoad,
  ambiguousFiniteServerCount,
  type CandidateResult,
  candidate,
  dedupeParams,
  FINITE_DERIVED_TARGETS,
  FINITE_INVERSE_SEARCH_STEP_BUDGET,
  FINITE_MISSING_SCALE_SHAPE_TARGETS,
  FINITE_ROOT_LOG_PROBE_REFINEMENTS,
  FINITE_ROOT_LOG_X_TOLERANCE,
  FINITE_ROOT_MAX_ITERATIONS,
  FINITE_SCALE_TARGETS,
  FINITE_SHAPE_TARGETS,
  type FiniteCandidateParamsResult,
  type FiniteInverseShapeTarget,
  type FiniteOfferedLoadRootPoint,
  type FiniteScaleTarget,
  type FiniteShapeTarget,
  finiteMissingScale,
  firstPresent,
  has,
  hasAny,
  isPositiveFinite,
  LOG_MAX_POSITIVE,
  LOG_MIN_POSITIVE,
  noFiniteCapacityMatch,
  noFiniteServerCountMatch,
  noFiniteShapeMatch,
  noFiniteTwoDimensionalSearch,
  searchBudgetExceeded,
  strictlyPositiveIssueObject,
  terminal,
  withInferredValues,
} from "./shared";

export function dimensionlessResultForUnsolvedFiniteTerminal(
  input: NormalizedInput,
  result: SolverResult,
): SolverResult | undefined {
  if (input.modelKind !== "mmsk" || !isUnsolvedFiniteTerminal(result)) {
    return undefined;
  }

  return dimensionlessResultForFiniteMissingScale(input);
}

export function dimensionlessResultForFiniteMissingScale(
  input: NormalizedInput,
): SolverResult | undefined {
  if (input.modelKind !== "mmsk" || has(input.values, "lambdaEffective")) {
    return undefined;
  }

  return validateFiniteMissingScaleRedundantInputs(input);
}

export function isUnsolvedFiniteTerminal(result: SolverResult): boolean {
  return (
    result.status === "need-more-inputs" || result.status === "unsupported"
  );
}

export function validateFiniteMissingScaleRedundantInputs(
  input: NormalizedInput,
): SolverResult | undefined {
  const { values } = input;

  if (
    !has(values, "s") ||
    has(values, "lambda") ||
    has(values, "mu") ||
    has(values, "lambdaEffective") ||
    has(values, "W") ||
    has(values, "Wq")
  ) {
    return undefined;
  }

  const shapeTarget = firstPresent(values, FINITE_MISSING_SCALE_SHAPE_TARGETS);

  if (shapeTarget === undefined) {
    return undefined;
  }

  const shapeIssue = validateFiniteMissingScaleShapeInputs(input);

  if (shapeIssue !== undefined) {
    return {
      status: "inconsistent",
      issues: [shapeIssue],
    };
  }

  if (!has(values, "K")) {
    return finiteMissingScale();
  }

  const offeredLoadsResult = solveFiniteOfferedLoadsForShape(
    input,
    shapeTarget,
  );

  if (offeredLoadsResult.status === "terminal") {
    return offeredLoadsResult.result;
  }

  let mismatch:
    | { issues: SolverIssue[]; metrics: QueueMetrics; params: QueueParams }
    | undefined;

  for (const offeredLoad of offeredLoadsResult.offeredLoads) {
    const params = {
      lambda: offeredLoad,
      mu: 1,
      s: values.s,
      K: values.K,
    };
    const result = calculateMmSK(params);

    if (result.status !== "ok") {
      continue;
    }

    const issues = validateSuppliedValues(input, result.metrics, {
      includeScaleMetrics: false,
    });

    if (issues.length === 0) {
      return finiteMissingScale();
    }

    mismatch ??= { issues, metrics: result.metrics, params };
  }

  if (mismatch !== undefined) {
    return {
      status: "inconsistent",
      issues: mismatch.issues,
      candidate: mismatch.metrics,
      params: mismatch.params,
    };
  }

  return noFiniteShapeMatch(shapeTarget);
}

export function validateFiniteMissingScaleShapeInputs(
  input: NormalizedInput,
): SolverIssue | undefined {
  const { values } = input;

  for (const target of FINITE_MISSING_SCALE_SHAPE_TARGETS) {
    if (!has(values, target)) {
      continue;
    }

    const issue =
      has(values, "s") && has(values, "K")
        ? validateFiniteInverseShapeTarget(
            target,
            values[target],
            values.s,
            values.K,
          )
        : validateFiniteMissingScaleShapeTarget(target, values[target]);

    if (issue !== undefined) {
      return issue;
    }
  }

  if (
    has(values, "rho") &&
    has(values, "P0") &&
    values.P0 > 1 - values.rho &&
    !probabilityNearlyEqual(values.P0, 1 - values.rho)
  ) {
    return {
      variable: "P0",
      code: "finite-P0-rho-mismatch",
      message:
        "Finite-capacity P0 must be no greater than one minus utilization.",
    };
  }

  return undefined;
}

export function validateFiniteMissingScaleShapeTarget(
  target: FiniteInverseShapeTarget,
  value: number,
): SolverIssue | undefined {
  if (target === "P0" || target === "Pwait" || target === "Pblock") {
    return value > 0 && value < 1
      ? undefined
      : {
          variable: target,
          code: "open-probability-required",
          message: `${target} must be greater than 0 and less than 1 for this inverse solve.`,
        };
  }

  if (target === "rho") {
    return value > 0 && value < 1
      ? undefined
      : {
          variable: target,
          code: "open-utilization-required",
          message:
            "Finite-capacity utilization must be greater than 0 and less than 1 for this inverse solve.",
        };
  }

  return value > 0 ? undefined : strictlyPositiveIssueObject(target);
}

export function findFiniteCandidate(input: NormalizedInput): CandidateResult {
  const { values } = input;

  if (!has(values, "s") && !has(values, "K")) {
    return hasAny(values, FINITE_DERIVED_TARGETS)
      ? terminal(noFiniteTwoDimensionalSearch())
      : { kind: "none" };
  }

  if (!has(values, "s") && has(values, "K")) {
    return solveUnknownFiniteServerCountPath(input);
  }

  if (has(values, "s") && !has(values, "K")) {
    return solveUnknownFiniteCapacityPath(input);
  }

  const generated = finiteCandidateParamsFromFixedCapacity(input);

  if (generated.kind === "terminal" || generated.kind === "none") {
    return generated;
  }

  if (generated.params.length === 0) {
    return terminal(noFiniteShapeMatch(generated.target ?? "Pwait"));
  }

  if (generated.params.length === 1) {
    return candidate(generated.pathId, generated.params[0]);
  }

  return terminal(
    finalizeFiniteCandidateParams(
      generated.params,
      input,
      ambiguousFiniteOfferedLoad(generated.target ?? "Pwait"),
      noFiniteShapeMatch(generated.target ?? "Pwait"),
    ),
  );
}

export function finiteCandidateParamsFromFixedCapacity(
  input: NormalizedInput,
): FiniteCandidateParamsResult {
  const { values } = input;

  if (
    has(values, "lambda") &&
    has(values, "mu") &&
    has(values, "s") &&
    has(values, "K")
  ) {
    return {
      kind: "params",
      pathId: "finite-base-params",
      params: [
        {
          lambda: values.lambda,
          mu: values.mu,
          s: values.s,
          K: values.K,
        },
      ],
    };
  }

  if (!has(values, "s") || !has(values, "K")) {
    return { kind: "none" };
  }

  const shapeTarget =
    firstPresent(values, FINITE_SHAPE_TARGETS) ??
    (has(values, "Pwait") ? "Pwait" : undefined);

  if (shapeTarget === undefined) {
    return { kind: "none" };
  }

  const offeredLoadsResult = solveFiniteOfferedLoadsForShape(
    input,
    shapeTarget,
  );

  if (offeredLoadsResult.status === "terminal") {
    return { kind: "terminal", result: offeredLoadsResult.result };
  }

  const offeredLoads = offeredLoadsResult.offeredLoads;

  if (has(values, "lambda") && !has(values, "mu")) {
    const params = offeredLoads.flatMap((offeredLoad) => {
      const mu = values.lambda / offeredLoad;

      return isPositiveFinite(mu)
        ? [{ lambda: values.lambda, mu, s: values.s, K: values.K }]
        : [];
    });

    return {
      kind: "params",
      pathId: `finite-lambda-${shapeTarget}`,
      target: shapeTarget,
      params,
    };
  }

  if (has(values, "mu") && !has(values, "lambda")) {
    const params = offeredLoads.flatMap((offeredLoad) => {
      const lambda = offeredLoad * values.mu;

      return isPositiveFinite(lambda)
        ? [{ lambda, mu: values.mu, s: values.s, K: values.K }]
        : [];
    });

    return {
      kind: "params",
      pathId: `finite-mu-${shapeTarget}`,
      target: shapeTarget,
      params,
    };
  }

  if (!has(values, "lambda") && !has(values, "mu")) {
    const scaleTarget = firstPresent(values, FINITE_SCALE_TARGETS);

    if (scaleTarget === undefined) {
      return { kind: "none" };
    }

    const scaleValue = values[scaleTarget];

    if (scaleValue === undefined) {
      return { kind: "none" };
    }

    const scaleIssue = validateFiniteScaleTarget(scaleTarget, scaleValue);

    if (scaleIssue !== undefined) {
      return {
        kind: "terminal",
        result: { status: "inconsistent", issues: [scaleIssue] },
      };
    }

    const params = offeredLoads.flatMap((offeredLoad) => {
      const reference = calculateMmSK({
        lambda: offeredLoad,
        mu: 1,
        s: values.s,
        K: values.K,
      });

      if (reference.status !== "ok") {
        return [];
      }

      const referenceScale = reference.metrics[scaleTarget];

      if (!isPositiveFinite(referenceScale)) {
        return [];
      }

      const mu =
        scaleTarget === "lambdaEffective"
          ? scaleValue / referenceScale
          : referenceScale / scaleValue;
      const lambda = offeredLoad * mu;

      return isPositiveFinite(mu) && isPositiveFinite(lambda)
        ? [{ lambda, mu, s: values.s, K: values.K }]
        : [];
    });

    return {
      kind: "params",
      pathId: `finite-${shapeTarget}-${scaleTarget}`,
      target: shapeTarget,
      params,
    };
  }

  return { kind: "none" };
}

export function solveUnknownFiniteServerCountPath(
  input: NormalizedInput,
): CandidateResult {
  const { values } = input;

  if (
    has(values, "s") ||
    !has(values, "K") ||
    !hasAny(values, FINITE_DERIVED_TARGETS)
  ) {
    return { kind: "none" };
  }

  const maxServerCount = Math.min(values.K, MAX_SERVERS_FOR_MATH);
  const searchLimit = Math.min(
    maxServerCount,
    FINITE_INVERSE_SEARCH_STEP_BUDGET,
  );
  let solvedMatch: SolverResult | undefined;

  for (let s = 1; s <= searchLimit; s += 1) {
    const generated = finiteCandidateParamsFromFixedCapacity(
      withInferredValues(input, { s }),
    );
    const result = evaluateFiniteGeneratedSearchResult(
      generated,
      input,
      ambiguousFiniteServerCount(),
    );

    if (result.kind === "terminal") {
      return result;
    }

    if (result.kind === "solved") {
      if (solvedMatch !== undefined) {
        return terminal(ambiguousFiniteServerCount());
      }

      solvedMatch = result.result;
    }
  }

  if (searchLimit < maxServerCount) {
    return terminal(searchBudgetExceeded("s", searchLimit));
  }

  return solvedMatch === undefined
    ? terminal(noFiniteServerCountMatch())
    : terminal(solvedMatch);
}

export function solveUnknownFiniteCapacityPath(
  input: NormalizedInput,
): CandidateResult {
  const { values } = input;

  if (
    !has(values, "s") ||
    has(values, "K") ||
    !hasAny(values, FINITE_DERIVED_TARGETS)
  ) {
    return { kind: "none" };
  }

  let solvedMatch: SolverResult | undefined;
  const maxCapacity = MAX_CAPACITY_FOR_MATH;
  const searchLimit = Math.min(
    maxCapacity,
    values.s + FINITE_INVERSE_SEARCH_STEP_BUDGET - 1,
  );

  for (let K = values.s; K <= searchLimit; K += 1) {
    const generated = finiteCandidateParamsFromFixedCapacity(
      withInferredValues(input, { K }),
    );
    const result = evaluateFiniteGeneratedSearchResult(
      generated,
      input,
      ambiguousFiniteCapacity(),
    );

    if (result.kind === "terminal") {
      return result;
    }

    if (result.kind === "solved") {
      if (solvedMatch !== undefined) {
        return terminal(ambiguousFiniteCapacity());
      }

      solvedMatch = result.result;
    }
  }

  if (searchLimit < maxCapacity) {
    return terminal(
      searchBudgetExceeded("K", FINITE_INVERSE_SEARCH_STEP_BUDGET),
    );
  }

  return solvedMatch === undefined
    ? terminal(noFiniteCapacityMatch())
    : terminal(solvedMatch);
}

export function evaluateFiniteGeneratedSearchResult(
  generated: FiniteCandidateParamsResult,
  input: NormalizedInput,
  ambiguityResult: SolverResult,
):
  | { kind: "none" }
  | { kind: "solved"; result: SolverResult }
  | { kind: "terminal"; result: SolverResult } {
  if (generated.kind === "none") {
    return { kind: "none" };
  }

  if (generated.kind === "terminal") {
    return { kind: "terminal", result: generated.result };
  }

  if (generated.params.length === 0) {
    return { kind: "none" };
  }

  return findFiniteSolvedMatch(generated.params, input, ambiguityResult);
}

export function finalizeFiniteCandidateParams(
  paramsList: readonly FiniteQueueParams[],
  input: NormalizedInput,
  ambiguityResult: SolverResult,
  noMatchResult: SolverResult,
): SolverResult {
  let solvedMatch: SolverResult | undefined;

  for (const params of dedupeFiniteParams(paramsList)) {
    const result = finalizeCandidate(params, input);

    if (result.status !== "solved") {
      continue;
    }

    if (solvedMatch !== undefined) {
      return ambiguityResult;
    }

    solvedMatch = result;
  }

  return solvedMatch ?? noMatchResult;
}

export function findFiniteSolvedMatch(
  paramsList: readonly FiniteQueueParams[],
  input: NormalizedInput,
  ambiguityResult: SolverResult,
):
  | { kind: "none" }
  | { kind: "solved"; result: SolverResult }
  | { kind: "terminal"; result: SolverResult } {
  let solvedMatch: SolverResult | undefined;

  for (const params of dedupeFiniteParams(paramsList)) {
    const result = finalizeCandidate(params, input);

    if (result.status !== "solved") {
      continue;
    }

    if (solvedMatch !== undefined) {
      return { kind: "terminal", result: ambiguityResult };
    }

    solvedMatch = result;
  }

  return solvedMatch === undefined
    ? { kind: "none" }
    : { kind: "solved", result: solvedMatch };
}

export function dedupeFiniteParams(
  paramsList: readonly FiniteQueueParams[],
): FiniteQueueParams[] {
  return dedupeParams(
    paramsList,
    (existing, params) =>
      existing.s === params.s &&
      existing.K === params.K &&
      nearlyEqual(existing.lambda, params.lambda) &&
      nearlyEqual(existing.mu, params.mu),
  );
}

export function solveFiniteOfferedLoadsForShape(
  input: NormalizedInput,
  target: FiniteInverseShapeTarget,
):
  | { status: "ok"; offeredLoads: number[] }
  | { status: "terminal"; result: SolverResult } {
  const { values } = input;

  if (!has(values, "s") || !has(values, "K") || !has(values, target)) {
    return {
      status: "terminal",
      result: {
        status: "need-more-inputs",
        issues: [
          {
            code: "missing-finite-shape",
            message:
              "Enter servers, capacity, and a finite-capacity shape metric to infer offered load.",
          },
        ],
      },
    };
  }

  const targetIssue = validateFiniteInverseShapeTarget(
    target,
    values[target],
    values.s,
    values.K,
  );

  if (targetIssue !== undefined) {
    return {
      status: "terminal",
      result: { status: "inconsistent", issues: [targetIssue] },
    };
  }

  const root = solveFiniteOfferedLoadRoot(input, target);

  return {
    status: "ok",
    offeredLoads: root.ok && isPositiveFinite(root.value) ? [root.value] : [],
  };
}

export function solveFiniteOfferedLoadRoot(
  input: NormalizedInput,
  target: FiniteInverseShapeTarget,
): RootResult {
  const { values } = input;

  if (!has(values, "s") || !has(values, "K") || !has(values, target)) {
    return { ok: false, reason: "invalid-target" };
  }

  const targetValue = values[target];
  const increasing = target !== "P0";
  const evaluate = (
    logOfferedLoad: number,
  ): FiniteOfferedLoadRootPoint | undefined => {
    const value = calculateFiniteShapeMetricFromLog(
      values.s,
      values.K,
      logOfferedLoad,
      target,
    );
    const residual = value === undefined ? undefined : value - targetValue;

    return residual !== undefined && Number.isFinite(residual)
      ? { logValue: logOfferedLoad, residual }
      : undefined;
  };
  const lowPoint = findValidFiniteOfferedLoadRootPoint(
    evaluate,
    LOG_MIN_POSITIVE,
    LOG_MAX_POSITIVE,
  );
  const highPoint = findValidFiniteOfferedLoadRootPoint(
    evaluate,
    LOG_MAX_POSITIVE,
    LOG_MIN_POSITIVE,
  );

  if (
    lowPoint === undefined ||
    highPoint === undefined ||
    lowPoint.logValue >= highPoint.logValue
  ) {
    return { ok: false, reason: "no-bracket" };
  }

  if (
    increasing
      ? lowPoint.residual > 0 || highPoint.residual < 0
      : lowPoint.residual < 0 || highPoint.residual > 0
  ) {
    return { ok: false, reason: "no-bracket" };
  }

  let low = lowPoint;
  let high = highPoint;

  for (
    let iteration = 1;
    iteration <= FINITE_ROOT_MAX_ITERATIONS;
    iteration += 1
  ) {
    if (high.logValue - low.logValue <= FINITE_ROOT_LOG_X_TOLERANCE) {
      return finiteOfferedLoadRootResult(
        Math.abs(low.residual) <= Math.abs(high.residual) ? low : high,
        iteration - 1,
      );
    }

    const midLog = (low.logValue + high.logValue) / 2;
    const midPoint = findValidFiniteOfferedLoadMidpoint(
      evaluate,
      low.logValue,
      midLog,
      high.logValue,
    );

    if (midPoint === undefined) {
      return { ok: false, reason: "no-bracket" };
    }

    if (increasing ? midPoint.residual < 0 : midPoint.residual > 0) {
      low = midPoint;
    } else {
      high = midPoint;
    }
  }

  return { ok: false, reason: "max-iterations" };
}

export function findValidFiniteOfferedLoadRootPoint(
  evaluate: (logValue: number) => FiniteOfferedLoadRootPoint | undefined,
  startLog: number,
  endLog: number,
): FiniteOfferedLoadRootPoint | undefined {
  const startPoint = evaluate(startLog);

  if (startPoint !== undefined) {
    return startPoint;
  }

  const span = Math.abs(endLog - startLog);
  const direction = Math.sign(endLog - startLog);

  if (span === 0 || direction === 0) {
    return undefined;
  }

  let invalidLog = startLog;
  let validPoint: FiniteOfferedLoadRootPoint | undefined;
  let distance = Math.min(1, span);

  while (distance > 0) {
    const logValue = startLog + direction * distance;
    const point = evaluate(logValue);

    if (point !== undefined) {
      validPoint = point;
      break;
    }

    invalidLog = logValue;

    if (distance >= span) {
      break;
    }

    distance = Math.min(distance * 2, span);
  }

  if (validPoint === undefined) {
    return undefined;
  }

  for (
    let iteration = 0;
    iteration < FINITE_ROOT_LOG_PROBE_REFINEMENTS;
    iteration += 1
  ) {
    if (
      Math.abs(validPoint.logValue - invalidLog) <= FINITE_ROOT_LOG_X_TOLERANCE
    ) {
      break;
    }

    const logValue = (invalidLog + validPoint.logValue) / 2;
    const point = evaluate(logValue);

    if (point === undefined) {
      invalidLog = logValue;
    } else {
      validPoint = point;
    }
  }

  return validPoint;
}

export function findValidFiniteOfferedLoadMidpoint(
  evaluate: (logValue: number) => FiniteOfferedLoadRootPoint | undefined,
  lowLog: number,
  midLog: number,
  highLog: number,
): FiniteOfferedLoadRootPoint | undefined {
  const midpoint = evaluate(midLog);

  if (midpoint !== undefined) {
    return midpoint;
  }

  let bestPoint: FiniteOfferedLoadRootPoint | undefined;

  for (const point of [
    findValidFiniteOfferedLoadRootPoint(evaluate, midLog, lowLog),
    findValidFiniteOfferedLoadRootPoint(evaluate, midLog, highLog),
  ]) {
    if (
      point === undefined ||
      point.logValue <= lowLog ||
      point.logValue >= highLog
    ) {
      continue;
    }

    if (
      bestPoint === undefined ||
      Math.abs(point.logValue - midLog) < Math.abs(bestPoint.logValue - midLog)
    ) {
      bestPoint = point;
    }
  }

  return bestPoint;
}

export function finiteOfferedLoadRootResult(
  point: FiniteOfferedLoadRootPoint,
  iterations: number,
): RootResult {
  const value = Math.exp(point.logValue);

  return isPositiveFinite(value)
    ? { ok: true, value, residual: point.residual, iterations }
    : { ok: false, reason: "no-bracket" };
}

export function calculateFiniteShapeMetricFromLog(
  s: number,
  K: number,
  logOfferedLoad: number,
  target: FiniteInverseShapeTarget,
): number | undefined {
  const offeredLoad = Math.exp(logOfferedLoad);

  return isPositiveFinite(offeredLoad)
    ? calculateFiniteShapeMetric(s, K, offeredLoad, target)
    : undefined;
}

export function calculateFiniteShapeMetric(
  s: number,
  K: number,
  offeredLoad: number,
  target: FiniteInverseShapeTarget,
): number | undefined {
  const result = calculateMmSK({ lambda: offeredLoad, mu: 1, s, K });

  if (result.status !== "ok") {
    return undefined;
  }

  return result.metrics[target];
}

export function validateFiniteInverseShapeTarget(
  target: FiniteInverseShapeTarget,
  value: number,
  s: number,
  K: number,
): SolverIssue | undefined {
  if (target === "Pwait") {
    return value > 0 && value < 1
      ? undefined
      : {
          variable: target,
          code: "open-probability-required",
          message: `${target} must be greater than 0 and less than 1 for this inverse solve.`,
        };
  }

  return validateFiniteShapeTarget(target, value, s, K);
}

export function validateFiniteShapeTarget(
  target: FiniteShapeTarget,
  value: number,
  s: number,
  K: number,
): SolverIssue | undefined {
  if (target === "P0" || target === "Pblock") {
    return value > 0 && value < 1
      ? undefined
      : {
          variable: target,
          code: "open-probability-required",
          message: `${target} must be greater than 0 and less than 1 for this inverse solve.`,
        };
  }

  if (target === "rho") {
    return value > 0 && value < 1
      ? undefined
      : {
          variable: target,
          code: "open-utilization-required",
          message:
            "Finite-capacity utilization must be greater than 0 and less than 1 for this inverse solve.",
        };
  }

  if (target === "L") {
    if (value <= 0) {
      return strictlyPositiveIssueObject(target);
    }

    return value < K
      ? undefined
      : {
          variable: target,
          code: "finite-L-below-capacity",
          message:
            "Average number in system must be less than capacity for a finite offered-load solve.",
        };
  }

  if (value <= 0) {
    return strictlyPositiveIssueObject(target);
  }

  const queueCapacity = K - s;

  if (queueCapacity <= 0) {
    return {
      variable: target,
      code: "finite-no-waiting-capacity",
      message:
        "Lq cannot identify offered load when finite capacity equals the server count.",
    };
  }

  return value < queueCapacity
    ? undefined
    : {
        variable: target,
        code: "finite-Lq-below-queue-capacity",
        message:
          "Average number in queue must be less than waiting capacity for a finite offered-load solve.",
      };
}

export function validateFiniteScaleTarget(
  target: FiniteScaleTarget,
  value: number,
): SolverIssue | undefined {
  return value > 0 ? undefined : strictlyPositiveIssueObject(target);
}
