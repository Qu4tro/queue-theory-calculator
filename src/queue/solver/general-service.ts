import type { SolverResult } from "../types";
import type { NormalizedInput } from "./normalize";
import { solveRhoForMetric } from "./root";
import {
  type CandidateResult,
  calculateGeneralServiceTargetMetric,
  firstPresent,
  GENERAL_SERVICE_METRIC_TARGETS,
  type GeneralServiceMetricTarget,
  generalServiceCandidate,
  has,
  invalidRhoForInference,
  isPositiveFinite,
  noGeneralServiceStableMatch,
  noNonnegativeGeneralServiceScv,
  strictlyPositiveIssue,
  type TimeTarget,
  terminal,
  unstableFromRho,
  validateGeneralServiceKnownLambdaTarget,
  validateGeneralServiceKnownMuTarget,
  validateGeneralServiceProbabilityRhoTarget,
  withInferredValues,
} from "./shared";

export function findGeneralServiceCandidate(
  input: NormalizedInput,
): CandidateResult {
  const { values } = input;

  if (has(values, "lambda") && has(values, "mu")) {
    if (!has(values, "serviceScv")) {
      const target = firstPresent(values, GENERAL_SERVICE_METRIC_TARGETS);

      if (target !== undefined && input.modelKind === "mg1") {
        return inferGeneralServiceScvFromKnownRates(input, target);
      }

      return { kind: "none" };
    }

    return generalServiceCandidate("mg1-lambda-mu-serviceScv", input, {
      lambda: values.lambda,
      mu: values.mu,
      serviceScv: values.serviceScv,
    });
  }

  if (!has(values, "serviceScv")) {
    return { kind: "none" };
  }

  if (has(values, "lambda") && has(values, "rho")) {
    if (values.rho <= 0) {
      return terminal(invalidRhoForInference());
    }

    if (values.rho >= 1) {
      return terminal(unstableFromRho(input));
    }

    const mu = values.lambda / values.rho;

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

    return generalServiceCandidate("mg1-lambda-rho-serviceScv", input, {
      lambda: values.lambda,
      mu,
      serviceScv: values.serviceScv,
    });
  }

  if (has(values, "lambda") && !has(values, "mu")) {
    const rhoResult = inferGeneralServiceRho(input);

    if (rhoResult.status === "terminal") {
      return { kind: "terminal", result: rhoResult.result };
    }

    if (rhoResult.status === "ok") {
      return solveGeneralServiceMuFromRho(input, rhoResult.rho);
    }

    const target = firstPresent(values, GENERAL_SERVICE_METRIC_TARGETS);

    if (target !== undefined) {
      return solveGeneralServiceMuFromKnownLambda(input, target);
    }
  }

  if (has(values, "mu") && has(values, "rho")) {
    if (values.rho <= 0) {
      return terminal(invalidRhoForInference());
    }

    if (values.rho >= 1) {
      return terminal(unstableFromRho(input));
    }

    const lambda = values.rho * values.mu;

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

    return generalServiceCandidate("mg1-mu-rho-serviceScv", input, {
      lambda,
      mu: values.mu,
      serviceScv: values.serviceScv,
    });
  }

  if (has(values, "mu") && !has(values, "lambda")) {
    const rhoResult = inferGeneralServiceRho(input);

    if (rhoResult.status === "terminal") {
      return { kind: "terminal", result: rhoResult.result };
    }

    if (rhoResult.status === "ok") {
      return solveGeneralServiceLambdaFromRho(input, rhoResult.rho);
    }

    const target = firstPresent(values, GENERAL_SERVICE_METRIC_TARGETS);

    if (target !== undefined) {
      return solveGeneralServiceLambdaFromKnownMu(input, target);
    }
  }

  if (has(values, "rho") && !has(values, "lambda") && !has(values, "mu")) {
    if (has(values, "W")) {
      return solveGeneralServiceRatesFromRhoAndTime(input, values.rho, "W");
    }

    if (has(values, "Wq")) {
      return solveGeneralServiceRatesFromRhoAndTime(input, values.rho, "Wq");
    }
  }

  if (!has(values, "lambda") && !has(values, "mu")) {
    const rhoResult = inferGeneralServiceRho(input);

    if (rhoResult.status === "terminal") {
      return { kind: "terminal", result: rhoResult.result };
    }

    if (rhoResult.status === "ok") {
      if (has(values, "W")) {
        return solveGeneralServiceRatesFromRhoAndTime(
          input,
          rhoResult.rho,
          "W",
        );
      }

      if (has(values, "Wq")) {
        return solveGeneralServiceRatesFromRhoAndTime(
          input,
          rhoResult.rho,
          "Wq",
        );
      }
    }
  }

  return { kind: "none" };
}

export function inferGeneralServiceScvFromKnownRates(
  input: NormalizedInput,
  target: GeneralServiceMetricTarget,
): CandidateResult {
  const { values } = input;

  if (
    input.modelKind !== "mg1" ||
    !has(values, "lambda") ||
    !has(values, "mu") ||
    !has(values, target)
  ) {
    return { kind: "none" };
  }

  const rho = values.lambda / values.mu;

  if (rho >= 1) {
    return terminal(unstableFromRho(withInferredValues(input, { rho })));
  }

  const serviceScv = impliedGeneralServiceScv(
    rho,
    values.mu,
    target,
    values[target],
  );

  if (!Number.isFinite(serviceScv) || serviceScv < 0) {
    return terminal(noNonnegativeGeneralServiceScv(target));
  }

  return generalServiceCandidate("mg1-lambda-mu-inferred-serviceScv", input, {
    lambda: values.lambda,
    mu: values.mu,
    serviceScv,
  });
}

export function impliedGeneralServiceScv(
  rho: number,
  mu: number,
  target: GeneralServiceMetricTarget,
  value: number,
): number {
  const oneMinusRho = 1 - rho;

  switch (target) {
    case "L":
      return (2 * (value - rho) * oneMinusRho) / (rho * rho) - 1;
    case "Lq":
      return (2 * value * oneMinusRho) / (rho * rho) - 1;
    case "W":
      return (2 * mu * (value - 1 / mu) * oneMinusRho) / rho - 1;
    case "Wq":
      return (2 * mu * value * oneMinusRho) / rho - 1;
  }
}

export function solveGeneralServiceMuFromRho(
  input: NormalizedInput,
  rho: number,
): CandidateResult {
  const { values } = input;

  if (!has(values, "lambda") || !has(values, "serviceScv")) {
    return { kind: "none" };
  }

  if (rho <= 0) {
    return terminal(invalidRhoForInference());
  }

  if (rho >= 1) {
    return terminal(unstableFromRho(withInferredValues(input, { rho })));
  }

  const mu = values.lambda / rho;

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

  return generalServiceCandidate("mg1-lambda-rho-like-serviceScv", input, {
    lambda: values.lambda,
    mu,
    serviceScv: values.serviceScv,
  });
}

export function solveGeneralServiceLambdaFromRho(
  input: NormalizedInput,
  rho: number,
): CandidateResult {
  const { values } = input;

  if (!has(values, "mu") || !has(values, "serviceScv")) {
    return { kind: "none" };
  }

  if (rho <= 0) {
    return terminal(invalidRhoForInference());
  }

  if (rho >= 1) {
    return terminal(unstableFromRho(withInferredValues(input, { rho })));
  }

  const lambda = rho * values.mu;

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

  return generalServiceCandidate("mg1-mu-rho-like-serviceScv", input, {
    lambda,
    mu: values.mu,
    serviceScv: values.serviceScv,
  });
}

export function solveGeneralServiceMuFromKnownLambda(
  input: NormalizedInput,
  target: GeneralServiceMetricTarget,
): CandidateResult {
  const { values } = input;

  if (
    !has(values, "lambda") ||
    !has(values, "serviceScv") ||
    !has(values, target)
  ) {
    return { kind: "none" };
  }

  const targetIssue = validateGeneralServiceKnownLambdaTarget(
    target,
    values[target],
  );

  if (targetIssue !== undefined) {
    return terminal({ status: "inconsistent", issues: [targetIssue] });
  }

  const root = solveRhoForMetric((rho) => {
    const mu = values.lambda / rho;

    if (!isPositiveFinite(mu)) {
      return undefined;
    }

    return calculateGeneralServiceTargetMetric(
      input.modelKind,
      values.lambda,
      mu,
      values.serviceScv,
      target,
    );
  }, values[target]);

  if (!root.ok) {
    return terminal(noGeneralServiceStableMatch(target));
  }

  return solveGeneralServiceMuFromRho(input, root.value);
}

export function solveGeneralServiceLambdaFromKnownMu(
  input: NormalizedInput,
  target: GeneralServiceMetricTarget,
): CandidateResult {
  const { values } = input;

  if (
    !has(values, "mu") ||
    !has(values, "serviceScv") ||
    !has(values, target)
  ) {
    return { kind: "none" };
  }

  const targetIssue = validateGeneralServiceKnownMuTarget(
    target,
    values[target],
    values.mu,
  );

  if (targetIssue !== undefined) {
    return terminal({ status: "inconsistent", issues: [targetIssue] });
  }

  const root = solveRhoForMetric((rho) => {
    const lambda = rho * values.mu;

    if (!isPositiveFinite(lambda)) {
      return undefined;
    }

    return calculateGeneralServiceTargetMetric(
      input.modelKind,
      lambda,
      values.mu,
      values.serviceScv,
      target,
    );
  }, values[target]);

  if (!root.ok) {
    return terminal(noGeneralServiceStableMatch(target));
  }

  return solveGeneralServiceLambdaFromRho(input, root.value);
}

export function solveGeneralServiceRatesFromRhoAndTime(
  input: NormalizedInput,
  rho: number,
  target: TimeTarget,
): CandidateResult {
  const { values } = input;

  if (!has(values, "serviceScv") || !has(values, target)) {
    return { kind: "none" };
  }

  if (rho <= 0) {
    return terminal(invalidRhoForInference());
  }

  if (rho >= 1) {
    return terminal(unstableFromRho(withInferredValues(input, { rho })));
  }

  if (values[target] <= 0) {
    return terminal(strictlyPositiveIssue(target));
  }

  const referenceTime = calculateGeneralServiceTargetMetric(
    input.modelKind,
    rho,
    1,
    values.serviceScv,
    target,
  );

  if (referenceTime === undefined || !isPositiveFinite(referenceTime)) {
    return terminal(noGeneralServiceStableMatch(target));
  }

  const mu = referenceTime / values[target];
  const lambda = rho * mu;

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

  return generalServiceCandidate(`mg1-rho-like-${target}-serviceScv`, input, {
    lambda,
    mu,
    serviceScv: values.serviceScv,
  });
}

export function inferGeneralServiceRho(
  input: NormalizedInput,
):
  | { status: "ok"; rho: number }
  | { status: "none" }
  | { status: "terminal"; result: SolverResult } {
  const { values } = input;

  if (has(values, "P0")) {
    const issue = validateGeneralServiceProbabilityRhoTarget("P0", values.P0);

    if (issue !== undefined) {
      return {
        status: "terminal",
        result: { status: "inconsistent", issues: [issue] },
      };
    }

    return { status: "ok", rho: 1 - values.P0 };
  }

  if (has(values, "Pwait")) {
    const issue = validateGeneralServiceProbabilityRhoTarget(
      "Pwait",
      values.Pwait,
    );

    if (issue !== undefined) {
      return {
        status: "terminal",
        result: { status: "inconsistent", issues: [issue] },
      };
    }

    return { status: "ok", rho: values.Pwait };
  }

  return { status: "none" };
}
