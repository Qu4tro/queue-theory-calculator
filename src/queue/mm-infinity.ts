import { areMetricNumbersFinite } from "./metric-finiteness";
import type {
  MmInfinityFormulaResult,
  MmInfinityMetrics,
  MmInfinityParams,
  ValidationError,
} from "./types";
import {
  arrivalRatePositiveIssue,
  asFieldIssue,
  isPositiveFinite,
  serviceRatePositiveIssue,
} from "./validation";

export function validateMmInfinityParams(
  params: MmInfinityParams,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!isPositiveFinite(params.lambda)) {
    errors.push(asFieldIssue(arrivalRatePositiveIssue()));
  }

  if (!isPositiveFinite(params.mu)) {
    errors.push(asFieldIssue(serviceRatePositiveIssue()));
  }

  if (errors.length > 0) {
    return errors;
  }

  const a = params.lambda / params.mu;

  if (!Number.isFinite(a)) {
    errors.push({
      field: "numeric",
      code: "numeric-overflow",
      message:
        "The infinite-server formulas exceeded JavaScript numeric limits for these inputs.",
    });
  }

  return errors;
}

export function calculateMmInfinity(
  params: MmInfinityParams,
): MmInfinityFormulaResult {
  const errors = validateMmInfinityParams(params);

  if (errors.length > 0) {
    return { status: "invalid", errors };
  }

  const lambda = params.lambda;
  const mu = params.mu;
  const a = lambda / mu;
  const P0 = Math.exp(-a);
  const serviceVariance = 1 / (mu * mu);
  const metrics: MmInfinityMetrics = {
    modelKind: "mminf",
    lambda,
    mu,
    a,
    s: null,
    rho: null,
    P0,
    Pbusy: null,
    serviceScv: 1,
    serviceVariance,
    serviceSecondMoment: 2 * serviceVariance,
    Pwait: 0,
    Lq: 0,
    Wq: 0,
    W: 1 / mu,
    L: a,
  };

  if (!areMetricNumbersFinite(metrics)) {
    return {
      status: "invalid",
      errors: [
        {
          field: "numeric",
          code: "numeric-overflow",
          message:
            "The infinite-server formulas exceeded JavaScript numeric limits for these inputs.",
        },
      ],
    };
  }

  return { status: "ok", metrics, errors: [] };
}
