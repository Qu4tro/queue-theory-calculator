import { areMetricNumbersFinite } from "./metric-finiteness";
import { MAX_SERVERS_FOR_MATH } from "./mm-s";
import {
  clampProbability,
  expFromLog,
  isFiniteNumber,
  logAddExp,
} from "./numeric";
import type {
  ErlangAFormulaResult,
  ErlangAMetrics,
  ErlangAParams,
  ErlangAWarning,
  MetricQuality,
  QueueComputationInfo,
  QueueVariableId,
  ValidationError,
} from "./types";
import {
  abandonmentRatePositiveIssue,
  arrivalRatePositiveIssue,
  asFieldIssue,
  isPositiveFinite,
  isWholeNumberAtLeast,
  serverCountIntegerMinIssue,
  serverCountMaxIssue,
  serviceRatePositiveIssue,
} from "./validation";

export const MAX_STATES_FOR_MATH = 200_000;

// Erlang A accumulates a truncated birth-death tail, so allow a wider final
// rounding clamp than the closed-form queue formulas.
const ERLANG_A_PROBABILITY_CLAMP_EPSILON = 1e-12;
const TAIL_RELATIVE_TOLERANCE = 1e-14;
const LOG_TAIL_RELATIVE_TOLERANCE = Math.log(TAIL_RELATIVE_TOLERANCE);
const ERLANG_A_WAIT_ACCOUNTING_NOTE =
  "W and Wq average all arrivals, including customers who abandon; when Pabandon > 0, W is not Wq + 1/mu.";
const ERLANG_A_EXACT_VARIABLES = [
  "lambda",
  "mu",
  "s",
  "theta",
  "offeredRho",
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
] as const satisfies readonly QueueVariableId[];

type BirthDeathWeights =
  | {
      status: "ok";
      logWeights: number[];
      logDenominator: number;
    }
  | { status: "numeric-failure"; errors: ValidationError[] };

export function validateErlangAParams(
  params: ErlangAParams,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!isPositiveFinite(params.lambda)) {
    errors.push(asFieldIssue(arrivalRatePositiveIssue()));
  }

  if (!isPositiveFinite(params.mu)) {
    errors.push(asFieldIssue(serviceRatePositiveIssue()));
  }

  if (!isWholeNumberAtLeast(params.s, 1)) {
    errors.push(asFieldIssue(serverCountIntegerMinIssue()));
  } else if (params.s > MAX_SERVERS_FOR_MATH) {
    errors.push(asFieldIssue(serverCountMaxIssue(MAX_SERVERS_FOR_MATH)));
  }

  if (!isPositiveFinite(params.theta)) {
    errors.push(asFieldIssue(abandonmentRatePositiveIssue()));
  }

  return errors;
}

export function calculateErlangA(params: ErlangAParams): ErlangAFormulaResult {
  const errors = validateErlangAParams(params);

  if (errors.length > 0) {
    return { status: "invalid", errors };
  }

  const lambda = params.lambda;
  const mu = params.mu;
  const s = params.s;
  const theta = params.theta;
  const weights = calculateBirthDeathWeights(lambda, mu, s, theta);

  if (weights.status !== "ok") {
    return weights;
  }

  let Pwait = 0;
  let Lq = 0;
  let Ls = 0;

  for (let n = 0; n < weights.logWeights.length; n += 1) {
    const probability = clampProbability(
      expFromLog(
        requiredLogWeight(weights.logWeights, n) - weights.logDenominator,
      ),
      ERLANG_A_PROBABILITY_CLAMP_EPSILON,
    );
    const queued = Math.max(0, n - s);
    const busy = Math.min(n, s);

    if (n >= s) {
      Pwait += probability;
    }

    Lq += queued * probability;
    Ls += busy * probability;
  }

  const a = lambda / mu;
  const offeredRho = a / s;
  const L = Ls + Lq;
  const rho = Ls / s;
  const abandonRate = sanitizeNonNegative(theta * Lq);
  const throughput = sanitizeNonNegative(lambda - abandonRate);
  const serviceVariance = 1 / (mu * mu);
  const warnings = buildWarnings(offeredRho);
  const computation = buildComputationInfo(warnings);
  const metrics: ErlangAMetrics = {
    modelKind: "erlang-a",
    lambda,
    mu,
    s,
    theta,
    a,
    offeredRho,
    rho: clampProbability(rho, ERLANG_A_PROBABILITY_CLAMP_EPSILON),
    P0: clampProbability(
      expFromLog(-weights.logDenominator),
      ERLANG_A_PROBABILITY_CLAMP_EPSILON,
    ),
    Pbusy: clampProbability(rho, ERLANG_A_PROBABILITY_CLAMP_EPSILON),
    Pwait: clampProbability(Pwait, ERLANG_A_PROBABILITY_CLAMP_EPSILON),
    serviceScv: 1,
    serviceVariance,
    serviceSecondMoment: 2 * serviceVariance,
    Ls,
    Lq,
    Wq: Lq / lambda,
    W: L / lambda,
    L,
    abandonRate,
    throughput,
    Pabandon: clampProbability(
      abandonRate / lambda,
      ERLANG_A_PROBABILITY_CLAMP_EPSILON,
    ),
    Pserved: clampProbability(
      throughput / lambda,
      ERLANG_A_PROBABILITY_CLAMP_EPSILON,
    ),
    computation,
  };

  if (!areMetricNumbersFinite(metrics)) {
    return numericFailure(
      "numeric-overflow",
      "The Erlang A formulas exceeded JavaScript numeric limits for these inputs.",
    );
  }

  return { status: "ok", metrics, errors: [], warnings };
}

function calculateBirthDeathWeights(
  lambda: number,
  mu: number,
  s: number,
  theta: number,
): BirthDeathWeights {
  const logWeights = [0];
  const logLambda = Math.log(lambda);
  let logWeight = 0;
  let logDenominator = 0;

  for (let n = 1; n <= MAX_STATES_FOR_MATH; n += 1) {
    const death = deathRate(n, mu, s, theta);

    if (!isFiniteNumber(death) || death <= 0) {
      return numericFailure(
        "numeric-overflow",
        "The Erlang A birth-death recurrence exceeded JavaScript numeric limits for these inputs.",
      );
    }

    logWeight += logLambda - Math.log(death);

    if (!Number.isFinite(logWeight)) {
      return numericFailure(
        "numeric-overflow",
        "The Erlang A birth-death recurrence exceeded JavaScript numeric limits for these inputs.",
      );
    }

    logWeights.push(logWeight);
    logDenominator = logAddExp(logDenominator, logWeight);

    if (
      n >= s &&
      tailIsNegligible(logWeight, logDenominator, n, s, lambda, mu, theta)
    ) {
      return { status: "ok", logWeights, logDenominator };
    }
  }

  return numericFailure(
    "numeric-convergence",
    `Erlang A tail truncation did not converge within ${MAX_STATES_FOR_MATH} states.`,
  );
}

function tailIsNegligible(
  logWeight: number,
  logDenominator: number,
  n: number,
  s: number,
  lambda: number,
  mu: number,
  theta: number,
): boolean {
  const rNext = lambda / deathRate(n + 1, mu, s, theta);

  if (!Number.isFinite(rNext) || rNext <= 0 || rNext >= 1) {
    return false;
  }

  const oneMinusR = 1 - rNext;
  const logTailMass = logWeight + Math.log(rNext) - Math.log(oneMinusR);
  const queuedAtN = Math.max(0, n - s);
  const queueTailBound =
    (queuedAtN * rNext) / oneMinusR + rNext / (oneMinusR * oneMinusR);
  const logQueueTail =
    queueTailBound > 0 ? logWeight + Math.log(queueTailBound) : -Infinity;

  return (
    logTailMass - logDenominator <= LOG_TAIL_RELATIVE_TOLERANCE &&
    logQueueTail - logDenominator <= LOG_TAIL_RELATIVE_TOLERANCE
  );
}

function deathRate(n: number, mu: number, s: number, theta: number): number {
  return Math.min(n, s) * mu + Math.max(0, n - s) * theta;
}

function buildWarnings(offeredRho: number): ErlangAWarning[] {
  if (offeredRho < 1) {
    return [];
  }

  return [
    {
      code: "erlang-a-overload",
      message:
        "Offered demand exceeds service capacity; abandonment stabilizes this Erlang A model.",
    },
  ];
}

function buildComputationInfo(
  warnings: readonly ErlangAWarning[],
): QueueComputationInfo {
  const metricQuality: Partial<Record<QueueVariableId, MetricQuality>> = {};

  for (const variable of ERLANG_A_EXACT_VARIABLES) {
    metricQuality[variable] = "exact";
  }

  return {
    modelKind: "erlang-a",
    method: "birth-death-erlang-a",
    metricQuality,
    notes: [
      ERLANG_A_WAIT_ACCOUNTING_NOTE,
      ...warnings.map((warning) => warning.message),
    ],
  };
}

function sanitizeNonNegative(value: number): number {
  if (value < 0 && value >= -ERLANG_A_PROBABILITY_CLAMP_EPSILON) {
    return 0;
  }

  return value;
}

function requiredLogWeight(values: readonly number[], index: number): number {
  const value = values[index];

  if (value === undefined) {
    throw new Error("Missing Erlang A birth-death weight.");
  }

  return value;
}

function numericFailure(
  code: "numeric-convergence" | "numeric-overflow",
  message: string,
): { status: "numeric-failure"; errors: ValidationError[] } {
  return {
    status: "numeric-failure",
    errors: [
      {
        field: "numeric",
        code,
        message,
      },
    ],
  };
}
