import { areMetricNumbersFinite } from "./metric-finiteness";
import type {
  Mg1FormulaResult,
  Mg1Metrics,
  Mg1Params,
  ValidationError,
} from "./types";
import {
  arrivalRatePositiveIssue,
  asFieldIssue,
  isNonNegativeFinite,
  isPositiveFinite,
  isWholeNumberAtLeast,
  scvNonNegativeIssue,
  serviceRatePositiveIssue,
} from "./validation";

export function validateMg1Params(params: Mg1Params): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!isPositiveFinite(params.lambda)) {
    errors.push(asFieldIssue(arrivalRatePositiveIssue()));
  }

  if (!isPositiveFinite(params.mu)) {
    errors.push(asFieldIssue(serviceRatePositiveIssue()));
  }

  if (!isNonNegativeFinite(params.serviceScv, { allowNegativeZero: true })) {
    errors.push(
      asFieldIssue(
        scvNonNegativeIssue("serviceScv", {
          code: "service-scv-non-negative",
        }),
      ),
    );
  }

  if (!isWholeNumberAtLeast(params.s, 1) || params.s !== 1) {
    errors.push({
      field: "s",
      code: "single-server-model",
      message: "This model uses one server; s must be 1.",
    });
  }

  return errors;
}

export function calculateMg1(params: Mg1Params): Mg1FormulaResult {
  const errors = validateMg1Params(params);

  if (errors.length > 0) {
    return { status: "invalid", errors };
  }

  const lambda = params.lambda;
  const mu = params.mu;
  const serviceScv = params.serviceScv;
  const rho = lambda / mu;

  if (!Number.isFinite(rho) || rho >= 1) {
    return {
      status: "unstable",
      errors: [
        {
          field: "params",
          code: "system-unstable",
          message:
            "The queueing system is unstable because arrival rate must be less than service rate.",
        },
      ],
    };
  }

  const meanServiceTime = 1 / mu;
  const serviceVariance = serviceScv / (mu * mu);
  const serviceSecondMoment = (1 + serviceScv) / (mu * mu);
  const oneMinusRho = 1 - rho;
  const Wq = (lambda * serviceSecondMoment) / (2 * oneMinusRho);
  const Lq = lambda * Wq;
  const W = Wq + meanServiceTime;
  const L = lambda * W;
  const metrics: Mg1Metrics = {
    modelKind: params.modelKind,
    lambda,
    mu,
    s: 1,
    a: rho,
    rho,
    P0: 1 - rho,
    Pbusy: rho,
    Pwait: rho,
    serviceScv,
    serviceVariance,
    serviceSecondMoment,
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

function numericOverflow(): Mg1FormulaResult {
  return {
    status: "invalid",
    errors: [
      {
        field: "numeric",
        code: "numeric-overflow",
        message:
          "The M/G/1 formulas exceeded JavaScript numeric limits for these inputs.",
      },
    ],
  };
}
