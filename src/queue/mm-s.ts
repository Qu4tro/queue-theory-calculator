import { areMetricNumbersFinite } from "./metric-finiteness";
import { clampProbability, expFromLog, logAddExp } from "./numeric";
import type {
  MmSFormulaResult,
  MmSMetrics,
  MmSParams,
  ValidationError,
} from "./types";
import {
  arrivalRatePositiveIssue,
  asFieldIssue,
  isPositiveFinite,
  isWholeNumberAtLeast,
  serverCountIntegerMinIssue,
  serverCountMaxIssue,
  serviceRatePositiveIssue,
} from "./validation";

export const MAX_SERVERS_FOR_MATH = 10_000;

export function validateMmSParams(params: MmSParams): ValidationError[] {
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

  return errors;
}

export function calculateMmS(params: MmSParams): MmSFormulaResult {
  const errors = validateMmSParams(params);

  if (errors.length > 0) {
    return { status: "invalid", errors };
  }

  const lambda = params.lambda;
  const mu = params.mu;
  const s = params.s;
  const a = lambda / mu;
  const rho = a / s;

  if (!Number.isFinite(rho) || rho >= 1) {
    return {
      status: "unstable",
      errors: [
        {
          field: "params",
          code: "system-unstable",
          message:
            "The queueing system is unstable because arrival rate must be less than total service capacity.",
        },
      ],
    };
  }

  const probabilities = calculateErlangCProbabilities(a, s, rho);

  if (probabilities === undefined) {
    return numericOverflow();
  }

  const { P0, Pwait } = probabilities;
  const oneMinusRho = 1 - rho;
  const Lq = oneMinusRho > 0 ? (Pwait * rho) / oneMinusRho : Infinity;
  const Wq = Lq / lambda;
  const W = Wq + 1 / mu;
  const L = Lq + a;
  const serviceVariance = 1 / (mu * mu);

  const metrics: MmSMetrics = {
    lambda,
    mu,
    s,
    a,
    rho,
    P0,
    Pbusy: rho,
    Pwait,
    serviceScv: 1,
    serviceVariance,
    serviceSecondMoment: 2 * serviceVariance,
    Lq,
    Wq,
    W,
    L,
  };

  if (!areMetricNumbersFinite(metrics)) {
    return numericOverflow();
  }

  return { status: "ok", metrics, errors: [] };
}

function calculateErlangCProbabilities(
  a: number,
  s: number,
  rho: number,
): { P0: number; Pwait: number } | undefined {
  if (a === 0) {
    return { P0: 1, Pwait: 0 };
  }

  if (!Number.isFinite(a) || a < 0 || !Number.isFinite(rho) || rho < 0) {
    return undefined;
  }

  const logA = Math.log(a);
  let logTerm = 0;
  let logFiniteSum = 0;

  for (let n = 1; n < s; n += 1) {
    logTerm += logA - Math.log(n);
    logFiniteSum = logAddExp(logFiniteSum, logTerm);
  }

  const logTailTerm = logTerm + logA - Math.log(s);
  const logTailWithWait = logTailTerm - Math.log1p(-rho);
  const logDenominator = logAddExp(logFiniteSum, logTailWithWait);

  if (!Number.isFinite(logTailWithWait) || !Number.isFinite(logDenominator)) {
    return undefined;
  }

  const P0 = clampProbability(expFromLog(-logDenominator));
  const Pwait = clampProbability(expFromLog(logTailWithWait - logDenominator));

  return { P0, Pwait };
}

function numericOverflow(): MmSFormulaResult {
  return {
    status: "invalid",
    errors: [
      {
        field: "numeric",
        code: "numeric-overflow",
        message:
          "The queueing formulas exceeded JavaScript numeric limits for these inputs.",
      },
    ],
  };
}
