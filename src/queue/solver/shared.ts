import { calculateErlangA, MAX_STATES_FOR_MATH } from "../erlang-a";
import { calculateGgS } from "../gg-s";
import { calculateMg1 } from "../mg-1";
import type { calculateMmInfinity } from "../mm-infinity";
import { calculateMmS, MAX_SERVERS_FOR_MATH } from "../mm-s";
import { type calculateMmSK, MAX_CAPACITY_FOR_MATH } from "../mm-s-k";
import type {
  BaseQueueParams,
  ErlangAParams,
  FiniteQueueParams,
  GgSParams,
  Mg1Params,
  MmInfinityParams,
  QueueInputMap,
  QueueMetrics,
  QueueModelKind,
  QueueParams,
  QueueVariableId,
  SolverIssue,
  SolverResult,
  ValidationError,
} from "../types";
import type { ErlangARateInverseTarget } from "./erlang-a-targets";
import type { NormalizedInput } from "./normalize";
import { nearlyEqual, type RootResult, solveRhoForMetric } from "./root";

export type CandidateResult =
  | { kind: "candidate"; params: QueueParams; pathId: string }
  | { kind: "terminal"; result: SolverResult }
  | { kind: "none" };

export type NumericTarget = "L" | "Lq" | "W" | "Wq" | "P0" | "Pwait";
export type DimensionlessTarget = "L" | "Lq" | "P0" | "Pwait";
export type TimeTarget = "W" | "Wq";
export type GeneralServiceMetricTarget = "L" | "Lq" | "W" | "Wq";
export type GgSKnownLambdaMeanTarget = Exclude<GeneralServiceMetricTarget, "W">;
export type ErlangAThetaInverseTarget =
  | "Lq"
  | "Wq"
  | "Pabandon"
  | "abandonRate";
export type FiniteShapeTarget = "L" | "Lq" | "rho" | "P0" | "Pblock";
export type FiniteInverseShapeTarget = FiniteShapeTarget | "Pwait";
export type FiniteScaleTarget = "lambdaEffective" | "W" | "Wq";
export type ServerCountSearchEvaluation =
  | CandidateResult
  | { kind: "scale-only"; serverCount: number };
export type FiniteCandidateParamsResult =
  | {
      kind: "params";
      params: FiniteQueueParams[];
      pathId: string;
      target?: FiniteInverseShapeTarget;
    }
  | { kind: "terminal"; result: SolverResult }
  | { kind: "none" };
export type FiniteOfferedLoadRootPoint = {
  logValue: number;
  residual: number;
};

export const DIMENSIONLESS_TARGETS = [
  "L",
  "Lq",
  "P0",
  "Pwait",
] as const satisfies readonly DimensionlessTarget[];
export const TIME_TARGETS = [
  "W",
  "Wq",
] as const satisfies readonly TimeTarget[];
export const GENERAL_SERVICE_METRIC_TARGETS = [
  "L",
  "Lq",
  "W",
  "Wq",
] as const satisfies readonly GeneralServiceMetricTarget[];
export const GGS_KNOWN_LAMBDA_MEAN_TARGETS = [
  "L",
  "Lq",
  "Wq",
] as const satisfies readonly GgSKnownLambdaMeanTarget[];
export const UNKNOWN_SERVER_DERIVED_TARGETS = [
  "L",
  "Lq",
  "W",
  "Wq",
  "P0",
  "Pwait",
] as const satisfies readonly NumericTarget[];
export const GGS_UNSUPPORTED_PROBABILITY_VARIABLES = [
  "P0",
  "Pwait",
] as const satisfies readonly QueueVariableId[];
export const ERLANG_A_THETA_INVERSE_TARGETS = [
  "Lq",
  "Wq",
  "Pabandon",
  "abandonRate",
] as const satisfies readonly ErlangAThetaInverseTarget[];
export const FINITE_SHAPE_TARGETS = [
  "L",
  "Lq",
  "rho",
  "P0",
  "Pblock",
] as const satisfies readonly FiniteShapeTarget[];
export const FINITE_SCALE_TARGETS = [
  "lambdaEffective",
  "W",
  "Wq",
] as const satisfies readonly FiniteScaleTarget[];
export const FINITE_MISSING_SCALE_SHAPE_TARGETS = [
  ...FINITE_SHAPE_TARGETS,
  "Pwait",
] as const satisfies readonly FiniteInverseShapeTarget[];
export const FINITE_DERIVED_TARGETS = [
  "lambdaEffective",
  "L",
  "Lq",
  "W",
  "Wq",
  "rho",
  "P0",
  "Pwait",
  "Pblock",
] as const satisfies readonly QueueVariableId[];
export const FINITE_ROOT_MAX_ITERATIONS = 240;
export const FINITE_ROOT_LOG_X_TOLERANCE = 1e-11;
export const FINITE_ROOT_LOG_PROBE_REFINEMENTS = 80;
export const UNKNOWN_SERVER_SEARCH_STEP_BUDGET = 1_000;
export const FINITE_INVERSE_SEARCH_STEP_BUDGET = 600;
export const ERLANG_A_ROOT_MAX_ITERATIONS = 220;
export const ERLANG_A_ROOT_LOG_X_TOLERANCE = 1e-10;
export const ERLANG_A_ROOT_LOG_STEP = 0.25;
export const ERLANG_A_ROOT_LOG_RADII = [8, 16, 24, 32] as const;
export const ERLANG_A_ROOT_RESIDUAL_TOLERANCE = 1e-12;
export const ERLANG_A_ROOT_RESIDUAL_ABS_FLOOR = 1e-14;
export const PROBABILITY_ABS_TOLERANCE = 1e-12;
export const PROBABILITY_VARIABLES = [
  "rho",
  "P0",
  "Pbusy",
  "Pwait",
  "Pabandon",
  "Pserved",
  "Pblock",
] as const satisfies readonly QueueVariableId[];
export const LOG_MIN_POSITIVE = Math.log(Number.MIN_VALUE);
export const LOG_MAX_POSITIVE = Math.log(Number.MAX_VALUE);

export function calculateTargetMetric(
  params: BaseQueueParams,
  target: NumericTarget,
): number | undefined {
  const result = calculateMmS(params);

  if (result.status !== "ok") {
    return undefined;
  }

  return result.metrics[target];
}

export function dedupeParams<T>(
  paramsList: readonly T[],
  isSameParams: (existing: T, candidate: T) => boolean,
): T[] {
  const unique: T[] = [];

  for (const params of paramsList) {
    if (unique.some((existing) => isSameParams(existing, params))) {
      continue;
    }

    unique.push(params);
  }

  return unique;
}

export function calculateGeneralServiceTargetMetric(
  modelKind: QueueModelKind,
  lambda: number,
  mu: number,
  serviceScv: number,
  target: GeneralServiceMetricTarget,
): number | undefined {
  if (modelKind !== "mg1" && modelKind !== "md1") {
    return undefined;
  }

  const result = calculateMg1({
    modelKind,
    lambda,
    mu,
    s: 1,
    serviceScv,
  });

  if (result.status !== "ok") {
    return undefined;
  }

  return result.metrics[target];
}

export function calculateGgSTargetMetric(
  input: NormalizedInput,
  lambda: number,
  mu: number,
  target: GeneralServiceMetricTarget,
): number | undefined {
  const { values } = input;

  if (
    input.modelKind !== "ggs" ||
    !has(values, "s") ||
    !has(values, "ca2") ||
    !has(values, "cs2")
  ) {
    return undefined;
  }

  const result = calculateGgS({
    modelKind: "ggs",
    lambda,
    mu,
    s: values.s,
    ca2: values.ca2,
    cs2: values.cs2,
  });

  if (result.status !== "ok") {
    return undefined;
  }

  return result.metrics[target];
}

export function calculateErlangATargetMetric(
  params: ErlangAParams,
  target: ErlangARateInverseTarget | ErlangAThetaInverseTarget,
): number | undefined {
  const minimumDeathScale = Math.min(params.mu, params.theta);

  if (
    !isPositiveFinite(minimumDeathScale) ||
    params.lambda / minimumDeathScale > MAX_STATES_FOR_MATH
  ) {
    return undefined;
  }

  const result = calculateErlangA(params);

  if (result.status !== "ok") {
    return undefined;
  }

  return metricValue(result.metrics, target);
}

export function solveRhoFromDimensionlessMetric(
  input: NormalizedInput,
  target: DimensionlessTarget,
): RootResult {
  const { values } = input;

  if (!has(values, "s") || !has(values, target)) {
    return { ok: false, reason: "invalid-target" };
  }

  return solveRhoForMetric((rho) => {
    return calculateTargetMetric(
      { lambda: rho * values.s, mu: 1, s: values.s },
      target,
    );
  }, values[target]);
}

export function validateKnownLambdaTarget(
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

export function validateGeneralServiceKnownLambdaTarget(
  target: GeneralServiceMetricTarget,
  value: number,
): SolverIssue | undefined {
  return value > 0 ? undefined : strictlyPositiveIssueObject(target);
}

export function validateGgSKnownLambdaTarget(
  target: GgSKnownLambdaMeanTarget,
  value: number,
): SolverIssue | undefined {
  return value > 0 ? undefined : strictlyPositiveIssueObject(target);
}

export function validateKnownMuTarget(
  target: NumericTarget,
  value: number,
  mu: number,
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

  if (target === "W") {
    return value > 1 / mu
      ? undefined
      : {
          variable: target,
          code: "W-too-small",
          message:
            "Time in system must be greater than one service time for a positive arrival rate.",
        };
  }

  return value > 0 ? undefined : strictlyPositiveIssueObject(target);
}

export function validateGeneralServiceKnownMuTarget(
  target: GeneralServiceMetricTarget,
  value: number,
  mu: number,
): SolverIssue | undefined {
  if (target === "W") {
    return value > 1 / mu
      ? undefined
      : {
          variable: target,
          code: "W-too-small",
          message:
            "Time in system must be greater than one service time for a positive arrival rate.",
        };
  }

  return value > 0 ? undefined : strictlyPositiveIssueObject(target);
}

export function validateGgSKnownMuTarget(
  target: GeneralServiceMetricTarget,
  value: number,
  mu: number,
): SolverIssue | undefined {
  if (target === "W") {
    return value > 1 / mu
      ? undefined
      : {
          variable: target,
          code: "W-too-small",
          message:
            "Time in system must be greater than one service time for a positive arrival rate.",
        };
  }

  return value > 0 ? undefined : strictlyPositiveIssueObject(target);
}

export function validateErlangAInverseTarget(
  target: ErlangARateInverseTarget | ErlangAThetaInverseTarget,
  value: number,
): SolverIssue | undefined {
  if (
    target === "P0" ||
    target === "Pwait" ||
    target === "Pabandon" ||
    target === "rho" ||
    target === "Pbusy"
  ) {
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

export function validateDimensionlessTarget(
  target: DimensionlessTarget,
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

export function validateGeneralServiceProbabilityRhoTarget(
  target: "P0" | "Pwait",
  value: number,
): SolverIssue | undefined {
  return value > 0 && value < 1
    ? undefined
    : {
        variable: target,
        code: "open-probability-required",
        message: `${target} must be greater than 0 and less than 1 for this inverse solve.`,
      };
}

export function metricValue(
  metrics: QueueMetrics,
  id: QueueVariableId,
): number {
  if (id === "Pbusy") {
    return metrics.Pbusy ?? Number.NaN;
  }

  const value = metrics[id];

  return typeof value === "number" ? value : Number.NaN;
}

export function formulaResultToSolverResult(
  result: Exclude<
    | ReturnType<typeof calculateMmS>
    | ReturnType<typeof calculateMmSK>
    | ReturnType<typeof calculateMmInfinity>
    | ReturnType<typeof calculateMg1>
    | ReturnType<typeof calculateGgS>
    | ReturnType<typeof calculateErlangA>,
    { status: "ok" }
  >,
  params: QueueParams,
): SolverResult {
  const issues = result.errors.map(validationErrorToIssue);

  if (result.status === "unstable") {
    return { status: "unstable", issues, params };
  }

  return { status: "invalid-input", issues };
}

export function validationErrorToIssue(error: ValidationError): SolverIssue {
  return {
    variable:
      error.field === "params" || error.field === "numeric"
        ? undefined
        : error.field,
    code: error.code,
    message: error.message,
  };
}

export function noStableMatch(target: QueueVariableId): SolverResult {
  return {
    status: "inconsistent",
    issues: [
      {
        variable: target,
        code: "no-stable-match",
        message: `No stable M/M/s queueing system matches the supplied ${target}.`,
      },
    ],
  };
}

export function noGeneralServiceStableMatch(
  target: QueueVariableId,
): SolverResult {
  return {
    status: "inconsistent",
    issues: [
      {
        variable: target,
        code: "no-stable-match",
        message: `No stable single-server general-service queue matches the supplied ${target}.`,
      },
    ],
  };
}

export function noGgSStableMatch(target: QueueVariableId): SolverResult {
  return {
    status: "inconsistent",
    issues: [
      {
        variable: target,
        code: "no-stable-match",
        message: `No stable G/G/s queueing system matches the supplied ${target}.`,
      },
    ],
  };
}

export function noErlangAMatch(target: QueueVariableId): SolverResult {
  return {
    status: "inconsistent",
    issues: [
      {
        variable: target,
        code: "no-erlang-a-match",
        message: `No Erlang A queueing system matches the supplied ${target}.`,
      },
    ],
  };
}

export function noNonnegativeGeneralServiceScv(
  target: QueueVariableId,
): SolverResult {
  return {
    status: "inconsistent",
    issues: [
      {
        variable: "serviceScv",
        code: "service-scv-implied-negative",
        message: `The supplied ${target} implies a negative service SCV for this M/G/1 queue.`,
      },
    ],
  };
}

export function noFiniteShapeMatch(
  target: FiniteInverseShapeTarget,
): SolverResult {
  return {
    status: "inconsistent",
    issues: [
      {
        variable: target,
        code: "no-finite-shape-match",
        message: `No finite M/M/s/K queueing system matches the supplied ${target}.`,
      },
    ],
  };
}

export function noFiniteServerCountMatch(): SolverResult {
  return {
    status: "inconsistent",
    issues: [
      {
        variable: "s",
        code: "no-finite-server-count-match",
        message:
          "No finite M/M/s/K server count matches the supplied queue metrics.",
      },
    ],
  };
}

export function noFiniteCapacityMatch(): SolverResult {
  return {
    status: "inconsistent",
    issues: [
      {
        variable: "K",
        code: "no-finite-capacity-match",
        message:
          "No finite M/M/s/K capacity matches the supplied queue metrics.",
      },
    ],
  };
}

export function searchBudgetExceeded(
  variable: QueueVariableId,
  searchLimit: number,
): SolverResult {
  return {
    status: "unsupported",
    issues: [
      {
        variable,
        code: "search-budget-exceeded",
        message: `This inverse search is capped at ${searchLimit} candidates to keep the calculator responsive. Enter ${variable} or add another independent queue metric to narrow the search.`,
      },
    ],
  };
}

export function noFiniteTwoDimensionalSearch(): SolverResult {
  return {
    status: "need-more-inputs",
    issues: [
      {
        code: "finite-two-dimensional-search",
        message:
          "Finite-capacity inverse solving needs either s or K fixed; enter one of them before solving for the other.",
      },
    ],
  };
}

export function ambiguousFiniteOfferedLoad(
  target: FiniteInverseShapeTarget,
): SolverResult {
  return {
    status: "need-more-inputs",
    issues: [
      {
        variable: target,
        code: "ambiguous-finite-offered-load",
        message: `The supplied finite-capacity ${target} matches multiple offered loads; add another independent finite-capacity metric.`,
      },
    ],
  };
}

export function ambiguousFiniteServerCount(): SolverResult {
  return {
    status: "need-more-inputs",
    issues: [
      {
        variable: "s",
        code: "ambiguous-finite-server-count",
        message:
          "The supplied values match multiple finite-capacity server counts; enter s or add another independent queue metric.",
      },
    ],
  };
}

export function ambiguousFiniteCapacity(): SolverResult {
  return {
    status: "need-more-inputs",
    issues: [
      {
        variable: "K",
        code: "ambiguous-finite-capacity",
        message:
          "The supplied values match multiple finite-capacity capacities; enter K or add another independent queue metric.",
      },
    ],
  };
}

export function ambiguousErlangAInverse(
  unknown: QueueVariableId,
  target: QueueVariableId,
): SolverResult {
  return {
    status: "need-more-inputs",
    issues: [
      {
        variable: unknown,
        code: "ambiguous-erlang-a-inverse",
        message: `The supplied Erlang A ${target} matches multiple ${unknown} values; add another independent Erlang A metric.`,
      },
    ],
  };
}

export function noServerCountMatch(): SolverResult {
  return {
    status: "inconsistent",
    issues: [
      {
        variable: "s",
        code: "no-server-count-match",
        message: `No stable M/M/s server count from 1 to ${MAX_SERVERS_FOR_MATH} matches the supplied queue metrics.`,
      },
    ],
  };
}

export function ambiguousServerCount(): SolverResult {
  return {
    status: "need-more-inputs",
    issues: [
      {
        variable: "s",
        code: "ambiguous-server-count",
        message:
          "The supplied values match multiple stable server counts; enter s or add another independent queue metric.",
      },
    ],
  };
}

export function missingScaleAfterUnknownServerCount(
  serverCount: number,
): SolverResult {
  return {
    status: "need-more-inputs",
    issues: [
      {
        code: "missing-scale",
        message: `The supplied shape constraints identify s = ${serverCount}, but an arrival rate, service rate, W, or Wq is needed to set the time scale.`,
      },
    ],
  };
}

export function finiteMissingScale(): SolverResult {
  return {
    status: "need-more-inputs",
    issues: [
      {
        code: "missing-scale",
        message:
          "These finite-capacity shape constraints are feasible, but an arrival rate, service rate, accepted arrival rate, W, or Wq is needed to set the time scale.",
      },
    ],
  };
}

export function unstableFromRho(input: NormalizedInput): SolverResult {
  const s = has(input.values, "s") ? input.values.s : 1;
  const params: QueueParams =
    input.modelKind === "mg1" || input.modelKind === "md1"
      ? {
          modelKind: input.modelKind,
          lambda: 1,
          mu: 1,
          s: 1,
          serviceScv: input.values.serviceScv ?? 0,
        }
      : input.modelKind === "ggs"
        ? {
            modelKind: "ggs",
            lambda: s,
            mu: 1,
            s,
            ca2: input.values.ca2 ?? 1,
            cs2: input.values.cs2 ?? 1,
          }
        : { lambda: s, mu: 1, s };

  return {
    status: "unstable",
    params,
    issues: [
      {
        variable: "rho",
        code: "system-unstable",
        message:
          "Traffic intensity must be less than 1 for a stable queueing system.",
      },
    ],
  };
}

export function invalidRhoForInference(): SolverResult {
  return { status: "invalid-input", issues: [invalidRhoForInferenceIssue()] };
}

export function invalidRhoForInferenceIssue(): SolverIssue {
  return {
    variable: "rho",
    code: "rho-positive",
    message:
      "Traffic intensity must be greater than 0 to infer a queueing system.",
  };
}

export function strictlyPositiveIssue(variable: QueueVariableId): SolverResult {
  return {
    status: "inconsistent",
    issues: [strictlyPositiveIssueObject(variable)],
  };
}

export function strictlyPositiveIssueObject(
  variable: QueueVariableId,
): SolverIssue {
  return {
    variable,
    code: "strictly-positive-required",
    message: `${variable} must be greater than 0 for this inverse solve.`,
  };
}

export function solveMm1MuFromLambdaAndWq(lambda: number, Wq: number): number {
  return (lambda + Math.sqrt(lambda * lambda + (4 * lambda) / Wq)) / 2;
}

export function offeredLoadFromP0(
  value: number,
): { kind: "value"; value: number } | { kind: "issue"; issue: SolverIssue } {
  if (value <= 0 || value >= 1) {
    return {
      kind: "issue",
      issue: {
        variable: "P0",
        code: "open-probability-required",
        message:
          "P0 must be greater than 0 and less than 1 for M/M/∞ inversion.",
      },
    };
  }

  const offeredLoad = -Math.log(value);

  if (!isPositiveFinite(offeredLoad)) {
    return {
      kind: "issue",
      issue: {
        variable: "P0",
        code: "offered-load-not-finite",
        message: "P0 could not be converted to a finite positive offered load.",
      },
    };
  }

  return { kind: "value", value: offeredLoad };
}

export function isMm1PathAllowed(input: NormalizedInput): boolean {
  return input.modelKind === "mm1" || input.values.s === 1;
}

export function areQueueParamsFinite(
  params: QueueParams,
  modelKind: QueueModelKind,
): boolean {
  if (modelKind === "mminf") {
    return (
      "modelKind" in params &&
      params.modelKind === "mminf" &&
      isPositiveFinite(params.lambda) &&
      isPositiveFinite(params.mu)
    );
  }

  if (modelKind === "mg1" || modelKind === "md1") {
    return (
      "modelKind" in params &&
      params.modelKind === modelKind &&
      "s" in params &&
      params.s === 1 &&
      "serviceScv" in params &&
      isPositiveFinite(params.lambda) &&
      isPositiveFinite(params.mu) &&
      Number.isFinite(params.serviceScv) &&
      params.serviceScv >= 0
    );
  }

  if (modelKind === "ggs") {
    return (
      "modelKind" in params &&
      params.modelKind === "ggs" &&
      "s" in params &&
      isPositiveFinite(params.lambda) &&
      isPositiveFinite(params.mu) &&
      Number.isInteger(params.s) &&
      params.s >= 1 &&
      params.s <= MAX_SERVERS_FOR_MATH &&
      Number.isFinite(params.ca2) &&
      !Object.is(params.ca2, -0) &&
      params.ca2 >= 0 &&
      Number.isFinite(params.cs2) &&
      !Object.is(params.cs2, -0) &&
      params.cs2 >= 0
    );
  }

  if (modelKind === "erlang-a") {
    return (
      "modelKind" in params &&
      params.modelKind === "erlang-a" &&
      "s" in params &&
      "theta" in params &&
      isPositiveFinite(params.lambda) &&
      isPositiveFinite(params.mu) &&
      Number.isInteger(params.s) &&
      params.s >= 1 &&
      params.s <= MAX_SERVERS_FOR_MATH &&
      isPositiveFinite(params.theta)
    );
  }

  if (!("s" in params)) {
    return false;
  }

  const hasFiniteBase =
    isPositiveFinite(params.lambda) &&
    isPositiveFinite(params.mu) &&
    Number.isInteger(params.s) &&
    params.s >= 1 &&
    params.s <= MAX_SERVERS_FOR_MATH;

  if (!hasFiniteBase) {
    return false;
  }

  if (modelKind !== "mmsk") {
    return true;
  }

  return (
    "K" in params &&
    Number.isInteger(params.K) &&
    params.K >= params.s &&
    params.K <= MAX_CAPACITY_FOR_MATH
  );
}

export function withInferredValues(
  input: NormalizedInput,
  inferred: QueueInputMap,
): NormalizedInput {
  return { ...input, values: { ...input.values, ...inferred } };
}

export function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function clampLogPositive(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(LOG_MAX_POSITIVE, Math.max(LOG_MIN_POSITIVE, value));
}

export function isRootResidualClose(residual: number, target: number): boolean {
  return (
    Math.abs(residual) <=
    Math.max(
      ERLANG_A_ROOT_RESIDUAL_ABS_FLOOR,
      ERLANG_A_ROOT_RESIDUAL_TOLERANCE * Math.max(1, Math.abs(target)),
    )
  );
}

export function hasSignChange(a: number, b: number): boolean {
  return (a < 0 && b > 0) || (a > 0 && b < 0);
}

export function addUniquePositiveRoot(roots: number[], value: number): void {
  if (!isPositiveFinite(value)) {
    return;
  }

  if (roots.some((existing) => nearlyEqual(existing, value))) {
    return;
  }

  roots.push(value);
}

export function has<T extends QueueVariableId>(
  values: QueueInputMap,
  variable: T,
): values is QueueInputMap & Record<T, number> {
  return values[variable] !== undefined;
}

export function hasAny(
  values: QueueInputMap,
  variables: readonly QueueVariableId[],
): boolean {
  return variables.some((variable) => has(values, variable));
}

export function firstPresent<T extends QueueVariableId>(
  values: QueueInputMap,
  variables: readonly T[],
): T | undefined {
  return variables.find((variable) => has(values, variable));
}

export function candidate(
  pathId: string,
  params: QueueParams,
): CandidateResult {
  return { kind: "candidate", pathId, params };
}

export function mmInfinityCandidate(
  pathId: string,
  params: Omit<MmInfinityParams, "modelKind">,
): CandidateResult {
  return candidate(pathId, { ...params, modelKind: "mminf" });
}

export function generalServiceCandidate(
  pathId: string,
  input: NormalizedInput,
  params: Omit<Mg1Params, "modelKind" | "s">,
): CandidateResult {
  if (input.modelKind !== "mg1" && input.modelKind !== "md1") {
    return { kind: "none" };
  }

  return candidate(pathId, { ...params, modelKind: input.modelKind, s: 1 });
}

export function ggSCandidate(
  pathId: string,
  input: NormalizedInput,
  params: Omit<GgSParams, "modelKind" | "ca2" | "cs2">,
): CandidateResult {
  if (
    input.modelKind !== "ggs" ||
    !has(input.values, "ca2") ||
    !has(input.values, "cs2")
  ) {
    return { kind: "none" };
  }

  return candidate(pathId, {
    ...params,
    modelKind: "ggs",
    ca2: input.values.ca2,
    cs2: input.values.cs2,
  });
}

export function erlangACandidate(
  pathId: string,
  params: Omit<ErlangAParams, "modelKind">,
): CandidateResult {
  return candidate(pathId, { ...params, modelKind: "erlang-a" });
}

export function terminal(result: SolverResult): CandidateResult {
  return { kind: "terminal", result };
}
