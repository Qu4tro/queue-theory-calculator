import type { NormalizedInput } from "./normalize";
import {
  type CandidateResult,
  has,
  mmInfinityCandidate,
  offeredLoadFromP0,
  strictlyPositiveIssue,
  terminal,
} from "./shared";

export function findMmInfinityCandidate(
  input: NormalizedInput,
): CandidateResult {
  const { values } = input;

  if (has(values, "lambda") && has(values, "mu")) {
    return mmInfinityCandidate("mminf-lambda-mu", {
      lambda: values.lambda,
      mu: values.mu,
    });
  }

  if (has(values, "lambda") && has(values, "W")) {
    if (values.W <= 0) {
      return terminal(strictlyPositiveIssue("W"));
    }

    return mmInfinityCandidate("mminf-lambda-W", {
      lambda: values.lambda,
      mu: 1 / values.W,
    });
  }

  if (has(values, "lambda") && has(values, "a")) {
    if (values.a <= 0) {
      return terminal(strictlyPositiveIssue("a"));
    }

    return mmInfinityCandidate("mminf-lambda-a", {
      lambda: values.lambda,
      mu: values.lambda / values.a,
    });
  }

  if (has(values, "lambda") && has(values, "L")) {
    if (values.L <= 0) {
      return terminal(strictlyPositiveIssue("L"));
    }

    return mmInfinityCandidate("mminf-lambda-L", {
      lambda: values.lambda,
      mu: values.lambda / values.L,
    });
  }

  if (has(values, "lambda") && has(values, "P0")) {
    const offeredLoad = offeredLoadFromP0(values.P0);

    if (offeredLoad.kind === "issue") {
      return terminal({
        status: "inconsistent",
        issues: [offeredLoad.issue],
      });
    }

    return mmInfinityCandidate("mminf-lambda-P0", {
      lambda: values.lambda,
      mu: values.lambda / offeredLoad.value,
    });
  }

  if (has(values, "mu") && has(values, "a")) {
    if (values.a <= 0) {
      return terminal(strictlyPositiveIssue("a"));
    }

    return mmInfinityCandidate("mminf-mu-a", {
      lambda: values.a * values.mu,
      mu: values.mu,
    });
  }

  if (has(values, "mu") && has(values, "L")) {
    if (values.L <= 0) {
      return terminal(strictlyPositiveIssue("L"));
    }

    return mmInfinityCandidate("mminf-mu-L", {
      lambda: values.L * values.mu,
      mu: values.mu,
    });
  }

  if (has(values, "mu") && has(values, "P0")) {
    const offeredLoad = offeredLoadFromP0(values.P0);

    if (offeredLoad.kind === "issue") {
      return terminal({
        status: "inconsistent",
        issues: [offeredLoad.issue],
      });
    }

    return mmInfinityCandidate("mminf-mu-P0", {
      lambda: offeredLoad.value * values.mu,
      mu: values.mu,
    });
  }

  if (has(values, "L") && has(values, "W")) {
    if (values.L <= 0) {
      return terminal(strictlyPositiveIssue("L"));
    }

    if (values.W <= 0) {
      return terminal(strictlyPositiveIssue("W"));
    }

    return mmInfinityCandidate("mminf-L-W", {
      lambda: values.L / values.W,
      mu: 1 / values.W,
    });
  }

  if (has(values, "W") && has(values, "a")) {
    if (values.W <= 0) {
      return terminal(strictlyPositiveIssue("W"));
    }

    if (values.a <= 0) {
      return terminal(strictlyPositiveIssue("a"));
    }

    return mmInfinityCandidate("mminf-W-a", {
      lambda: values.a / values.W,
      mu: 1 / values.W,
    });
  }

  if (has(values, "W") && has(values, "P0")) {
    if (values.W <= 0) {
      return terminal(strictlyPositiveIssue("W"));
    }

    const offeredLoad = offeredLoadFromP0(values.P0);

    if (offeredLoad.kind === "issue") {
      return terminal({
        status: "inconsistent",
        issues: [offeredLoad.issue],
      });
    }

    return mmInfinityCandidate("mminf-W-P0", {
      lambda: offeredLoad.value / values.W,
      mu: 1 / values.W,
    });
  }

  return { kind: "none" };
}
