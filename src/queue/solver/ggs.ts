import { calculateGgS } from "../gg-s";
import type { NormalizedInput } from "./normalize";
import { solveRhoForMetric } from "./root";
import {
  type CandidateResult,
  calculateGgSTargetMetric,
  firstPresent,
  formulaResultToSolverResult,
  GENERAL_SERVICE_METRIC_TARGETS,
  type GeneralServiceMetricTarget,
  GGS_KNOWN_LAMBDA_MEAN_TARGETS,
  type GgSKnownLambdaMeanTarget,
  ggSCandidate,
  has,
  invalidRhoForInference,
  isPositiveFinite,
  noGgSStableMatch,
  strictlyPositiveIssue,
  type TimeTarget,
  terminal,
  unstableFromRho,
  validateGgSKnownLambdaTarget,
  validateGgSKnownMuTarget,
  withInferredValues,
} from "./shared";

export function findGgSCandidate(input: NormalizedInput): CandidateResult {
  const { values } = input;

  if (!has(values, "ca2") || !has(values, "cs2")) {
    return { kind: "none" };
  }

  if (has(values, "lambda") && has(values, "mu") && has(values, "s")) {
    return ggSCandidate("ggs-lambda-mu-s-ca2-cs2", input, {
      lambda: values.lambda,
      mu: values.mu,
      s: values.s,
    });
  }

  if (has(values, "lambda") && has(values, "rho") && has(values, "s")) {
    if (values.rho <= 0) {
      return terminal(invalidRhoForInference());
    }

    if (values.rho >= 1) {
      return terminal(unstableFromRho(input));
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

    return ggSCandidate("ggs-lambda-rho-s-ca2-cs2", input, {
      lambda: values.lambda,
      mu,
      s: values.s,
    });
  }

  if (has(values, "lambda") && has(values, "s") && !has(values, "mu")) {
    const target = firstPresent(values, GGS_KNOWN_LAMBDA_MEAN_TARGETS);

    if (target !== undefined) {
      return solveGgSMuFromKnownLambda(input, target);
    }
  }

  if (has(values, "mu") && has(values, "rho") && has(values, "s")) {
    if (values.rho <= 0) {
      return terminal(invalidRhoForInference());
    }

    if (values.rho >= 1) {
      return terminal(unstableFromRho(input));
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

    return ggSCandidate("ggs-mu-rho-s-ca2-cs2", input, {
      lambda,
      mu: values.mu,
      s: values.s,
    });
  }

  if (has(values, "mu") && has(values, "s") && !has(values, "lambda")) {
    const target = firstPresent(values, GENERAL_SERVICE_METRIC_TARGETS);

    if (target !== undefined) {
      return solveGgSLambdaFromKnownMu(input, target);
    }
  }

  if (
    has(values, "rho") &&
    has(values, "s") &&
    !has(values, "lambda") &&
    !has(values, "mu")
  ) {
    if (has(values, "W")) {
      return solveGgSRatesFromRhoAndTime(input, values.rho, "W");
    }

    if (has(values, "Wq")) {
      return solveGgSRatesFromRhoAndTime(input, values.rho, "Wq");
    }
  }

  return { kind: "none" };
}

export function solveGgSMuFromKnownLambda(
  input: NormalizedInput,
  target: GgSKnownLambdaMeanTarget,
): CandidateResult {
  const { values } = input;

  if (
    !has(values, "lambda") ||
    !has(values, "s") ||
    !has(values, "ca2") ||
    !has(values, "cs2") ||
    !has(values, target)
  ) {
    return { kind: "none" };
  }

  const targetIssue = validateGgSKnownLambdaTarget(target, values[target]);

  if (targetIssue !== undefined) {
    return terminal({ status: "inconsistent", issues: [targetIssue] });
  }

  const root = solveRhoForMetric((rho) => {
    const mu = values.lambda / (values.s * rho);

    if (!isPositiveFinite(mu)) {
      return undefined;
    }

    return calculateGgSTargetMetric(input, values.lambda, mu, target);
  }, values[target]);

  if (!root.ok) {
    return terminal(noGgSStableMatch(target));
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

  return ggSCandidate(`ggs-lambda-s-${target}-ca2-cs2`, input, {
    lambda: values.lambda,
    mu,
    s: values.s,
  });
}

export function solveGgSLambdaFromKnownMu(
  input: NormalizedInput,
  target: GeneralServiceMetricTarget,
): CandidateResult {
  const { values } = input;

  if (
    !has(values, "mu") ||
    !has(values, "s") ||
    !has(values, "ca2") ||
    !has(values, "cs2") ||
    !has(values, target)
  ) {
    return { kind: "none" };
  }

  const targetIssue = validateGgSKnownMuTarget(
    target,
    values[target],
    values.mu,
  );

  if (targetIssue !== undefined) {
    return terminal({ status: "inconsistent", issues: [targetIssue] });
  }

  const root = solveRhoForMetric((rho) => {
    const lambda = rho * values.s * values.mu;

    if (!isPositiveFinite(lambda)) {
      return undefined;
    }

    return calculateGgSTargetMetric(input, lambda, values.mu, target);
  }, values[target]);

  if (!root.ok) {
    return terminal(noGgSStableMatch(target));
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

  return ggSCandidate(`ggs-mu-s-${target}-ca2-cs2`, input, {
    lambda,
    mu: values.mu,
    s: values.s,
  });
}

export function solveGgSRatesFromRhoAndTime(
  input: NormalizedInput,
  rho: number,
  target: TimeTarget,
): CandidateResult {
  const { values } = input;

  if (
    !has(values, "s") ||
    !has(values, "ca2") ||
    !has(values, "cs2") ||
    !has(values, target)
  ) {
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

  const reference = calculateGgS({
    modelKind: "ggs",
    lambda: rho * values.s,
    mu: 1,
    s: values.s,
    ca2: values.ca2,
    cs2: values.cs2,
  });

  if (reference.status !== "ok") {
    return terminal(
      formulaResultToSolverResult(reference, {
        modelKind: "ggs",
        lambda: rho * values.s,
        mu: 1,
        s: values.s,
        ca2: values.ca2,
        cs2: values.cs2,
      }),
    );
  }

  const referenceTime = reference.metrics[target];

  if (!isPositiveFinite(referenceTime)) {
    return terminal(noGgSStableMatch(target));
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

  return ggSCandidate(`ggs-rho-s-${target}-ca2-cs2`, input, {
    lambda,
    mu,
    s: values.s,
  });
}
