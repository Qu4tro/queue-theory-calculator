import { calculateMmS, MAX_SERVERS_FOR_MATH } from "../mm-s";
import type {
  QueueInputMap,
  QueueVariableId,
  SolverIssue,
  SolverResult,
} from "../types";
import { finalizeCandidate, validateSuppliedValues } from "./finalize";
import type { NormalizedInput } from "./normalize";
import { nearlyEqual, solveRhoForMetric } from "./root";
import {
  ambiguousServerCount,
  type CandidateResult,
  calculateTargetMetric,
  candidate,
  DIMENSIONLESS_TARGETS,
  type DimensionlessTarget,
  firstPresent,
  formulaResultToSolverResult,
  has,
  hasAny,
  invalidRhoForInference,
  invalidRhoForInferenceIssue,
  isMm1PathAllowed,
  isPositiveFinite,
  missingScaleAfterUnknownServerCount,
  type NumericTarget,
  noServerCountMatch,
  noStableMatch,
  type ServerCountSearchEvaluation,
  searchBudgetExceeded,
  solveMm1MuFromLambdaAndWq,
  solveRhoFromDimensionlessMetric,
  strictlyPositiveIssue,
  strictlyPositiveIssueObject,
  TIME_TARGETS,
  type TimeTarget,
  terminal,
  UNKNOWN_SERVER_DERIVED_TARGETS,
  UNKNOWN_SERVER_SEARCH_STEP_BUDGET,
  unstableFromRho,
  validateDimensionlessTarget,
  validateKnownLambdaTarget,
  validateKnownMuTarget,
  withInferredValues,
} from "./shared";

export function findMmsCandidate(input: NormalizedInput): CandidateResult {
  const direct = solveDirectPath(input);

  if (direct.kind !== "none") {
    return direct;
  }

  const mm1 = solveMm1ClosedFormPath(input);

  if (mm1.kind !== "none") {
    return mm1;
  }

  const numeric = solveNumericPath(input);

  if (numeric.kind !== "none") {
    return numeric;
  }

  const unknownServerCount = solveUnknownServerCountPath(input);

  if (unknownServerCount.kind !== "none") {
    return unknownServerCount;
  }

  return { kind: "none" };
}

export function solveDirectPath(input: NormalizedInput): CandidateResult {
  const { values } = input;

  if (has(values, "lambda") && has(values, "mu") && has(values, "s")) {
    return candidate("base-params", {
      lambda: values.lambda,
      mu: values.mu,
      s: values.s,
    });
  }

  if (has(values, "lambda") && has(values, "rho") && has(values, "s")) {
    if (values.rho <= 0) {
      return terminal(invalidRhoForInference());
    }

    const mu = values.lambda / (values.s * values.rho);

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

    return candidate("lambda-rho-s", {
      lambda: values.lambda,
      mu,
      s: values.s,
    });
  }

  if (has(values, "mu") && has(values, "rho") && has(values, "s")) {
    if (values.rho <= 0) {
      return terminal(invalidRhoForInference());
    }

    const lambda = values.rho * values.s * values.mu;

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

    return candidate("mu-rho-s", {
      lambda,
      mu: values.mu,
      s: values.s,
    });
  }

  return { kind: "none" };
}

export function solveMm1ClosedFormPath(
  input: NormalizedInput,
): CandidateResult {
  const { values } = input;

  if (!isMm1PathAllowed(input)) {
    return { kind: "none" };
  }

  if (has(values, "lambda") && has(values, "W")) {
    if (values.W <= 0) {
      return terminal(strictlyPositiveIssue("W"));
    }

    return candidate("mm1-lambda-W", {
      lambda: values.lambda,
      mu: values.lambda + 1 / values.W,
      s: 1,
    });
  }

  if (has(values, "lambda") && has(values, "L")) {
    if (values.L <= 0) {
      return terminal(strictlyPositiveIssue("L"));
    }

    const W = values.L / values.lambda;

    return candidate("mm1-lambda-L", {
      lambda: values.lambda,
      mu: values.lambda + 1 / W,
      s: 1,
    });
  }

  if (has(values, "lambda") && has(values, "Wq")) {
    if (values.Wq <= 0) {
      return terminal(strictlyPositiveIssue("Wq"));
    }

    return candidate("mm1-lambda-Wq", {
      lambda: values.lambda,
      mu: solveMm1MuFromLambdaAndWq(values.lambda, values.Wq),
      s: 1,
    });
  }

  if (has(values, "lambda") && has(values, "Lq")) {
    if (values.Lq <= 0) {
      return terminal(strictlyPositiveIssue("Lq"));
    }

    const Wq = values.Lq / values.lambda;

    return candidate("mm1-lambda-Lq", {
      lambda: values.lambda,
      mu: solveMm1MuFromLambdaAndWq(values.lambda, Wq),
      s: 1,
    });
  }

  if (has(values, "mu") && has(values, "W")) {
    if (values.W <= 1 / values.mu) {
      return terminal({
        status: "inconsistent",
        issues: [
          {
            variable: "W",
            code: "mm1-W-too-small",
            message:
              "Time in system must be greater than one service time for a positive arrival rate.",
          },
        ],
      });
    }

    return candidate("mm1-mu-W", {
      lambda: values.mu - 1 / values.W,
      mu: values.mu,
      s: 1,
    });
  }

  if (has(values, "mu") && has(values, "L")) {
    if (values.L <= 0) {
      return terminal(strictlyPositiveIssue("L"));
    }

    return candidate("mm1-mu-L", {
      lambda: (values.L * values.mu) / (1 + values.L),
      mu: values.mu,
      s: 1,
    });
  }

  if (has(values, "mu") && has(values, "Wq")) {
    if (values.Wq <= 0) {
      return terminal(strictlyPositiveIssue("Wq"));
    }

    return candidate("mm1-mu-Wq", {
      lambda: (values.Wq * values.mu * values.mu) / (values.Wq * values.mu + 1),
      mu: values.mu,
      s: 1,
    });
  }

  if (has(values, "mu") && has(values, "Lq")) {
    if (values.Lq <= 0) {
      return terminal(strictlyPositiveIssue("Lq"));
    }

    const rho =
      (-values.Lq + Math.sqrt(values.Lq * values.Lq + 4 * values.Lq)) / 2;

    return candidate("mm1-mu-Lq", {
      lambda: rho * values.mu,
      mu: values.mu,
      s: 1,
    });
  }

  if (has(values, "rho") && has(values, "W")) {
    if (values.rho <= 0) {
      return terminal(invalidRhoForInference());
    }

    if (values.rho >= 1) {
      return terminal(unstableFromRho(input));
    }

    if (values.W <= 0) {
      return terminal(strictlyPositiveIssue("W"));
    }

    const mu = 1 / (values.W * (1 - values.rho));

    return candidate("mm1-rho-W", {
      lambda: values.rho * mu,
      mu,
      s: 1,
    });
  }

  if (has(values, "rho") && has(values, "Wq")) {
    if (values.rho <= 0) {
      return terminal(invalidRhoForInference());
    }

    if (values.rho >= 1) {
      return terminal(unstableFromRho(input));
    }

    if (values.Wq <= 0) {
      return terminal(strictlyPositiveIssue("Wq"));
    }

    const mu = values.rho / (values.Wq * (1 - values.rho));

    return candidate("mm1-rho-Wq", {
      lambda: values.rho * mu,
      mu,
      s: 1,
    });
  }

  if (has(values, "L") && has(values, "W")) {
    if (values.L <= 0) {
      return terminal(strictlyPositiveIssue("L"));
    }

    if (values.W <= 0) {
      return terminal(strictlyPositiveIssue("W"));
    }

    const lambda = values.L / values.W;

    return candidate("mm1-L-W", {
      lambda,
      mu: lambda + 1 / values.W,
      s: 1,
    });
  }

  if (has(values, "W") && has(values, "Wq")) {
    if (values.Wq <= 0) {
      return terminal(strictlyPositiveIssue("Wq"));
    }

    if (values.W <= values.Wq) {
      return terminal({
        status: "inconsistent",
        issues: [
          {
            variable: "W",
            code: "W-must-exceed-Wq",
            message: "Time in system must be greater than time in queue.",
          },
        ],
      });
    }

    const mu = 1 / (values.W - values.Wq);
    const rho = values.Wq / values.W;

    return candidate("mm1-W-Wq", {
      lambda: rho * mu,
      mu,
      s: 1,
    });
  }

  if (has(values, "Lq") && has(values, "Wq")) {
    if (values.Lq <= 0) {
      return terminal(strictlyPositiveIssue("Lq"));
    }

    if (values.Wq <= 0) {
      return terminal(strictlyPositiveIssue("Wq"));
    }

    const lambda = values.Lq / values.Wq;

    return candidate("mm1-Lq-Wq", {
      lambda,
      mu: solveMm1MuFromLambdaAndWq(lambda, values.Wq),
      s: 1,
    });
  }

  return { kind: "none" };
}

export function solveNumericPath(input: NormalizedInput): CandidateResult {
  const { values } = input;

  if (!has(values, "s")) {
    return { kind: "none" };
  }

  if (has(values, "lambda") && !has(values, "mu")) {
    const target = firstPresent(values, ["L", "Lq", "Wq", "P0", "Pwait", "W"]);

    if (target !== undefined) {
      return solveMuFromKnownLambda(input, target);
    }
  }

  if (has(values, "mu") && !has(values, "lambda")) {
    const target = firstPresent(values, ["L", "Lq", "W", "Wq", "P0", "Pwait"]);

    if (target !== undefined) {
      return solveLambdaFromKnownMu(input, target);
    }
  }

  if (has(values, "rho") && !has(values, "lambda") && !has(values, "mu")) {
    if (has(values, "W")) {
      return solveRatesFromRhoAndTime(input, "W");
    }

    if (has(values, "Wq")) {
      return solveRatesFromRhoAndTime(input, "Wq");
    }
  }

  const derivedScale = solveRatesFromDerivedScaleInputs(input);

  if (derivedScale.kind !== "none") {
    return derivedScale;
  }

  return { kind: "none" };
}

export function solveUnknownServerCountPath(
  input: NormalizedInput,
): CandidateResult {
  const { values } = input;

  if (
    input.modelKind !== "mms" ||
    has(values, "s") ||
    !hasAny(values, ["lambda", "mu", "rho"]) ||
    !hasAny(values, UNKNOWN_SERVER_DERIVED_TARGETS)
  ) {
    return { kind: "none" };
  }

  const inputIssue = validateUnknownServerSearchInputs(input);

  if (inputIssue !== undefined) {
    return terminal(inputIssue);
  }

  const rangeIssue = validateKnownRatesServerSearchRange(input);

  if (rangeIssue !== undefined) {
    return terminal(rangeIssue);
  }

  const firstServerCount = firstUnknownServerCountToSearch(input);

  if (firstServerCount > MAX_SERVERS_FOR_MATH) {
    return terminal(noServerCountMatch());
  }

  let solvedMatch: SolverResult | undefined;
  let scaleOnlyServerCount: number | undefined;
  let stoppedByBound = false;
  const searchLimit = Math.min(
    MAX_SERVERS_FOR_MATH,
    firstServerCount + UNKNOWN_SERVER_SEARCH_STEP_BUDGET - 1,
  );

  for (let s = firstServerCount; s <= searchLimit; s += 1) {
    const evaluation = evaluateUnknownServerCount(input, s);

    if (evaluation.kind === "candidate") {
      const result = finalizeCandidate(evaluation.params, input);

      if (result.status === "solved") {
        if (solvedMatch !== undefined) {
          return terminal(ambiguousServerCount());
        }

        solvedMatch = result;
      }

      if (shouldStopKnownRatesServerSearch(input, s)) {
        stoppedByBound = true;
        break;
      }

      if (shouldStopKnownRhoServerSearch(input, s)) {
        stoppedByBound = true;
        break;
      }

      continue;
    }

    if (evaluation.kind === "scale-only") {
      if (scaleOnlyServerCount !== undefined) {
        return terminal(ambiguousServerCount());
      }

      scaleOnlyServerCount = evaluation.serverCount;

      if (shouldStopKnownRhoServerSearch(input, s)) {
        stoppedByBound = true;
        break;
      }

      continue;
    }

    if (evaluation.kind === "terminal") {
      if (evaluation.result.status === "solved") {
        if (solvedMatch !== undefined) {
          return terminal(ambiguousServerCount());
        }

        solvedMatch = evaluation.result;
      }

      if (shouldStopKnownRatesServerSearch(input, s)) {
        stoppedByBound = true;
        break;
      }

      if (shouldStopKnownRhoServerSearch(input, s)) {
        stoppedByBound = true;
        break;
      }
    }

    if (shouldStopKnownRhoServerSearch(input, s)) {
      stoppedByBound = true;
      break;
    }
  }

  if (!stoppedByBound && searchLimit < MAX_SERVERS_FOR_MATH) {
    return terminal(
      searchBudgetExceeded("s", UNKNOWN_SERVER_SEARCH_STEP_BUDGET),
    );
  }

  if (solvedMatch !== undefined) {
    return terminal(solvedMatch);
  }

  if (scaleOnlyServerCount !== undefined) {
    return terminal(missingScaleAfterUnknownServerCount(scaleOnlyServerCount));
  }

  return terminal(noServerCountMatch());
}

export function firstUnknownServerCountToSearch(
  input: NormalizedInput,
): number {
  const { values } = input;

  if (!has(values, "lambda") || !has(values, "mu")) {
    return 1;
  }

  const offeredLoad = values.lambda / values.mu;

  if (!Number.isFinite(offeredLoad)) {
    return MAX_SERVERS_FOR_MATH + 1;
  }

  return Math.max(1, Math.floor(offeredLoad) + 1);
}

export function validateUnknownServerSearchInputs(
  input: NormalizedInput,
): SolverResult | undefined {
  const { values } = input;

  if (has(values, "rho")) {
    if (values.rho <= 0) {
      return invalidRhoForInference();
    }

    if (values.rho >= 1) {
      return unstableFromRho(input);
    }
  }

  for (const target of UNKNOWN_SERVER_DERIVED_TARGETS) {
    if (!has(values, target)) {
      continue;
    }

    const targetIssue = validateUnknownServerTarget(target, values[target]);

    if (targetIssue !== undefined) {
      return { status: "inconsistent", issues: [targetIssue] };
    }
  }

  if (has(values, "L") && has(values, "Lq") && values.L <= values.Lq) {
    return {
      status: "inconsistent",
      issues: [
        {
          variable: "L",
          code: "L-must-exceed-Lq",
          message:
            "Average number in system must be greater than average number in queue.",
        },
      ],
    };
  }

  if (has(values, "W") && has(values, "Wq") && values.W <= values.Wq) {
    return {
      status: "inconsistent",
      issues: [
        {
          variable: "W",
          code: "W-must-exceed-Wq",
          message: "Time in system must be greater than time in queue.",
        },
      ],
    };
  }

  if (has(values, "mu") && has(values, "W") && values.W <= 1 / values.mu) {
    return {
      status: "inconsistent",
      issues: [
        {
          variable: "W",
          code: "W-too-small",
          message:
            "Time in system must be greater than one service time for a positive arrival rate.",
        },
      ],
    };
  }

  return undefined;
}

export function validateKnownRatesServerSearchRange(
  input: NormalizedInput,
): SolverResult | undefined {
  const { values } = input;

  if (!has(values, "lambda") || !has(values, "mu")) {
    return undefined;
  }

  const target = firstPresent(values, UNKNOWN_SERVER_DERIVED_TARGETS);

  if (target === undefined) {
    return undefined;
  }

  const targetValue = values[target];

  if (targetValue === undefined) {
    return undefined;
  }

  const offeredLoad = values.lambda / values.mu;

  if (!Number.isFinite(offeredLoad)) {
    return noServerCountMatch();
  }

  if (
    ((target === "L" && targetValue <= offeredLoad) ||
      (target === "W" && targetValue <= 1 / values.mu) ||
      (target === "P0" && targetValue >= Math.exp(-offeredLoad))) &&
    !isKnownRatesTargetAtSearchBoundary(input, target)
  ) {
    return noServerCountMatch();
  }

  return undefined;
}

export function shouldStopKnownRatesServerSearch(
  input: NormalizedInput,
  serverCount: number,
): boolean {
  const { values } = input;

  if (!has(values, "lambda") || !has(values, "mu")) {
    return false;
  }

  const target = firstPresent(values, UNKNOWN_SERVER_DERIVED_TARGETS);

  if (target === undefined) {
    return false;
  }

  const result = calculateMmS({
    lambda: values.lambda,
    mu: values.mu,
    s: serverCount,
  });

  if (result.status !== "ok") {
    return false;
  }

  const actual = result.metrics[target];
  const expected = values[target];

  if (expected === undefined) {
    return false;
  }

  if (nearlyEqual(actual, expected)) {
    return false;
  }

  return target === "P0" ? actual > expected : actual < expected;
}

export function shouldStopKnownRhoServerSearch(
  input: NormalizedInput,
  serverCount: number,
): boolean {
  const { values } = input;

  if (has(values, "lambda") || has(values, "mu") || !has(values, "rho")) {
    return false;
  }

  const target = firstPresent(values, DIMENSIONLESS_TARGETS);

  if (target === undefined) {
    return false;
  }

  const expected = values[target];

  if (expected === undefined) {
    return false;
  }

  const result = calculateMmS({
    lambda: values.rho * serverCount,
    mu: 1,
    s: serverCount,
  });

  if (result.status !== "ok") {
    return false;
  }

  const actual = result.metrics[target];

  if (nearlyEqual(actual, expected)) {
    return false;
  }

  return target === "L" ? actual > expected : actual < expected;
}

export function isKnownRatesTargetAtSearchBoundary(
  input: NormalizedInput,
  target: NumericTarget,
): boolean {
  const { values } = input;

  if (!has(values, "lambda") || !has(values, "mu")) {
    return false;
  }

  const firstServerCount = firstUnknownServerCountToSearch(input);

  if (firstServerCount > MAX_SERVERS_FOR_MATH) {
    return false;
  }

  const result = calculateMmS({
    lambda: values.lambda,
    mu: values.mu,
    s: firstServerCount,
  });
  const expected = values[target];

  if (expected === undefined) {
    return false;
  }

  return (
    result.status === "ok" && nearlyEqual(result.metrics[target], expected)
  );
}

export function evaluateUnknownServerCount(
  input: NormalizedInput,
  serverCount: number,
): ServerCountSearchEvaluation {
  const seededInput = withInferredValues(input, { s: serverCount });
  const inferredInput = inferUniversalMetricValues(seededInput);

  if (inferredInput.kind === "terminal") {
    return inferredInput;
  }

  const candidateInput = inferredInput.input;
  const direct = solveDirectPath(candidateInput);

  if (direct.kind !== "none") {
    return direct;
  }

  const numeric = solveNumericPathForUnknownServerCount(candidateInput);

  if (numeric.kind !== "none") {
    return numeric;
  }

  const dimensionlessResult =
    validateDimensionlessRedundantInputs(candidateInput);

  if (dimensionlessResult === undefined) {
    return { kind: "none" };
  }

  return dimensionlessResult.status === "need-more-inputs"
    ? { kind: "scale-only", serverCount }
    : { kind: "none" };
}

export function inferUniversalMetricValues(
  input: NormalizedInput,
):
  | { kind: "input"; input: NormalizedInput }
  | { kind: "terminal"; result: SolverResult } {
  const { values } = input;
  const inferred: QueueInputMap = {};
  const offeredLoad =
    has(values, "L") && has(values, "Lq") ? values.L - values.Lq : undefined;
  const serviceTime =
    has(values, "W") && has(values, "Wq") ? values.W - values.Wq : undefined;

  if (!has(values, "lambda")) {
    if (has(values, "L") && has(values, "W")) {
      inferred.lambda = values.L / values.W;
    } else if (has(values, "Lq") && has(values, "Wq")) {
      inferred.lambda = values.Lq / values.Wq;
    } else if (offeredLoad !== undefined && has(values, "mu")) {
      inferred.lambda = offeredLoad * values.mu;
    }
  }

  if (!has(values, "mu")) {
    const lambda = has(values, "lambda") ? values.lambda : inferred.lambda;

    if (serviceTime !== undefined) {
      inferred.mu = 1 / serviceTime;
    } else if (offeredLoad !== undefined && lambda !== undefined) {
      inferred.mu = lambda / offeredLoad;
    }
  }

  if (!has(values, "lambda") && inferred.lambda === undefined) {
    const mu = has(values, "mu") ? values.mu : inferred.mu;

    if (offeredLoad !== undefined && mu !== undefined) {
      inferred.lambda = offeredLoad * mu;
    } else if (has(values, "rho") && has(values, "s") && mu !== undefined) {
      inferred.lambda = values.rho * values.s * mu;
    }
  }

  if (!has(values, "mu") && inferred.mu === undefined) {
    const lambda = has(values, "lambda") ? values.lambda : inferred.lambda;

    if (has(values, "rho") && has(values, "s") && lambda !== undefined) {
      inferred.mu = lambda / (values.s * values.rho);
    }
  }

  const inferredEntries = Object.entries(inferred) as [
    QueueVariableId,
    number,
  ][];

  if (inferredEntries.length === 0) {
    return { kind: "input", input };
  }

  const invalidEntry = inferredEntries.find(
    ([, value]) => !isPositiveFinite(value),
  );

  if (invalidEntry !== undefined) {
    return {
      kind: "terminal",
      result: {
        status: "invalid-input",
        issues: [
          {
            variable: invalidEntry[0],
            code: `${invalidEntry[0]}-not-finite`,
            message:
              "Base queue parameters could not be inferred as finite positive values.",
          },
        ],
      },
    };
  }

  return { kind: "input", input: withInferredValues(input, inferred) };
}

export function solveNumericPathForUnknownServerCount(
  input: NormalizedInput,
): CandidateResult {
  const { values } = input;

  if (!has(values, "s")) {
    return { kind: "none" };
  }

  if (has(values, "lambda") && !has(values, "mu")) {
    const target = firstPresent(values, UNKNOWN_SERVER_DERIVED_TARGETS);

    if (target !== undefined) {
      return solveMuFromKnownLambdaForServerSearch(input, target);
    }
  }

  if (has(values, "mu") && !has(values, "lambda")) {
    const target = firstPresent(values, UNKNOWN_SERVER_DERIVED_TARGETS);

    if (target !== undefined) {
      return solveLambdaFromKnownMu(input, target);
    }
  }

  if (has(values, "rho") && !has(values, "lambda") && !has(values, "mu")) {
    if (has(values, "W")) {
      return solveRatesFromRhoAndTime(input, "W");
    }

    if (has(values, "Wq")) {
      return solveRatesFromRhoAndTime(input, "Wq");
    }
  }

  return { kind: "none" };
}

export function solveMuFromKnownLambdaForServerSearch(
  input: NormalizedInput,
  target: NumericTarget,
): CandidateResult {
  const { values } = input;

  if (!has(values, "lambda") || !has(values, "s") || !has(values, target)) {
    return { kind: "none" };
  }

  const targetIssue = validateUnknownServerTarget(target, values[target]);

  if (targetIssue !== undefined) {
    return terminal({ status: "inconsistent", issues: [targetIssue] });
  }

  const root = solveRhoForMetric((rho) => {
    const mu = values.lambda / (values.s * rho);

    if (!isPositiveFinite(mu)) {
      return undefined;
    }

    return calculateTargetMetric(
      { lambda: values.lambda, mu, s: values.s },
      target,
    );
  }, values[target]);

  if (!root.ok) {
    return terminal(noStableMatch(target));
  }

  const mu = values.lambda / (values.s * root.value);

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

  return candidate(`unknown-s-lambda-${target}`, {
    lambda: values.lambda,
    mu,
    s: values.s,
  });
}

export function validateUnknownServerTarget(
  target: NumericTarget,
  value: number,
): SolverIssue | undefined {
  if (target === "P0" || target === "Pwait") {
    return value > 0 && value < 1
      ? undefined
      : {
          variable: target,
          code: "open-probability-required",
          message: `${target} must be greater than 0 and less than 1 for this inverse solve.`,
        };
  }

  return value > 0 ? undefined : strictlyPositiveIssueObject(target);
}

export function solveMuFromKnownLambda(
  input: NormalizedInput,
  target: NumericTarget,
): CandidateResult {
  const { values } = input;

  if (!has(values, "lambda") || !has(values, "s") || !has(values, target)) {
    return { kind: "none" };
  }

  const targetIssue = validateKnownLambdaTarget(target, values[target]);

  if (targetIssue !== undefined) {
    return terminal({ status: "inconsistent", issues: [targetIssue] });
  }

  const root = solveRhoForMetric((rho) => {
    const mu = values.lambda / (values.s * rho);

    if (!isPositiveFinite(mu)) {
      return undefined;
    }

    return calculateTargetMetric(
      { lambda: values.lambda, mu, s: values.s },
      target,
    );
  }, values[target]);

  if (!root.ok) {
    return terminal(noStableMatch(target));
  }

  const mu = values.lambda / (values.s * root.value);

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

  return candidate(`numeric-lambda-${target}`, {
    lambda: values.lambda,
    mu,
    s: values.s,
  });
}

export function solveLambdaFromKnownMu(
  input: NormalizedInput,
  target: NumericTarget,
): CandidateResult {
  const { values } = input;

  if (!has(values, "mu") || !has(values, "s") || !has(values, target)) {
    return { kind: "none" };
  }

  const targetIssue = validateKnownMuTarget(target, values[target], values.mu);

  if (targetIssue !== undefined) {
    return terminal({ status: "inconsistent", issues: [targetIssue] });
  }

  const root = solveRhoForMetric((rho) => {
    const lambda = rho * values.s * values.mu;

    if (!isPositiveFinite(lambda)) {
      return undefined;
    }

    return calculateTargetMetric(
      { lambda, mu: values.mu, s: values.s },
      target,
    );
  }, values[target]);

  if (!root.ok) {
    return terminal(noStableMatch(target));
  }

  const lambda = root.value * values.s * values.mu;

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

  return candidate(`numeric-mu-${target}`, {
    lambda,
    mu: values.mu,
    s: values.s,
  });
}

export function solveRatesFromRhoAndTime(
  input: NormalizedInput,
  target: TimeTarget,
): CandidateResult {
  const { values } = input;

  if (!has(values, "rho") || !has(values, "s") || !has(values, target)) {
    return { kind: "none" };
  }

  if (values.rho <= 0) {
    return terminal(invalidRhoForInference());
  }

  if (values.rho >= 1) {
    return terminal(unstableFromRho(input));
  }

  return solveRatesFromRhoAndTimeScale(
    input,
    values.rho,
    target,
    `rho-${target}`,
  );
}

export function solveRatesFromDerivedScaleInputs(
  input: NormalizedInput,
): CandidateResult {
  const { values } = input;

  if (
    !has(values, "s") ||
    has(values, "lambda") ||
    has(values, "mu") ||
    has(values, "rho")
  ) {
    return { kind: "none" };
  }

  const timeTarget = firstPresent(values, TIME_TARGETS);

  if (timeTarget === undefined) {
    return { kind: "none" };
  }

  const dimensionlessTarget = firstPresent(values, DIMENSIONLESS_TARGETS);

  if (dimensionlessTarget !== undefined) {
    return solveRatesFromDimensionlessAndTime(
      input,
      dimensionlessTarget,
      timeTarget,
    );
  }

  if (has(values, "W") && has(values, "Wq")) {
    return solveRatesFromSystemAndQueueTimes(input);
  }

  return { kind: "none" };
}

export function solveRatesFromDimensionlessAndTime(
  input: NormalizedInput,
  dimensionlessTarget: DimensionlessTarget,
  timeTarget: TimeTarget,
): CandidateResult {
  const { values } = input;

  if (!has(values, "s") || !has(values, dimensionlessTarget)) {
    return { kind: "none" };
  }

  const targetIssue = validateDimensionlessTarget(
    dimensionlessTarget,
    values[dimensionlessTarget],
  );

  if (targetIssue !== undefined) {
    return terminal({ status: "inconsistent", issues: [targetIssue] });
  }

  const root = solveRhoFromDimensionlessMetric(input, dimensionlessTarget);

  if (!root.ok) {
    return terminal(noStableMatch(dimensionlessTarget));
  }

  return solveRatesFromRhoAndTimeScale(
    input,
    root.value,
    timeTarget,
    `dimensionless-${dimensionlessTarget}-${timeTarget}`,
  );
}

export function solveRatesFromSystemAndQueueTimes(
  input: NormalizedInput,
): CandidateResult {
  const { values } = input;

  if (!has(values, "s") || !has(values, "W") || !has(values, "Wq")) {
    return { kind: "none" };
  }

  if (values.Wq <= 0) {
    return terminal(strictlyPositiveIssue("Wq"));
  }

  if (values.W <= values.Wq) {
    return terminal({
      status: "inconsistent",
      issues: [
        {
          variable: "W",
          code: "W-must-exceed-Wq",
          message: "Time in system must be greater than time in queue.",
        },
      ],
    });
  }

  const mu = 1 / (values.W - values.Wq);

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

  return solveLambdaFromKnownMu(withInferredValues(input, { mu }), "Wq");
}

export function solveRatesFromRhoAndTimeScale(
  input: NormalizedInput,
  rho: number,
  target: TimeTarget,
  pathId: string,
): CandidateResult {
  const { values } = input;

  if (!has(values, "s") || !has(values, target)) {
    return { kind: "none" };
  }

  if (values[target] <= 0) {
    return terminal(strictlyPositiveIssue(target));
  }

  const reference = calculateMmS({
    lambda: rho * values.s,
    mu: 1,
    s: values.s,
  });

  if (reference.status !== "ok") {
    return terminal(
      formulaResultToSolverResult(reference, {
        lambda: rho * values.s,
        mu: 1,
        s: values.s,
      }),
    );
  }

  const referenceTime = reference.metrics[target];

  if (!isPositiveFinite(referenceTime)) {
    return terminal(noStableMatch(target));
  }

  const mu = referenceTime / values[target];
  const lambda = rho * values.s * mu;

  if (!isPositiveFinite(mu) || !isPositiveFinite(lambda)) {
    return terminal({
      status: "invalid-input",
      issues: [
        {
          code: "rate-not-finite",
          message:
            "Rates could not be inferred as finite positive numbers from the supplied time scale.",
        },
      ],
    });
  }

  return candidate(pathId, { lambda, mu, s: values.s });
}

export function validateDimensionlessRedundantInputs(
  input: NormalizedInput,
): SolverResult | undefined {
  if (
    input.modelKind === "mmsk" ||
    input.modelKind === "mg1" ||
    input.modelKind === "md1" ||
    input.modelKind === "ggs" ||
    input.modelKind === "erlang-a"
  ) {
    return undefined;
  }

  const { values } = input;

  if (
    !has(values, "s") ||
    has(values, "lambda") ||
    has(values, "mu") ||
    has(values, "W") ||
    has(values, "Wq")
  ) {
    return undefined;
  }

  const dimensionlessTarget = firstPresent(values, DIMENSIONLESS_TARGETS);

  if (!has(values, "rho") && dimensionlessTarget === undefined) {
    return undefined;
  }

  const rhoResult = has(values, "rho")
    ? validateKnownRhoForDimensionlessInputs(input)
    : inferRhoForDimensionlessInputs(input, dimensionlessTarget);

  if (rhoResult.status !== "ok") {
    return rhoResult.result;
  }

  const params = { lambda: rhoResult.rho * values.s, mu: 1, s: values.s };
  const result = calculateMmS(params);

  if (result.status !== "ok") {
    return formulaResultToSolverResult(result, params);
  }

  const issues = validateSuppliedValues(input, result.metrics, {
    includeScaleMetrics: false,
  });

  if (issues.length > 0) {
    return {
      status: "inconsistent",
      issues,
      candidate: result.metrics,
      params,
    };
  }

  return {
    status: "need-more-inputs",
    issues: [
      {
        code: "missing-scale",
        message:
          "These dimensionless constraints match, but an arrival rate, service rate, W, or Wq is needed to set the time scale.",
      },
    ],
  };
}

export function validateKnownRhoForDimensionlessInputs(
  input: NormalizedInput,
):
  | { status: "ok"; rho: number }
  | { status: "terminal"; result: SolverResult } {
  const { values } = input;

  if (!has(values, "rho")) {
    return {
      status: "terminal",
      result: {
        status: "invalid-input",
        issues: [invalidRhoForInferenceIssue()],
      },
    };
  }

  if (values.rho <= 0) {
    return {
      status: "terminal",
      result: {
        status: "invalid-input",
        issues: [invalidRhoForInferenceIssue()],
      },
    };
  }

  if (values.rho >= 1) {
    return { status: "terminal", result: unstableFromRho(input) };
  }

  return { status: "ok", rho: values.rho };
}

export function inferRhoForDimensionlessInputs(
  input: NormalizedInput,
  target: DimensionlessTarget | undefined,
):
  | { status: "ok"; rho: number }
  | { status: "terminal"; result: SolverResult } {
  if (target === undefined || !has(input.values, target)) {
    return {
      status: "terminal",
      result: {
        status: "need-more-inputs",
        issues: [
          {
            code: "missing-utilization-shape",
            message:
              "Add utilization or a scale-free metric such as L, Lq, P0, or Pwait.",
          },
        ],
      },
    };
  }

  const targetIssue = validateDimensionlessTarget(target, input.values[target]);

  if (targetIssue !== undefined) {
    return {
      status: "terminal",
      result: { status: "inconsistent", issues: [targetIssue] },
    };
  }

  const root = solveRhoFromDimensionlessMetric(input, target);

  if (!root.ok) {
    return {
      status: "terminal",
      result: noStableMatch(target),
    };
  }

  return { status: "ok", rho: root.value };
}
