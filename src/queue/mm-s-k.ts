import { areMetricNumbersFinite } from "./metric-finiteness";
import { MAX_SERVERS_FOR_MATH } from "./mm-s";
import { clampProbability, expFromLog, logAddExp } from "./numeric";
import type {
  FiniteQueueParams,
  MmSKFormulaResult,
  MmSKMetrics,
  ValidationError,
} from "./types";
import {
  arrivalRatePositiveIssue,
  asFieldIssue,
  capacityAtLeastServersIssue,
  capacityIntegerMinIssue,
  capacityMaxIssue,
  isPositiveFinite,
  isWholeNumberAtLeast,
  serverCountIntegerMinIssue,
  serverCountMaxIssue,
  serviceRatePositiveIssue,
} from "./validation";

export const MAX_CAPACITY_FOR_MATH = MAX_SERVERS_FOR_MATH;

export function validateMmSKParams(
  params: FiniteQueueParams,
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

  if (!isWholeNumberAtLeast(params.K, 1)) {
    errors.push(asFieldIssue(capacityIntegerMinIssue()));
  } else if (params.K > MAX_CAPACITY_FOR_MATH) {
    errors.push(asFieldIssue(capacityMaxIssue(MAX_CAPACITY_FOR_MATH)));
  }

  if (
    isWholeNumberAtLeast(params.s, 1) &&
    isWholeNumberAtLeast(params.K, 1) &&
    params.K < params.s
  ) {
    errors.push(asFieldIssue(capacityAtLeastServersIssue()));
  }

  return errors;
}

export function calculateMmSK(params: FiniteQueueParams): MmSKFormulaResult {
  const errors = validateMmSKParams(params);

  if (errors.length > 0) {
    return { status: "invalid", errors };
  }

  const lambda = params.lambda;
  const mu = params.mu;
  const s = params.s;
  const K = params.K;
  const a = lambda / mu;
  const offeredRho = a / s;
  const stateProbabilities = calculateStateProbabilities(lambda, mu, s, K);

  if (stateProbabilities === undefined) {
    return numericOverflow();
  }

  let L = 0;
  let Lq = 0;
  let busyServers = 0;
  let acceptedStateProbability = 0;
  let PwaitAmongAttemptedArrivals = 0;

  for (let n = 0; n <= K; n += 1) {
    const probability = stateProbabilities[n];

    if (probability === undefined) {
      return numericOverflow();
    }

    L += n * probability;
    Lq += Math.max(n - s, 0) * probability;
    busyServers += Math.min(n, s) * probability;

    if (n < K) {
      acceptedStateProbability += probability;
    }

    if (n >= s && n < K) {
      PwaitAmongAttemptedArrivals += probability;
    }
  }

  const P0 = stateProbabilities[0] ?? 0;
  const Pblock = stateProbabilities[K] ?? 0;
  const Pwait =
    acceptedStateProbability > 0
      ? PwaitAmongAttemptedArrivals / acceptedStateProbability
      : K > s
        ? 1
        : 0;
  const rho = busyServers / s;
  const lambdaEffective = busyServers * mu;

  if (!Number.isFinite(lambdaEffective)) {
    return numericOverflow();
  }

  if (lambdaEffective <= 0) {
    return numericUnderflow();
  }

  const W = L / lambdaEffective;
  const Wq = Lq / lambdaEffective;
  const serviceVariance = 1 / (mu * mu);
  const metrics: MmSKMetrics = {
    lambda,
    mu,
    s,
    K,
    a,
    offeredRho,
    lambdaEffective,
    rho,
    P0: clampProbability(P0),
    Pbusy: rho,
    Pwait: clampProbability(Pwait),
    Pblock: clampProbability(Pblock),
    serviceScv: 1,
    serviceVariance,
    serviceSecondMoment: 2 * serviceVariance,
    Lq,
    Wq,
    W,
    L,
    busyServers,
    stateProbabilities,
  };

  if (!areMetricNumbersFinite(metrics)) {
    return numericOverflow();
  }

  return { status: "ok", metrics, errors: [] };
}

function calculateStateProbabilities(
  lambda: number,
  mu: number,
  s: number,
  K: number,
): number[] | undefined {
  const logWeights = [0];
  const logLambda = Math.log(lambda);
  const logMu = Math.log(mu);

  for (let n = 1; n <= K; n += 1) {
    const deathRateMultiplier = Math.min(n, s);
    logWeights[n] =
      requiredLogWeight(logWeights, n - 1) +
      logLambda -
      Math.log(deathRateMultiplier) -
      logMu;

    if (!Number.isFinite(logWeights[n])) {
      return undefined;
    }
  }

  const logDenominator = logSumExp(logWeights);

  if (!Number.isFinite(logDenominator)) {
    return undefined;
  }

  const probabilities = logWeights.map((weight) =>
    clampProbability(expFromLog(weight - logDenominator)),
  );

  return probabilities.every((probability) => Number.isFinite(probability))
    ? probabilities
    : undefined;
}

function logSumExp(values: readonly number[]): number {
  return values.reduce((total, value) => logAddExp(total, value), -Infinity);
}

function requiredLogWeight(values: readonly number[], index: number): number {
  const value = values[index];

  if (value === undefined) {
    throw new Error("Missing finite-capacity birth-death weight.");
  }

  return value;
}

function numericOverflow(): MmSKFormulaResult {
  return {
    status: "invalid",
    errors: [
      {
        field: "numeric",
        code: "numeric-overflow",
        message:
          "The finite-capacity formulas exceeded JavaScript numeric limits for these inputs.",
      },
    ],
  };
}

function numericUnderflow(): MmSKFormulaResult {
  return {
    status: "invalid",
    errors: [
      {
        field: "numeric",
        code: "numeric-underflow",
        message:
          "The finite-capacity formulas underflowed to zero accepted throughput for these inputs.",
      },
    ],
  };
}
