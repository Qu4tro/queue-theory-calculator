import type { ErlangAParams, SolverResult } from "../types";
import {
  ERLANG_A_RATE_INVERSE_TARGETS,
  type ErlangARateInverseTarget,
} from "./erlang-a-targets";
import { finalizeCandidate } from "./finalize";
import type { NormalizedInput } from "./normalize";
import { nearlyEqual } from "./root";
import {
  addUniquePositiveRoot,
  ambiguousErlangAInverse,
  type CandidateResult,
  calculateErlangATargetMetric,
  clampLogPositive,
  dedupeParams,
  ERLANG_A_ROOT_LOG_RADII,
  ERLANG_A_ROOT_LOG_STEP,
  ERLANG_A_ROOT_LOG_X_TOLERANCE,
  ERLANG_A_ROOT_MAX_ITERATIONS,
  ERLANG_A_THETA_INVERSE_TARGETS,
  type ErlangAThetaInverseTarget,
  erlangACandidate,
  firstPresent,
  has,
  hasSignChange,
  isPositiveFinite,
  isRootResidualClose,
  LOG_MAX_POSITIVE,
  LOG_MIN_POSITIVE,
  noErlangAMatch,
  terminal,
  validateErlangAInverseTarget,
} from "./shared";

export function findErlangACandidate(input: NormalizedInput): CandidateResult {
  const { values } = input;

  if (
    has(values, "lambda") &&
    has(values, "mu") &&
    has(values, "s") &&
    has(values, "theta")
  ) {
    return erlangACandidate("erlang-a-base-params", {
      lambda: values.lambda,
      mu: values.mu,
      s: values.s,
      theta: values.theta,
    });
  }

  const offeredRho = solveErlangAOfferedRhoDirect(input);

  if (offeredRho.kind !== "none") {
    return offeredRho;
  }

  const unknownMu = solveErlangAMuFromKnownLambda(input);

  if (unknownMu.kind !== "none") {
    return unknownMu;
  }

  const unknownLambda = solveErlangALambdaFromKnownMu(input);

  if (unknownLambda.kind !== "none") {
    return unknownLambda;
  }

  const unknownTheta = solveErlangAThetaFromKnownRates(input);

  if (unknownTheta.kind !== "none") {
    return unknownTheta;
  }

  return { kind: "none" };
}

export function solveErlangAOfferedRhoDirect(
  input: NormalizedInput,
): CandidateResult {
  const { values } = input;

  if (
    !has(values, "offeredRho") ||
    !has(values, "s") ||
    !has(values, "theta")
  ) {
    return { kind: "none" };
  }

  if (has(values, "lambda") && !has(values, "mu")) {
    const mu = values.lambda / (values.offeredRho * values.s);

    if (!isPositiveFinite(mu)) {
      return terminal({
        status: "invalid-input",
        issues: [
          {
            variable: "mu",
            code: "mu-not-finite",
            message:
              "Service rate could not be inferred as a finite positive number.",
          },
        ],
      });
    }

    return erlangACandidate("erlang-a-lambda-offeredRho-s-theta", {
      lambda: values.lambda,
      mu,
      s: values.s,
      theta: values.theta,
    });
  }

  if (has(values, "mu") && !has(values, "lambda")) {
    const lambda = values.offeredRho * values.s * values.mu;

    if (!isPositiveFinite(lambda)) {
      return terminal({
        status: "invalid-input",
        issues: [
          {
            variable: "lambda",
            code: "lambda-not-finite",
            message:
              "Arrival rate could not be inferred as a finite positive number.",
          },
        ],
      });
    }

    return erlangACandidate("erlang-a-mu-offeredRho-s-theta", {
      lambda,
      mu: values.mu,
      s: values.s,
      theta: values.theta,
    });
  }

  return { kind: "none" };
}

export function solveErlangAMuFromKnownLambda(
  input: NormalizedInput,
): CandidateResult {
  const { values } = input;

  if (
    has(values, "mu") ||
    !has(values, "lambda") ||
    !has(values, "s") ||
    !has(values, "theta")
  ) {
    return { kind: "none" };
  }

  const target = firstPresent(values, ERLANG_A_RATE_INVERSE_TARGETS);

  if (target === undefined) {
    return { kind: "none" };
  }

  const targetValue = values[target];

  if (targetValue === undefined) {
    return { kind: "none" };
  }

  const targetIssue = validateErlangAInverseTarget(target, targetValue);

  if (targetIssue !== undefined) {
    return terminal({ status: "inconsistent", issues: [targetIssue] });
  }

  return solveErlangAPositiveUnknown(input, target, "mu", {
    centerScale: Math.max(values.lambda / values.s, values.theta, 1),
    paramsFromValue: (mu) => ({
      modelKind: "erlang-a",
      lambda: values.lambda,
      mu,
      s: values.s,
      theta: values.theta,
    }),
  });
}

export function solveErlangALambdaFromKnownMu(
  input: NormalizedInput,
): CandidateResult {
  const { values } = input;

  if (
    has(values, "lambda") ||
    !has(values, "mu") ||
    !has(values, "s") ||
    !has(values, "theta")
  ) {
    return { kind: "none" };
  }

  const target = firstPresent(values, ERLANG_A_RATE_INVERSE_TARGETS);

  if (target === undefined) {
    return { kind: "none" };
  }

  const targetValue = values[target];

  if (targetValue === undefined) {
    return { kind: "none" };
  }

  const targetIssue = validateErlangAInverseTarget(target, targetValue);

  if (targetIssue !== undefined) {
    return terminal({ status: "inconsistent", issues: [targetIssue] });
  }

  return solveErlangAPositiveUnknown(input, target, "lambda", {
    centerScale: Math.max(values.s * values.mu, values.s * values.theta, 1),
    paramsFromValue: (lambda) => ({
      modelKind: "erlang-a",
      lambda,
      mu: values.mu,
      s: values.s,
      theta: values.theta,
    }),
  });
}

export function solveErlangAThetaFromKnownRates(
  input: NormalizedInput,
): CandidateResult {
  const { values } = input;

  if (
    has(values, "theta") ||
    !has(values, "lambda") ||
    !has(values, "mu") ||
    !has(values, "s")
  ) {
    return { kind: "none" };
  }

  const target = firstPresent(values, ERLANG_A_THETA_INVERSE_TARGETS);

  if (target === undefined) {
    return { kind: "none" };
  }

  const targetValue = values[target];

  if (targetValue === undefined) {
    return { kind: "none" };
  }

  const targetIssue = validateErlangAInverseTarget(target, targetValue);

  if (targetIssue !== undefined) {
    return terminal({ status: "inconsistent", issues: [targetIssue] });
  }

  return solveErlangAPositiveUnknown(input, target, "theta", {
    centerScale: Math.max(values.lambda, values.mu, 1),
    paramsFromValue: (theta) => ({
      modelKind: "erlang-a",
      lambda: values.lambda,
      mu: values.mu,
      s: values.s,
      theta,
    }),
  });
}

export function solveErlangAPositiveUnknown(
  input: NormalizedInput,
  target: ErlangARateInverseTarget | ErlangAThetaInverseTarget,
  unknown: "lambda" | "mu" | "theta",
  options: {
    centerScale: number;
    paramsFromValue: (value: number) => ErlangAParams;
  },
): CandidateResult {
  const targetValue = input.values[target];

  if (targetValue === undefined) {
    return { kind: "none" };
  }

  const roots = solvePositiveLogRoots(
    (value) => {
      const params = options.paramsFromValue(value);
      return calculateErlangATargetMetric(params, target);
    },
    targetValue,
    options.centerScale,
  );

  if (roots.length === 0) {
    return terminal(noErlangAMatch(target));
  }

  const paramsList = roots.map(options.paramsFromValue);
  const result = finalizeErlangACandidates(
    paramsList,
    input,
    ambiguousErlangAInverse(unknown, target),
    noErlangAMatch(target),
  );

  return terminal(result);
}

export function solvePositiveLogRoots(
  evaluate: (value: number) => number | undefined,
  target: number,
  centerScale: number,
): number[] {
  if (!Number.isFinite(target)) {
    return [];
  }

  const centerLog = clampLogPositive(Math.log(Math.max(centerScale, 1)));
  const roots: number[] = [];

  for (const radius of ERLANG_A_ROOT_LOG_RADII) {
    const scannedRoots = scanPositiveLogRoots(
      evaluate,
      target,
      centerLog,
      radius,
    );

    for (const root of scannedRoots) {
      addUniquePositiveRoot(roots, root);
    }
  }

  return roots;
}

export function scanPositiveLogRoots(
  evaluate: (value: number) => number | undefined,
  target: number,
  centerLog: number,
  radius: number,
): number[] {
  const low = Math.max(LOG_MIN_POSITIVE, centerLog - radius);
  const high = Math.min(LOG_MAX_POSITIVE, centerLog + radius);
  const steps = Math.max(1, Math.ceil((high - low) / ERLANG_A_ROOT_LOG_STEP));
  const roots: number[] = [];
  let previous: { logValue: number; residual: number } | undefined;

  for (let step = 0; step <= steps; step += 1) {
    const logValue = low + ((high - low) * step) / steps;
    const value = Math.exp(logValue);
    const metric = evaluate(value);

    if (metric === undefined || !Number.isFinite(metric)) {
      previous = undefined;
      continue;
    }

    const residual = metric - target;

    if (isRootResidualClose(residual, target)) {
      addUniquePositiveRoot(roots, value);
    }

    if (previous !== undefined && hasSignChange(previous.residual, residual)) {
      const root = bisectPositiveLogRoot(
        evaluate,
        target,
        previous.logValue,
        logValue,
        previous.residual,
        residual,
      );

      if (root !== undefined) {
        addUniquePositiveRoot(roots, root);
      }
    }

    previous = { logValue, residual };
  }

  return roots;
}

export function bisectPositiveLogRoot(
  evaluate: (value: number) => number | undefined,
  target: number,
  lowLog: number,
  highLog: number,
  lowResidual: number,
  highResidual: number,
): number | undefined {
  let low = lowLog;
  let high = highLog;
  let lowValueResidual = lowResidual;
  let bestLog = Math.abs(lowResidual) <= Math.abs(highResidual) ? low : high;
  let bestResidual =
    Math.abs(lowResidual) <= Math.abs(highResidual)
      ? lowResidual
      : highResidual;

  for (
    let iteration = 1;
    iteration <= ERLANG_A_ROOT_MAX_ITERATIONS;
    iteration += 1
  ) {
    const mid = (low + high) / 2;
    const value = Math.exp(mid);
    const metric = evaluate(value);

    if (metric === undefined || !Number.isFinite(metric)) {
      return undefined;
    }

    const residual = metric - target;

    if (Math.abs(residual) < Math.abs(bestResidual)) {
      bestLog = mid;
      bestResidual = residual;
    }

    if (
      isRootResidualClose(residual, target) ||
      high - low <= ERLANG_A_ROOT_LOG_X_TOLERANCE
    ) {
      return isPositiveFinite(value) ? value : undefined;
    }

    if (hasSignChange(lowValueResidual, residual)) {
      high = mid;
    } else {
      low = mid;
      lowValueResidual = residual;
    }
  }

  if (isRootResidualClose(bestResidual, target)) {
    const value = Math.exp(bestLog);
    return isPositiveFinite(value) ? value : undefined;
  }

  return undefined;
}

export function finalizeErlangACandidates(
  paramsList: readonly ErlangAParams[],
  input: NormalizedInput,
  ambiguityResult: SolverResult,
  noMatchResult: SolverResult,
): SolverResult {
  let solvedMatch: SolverResult | undefined;

  for (const params of dedupeErlangAParams(paramsList)) {
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

export function dedupeErlangAParams(
  paramsList: readonly ErlangAParams[],
): ErlangAParams[] {
  return dedupeParams(
    paramsList,
    (existing, params) =>
      existing.s === params.s &&
      nearlyEqual(existing.lambda, params.lambda) &&
      nearlyEqual(existing.mu, params.mu) &&
      nearlyEqual(existing.theta, params.theta),
  );
}
