import {
  abandonmentRatePositiveIssue,
  arrivalRatePositiveIssue,
  asFieldIssue,
  capacityAtLeastServersIssue,
  capacityIntegerMinIssue,
  isNonNegativeFinite,
  isPositiveFinite,
  isWholeNumberAtLeast,
  scvNonNegativeIssue,
  serverCountIntegerMinIssue,
  serviceRatePositiveIssue,
} from "../validation";
import {
  isMmInfinityStatsParams,
  normalizeStatsParams,
  type QueueStatsConfig,
  type QueueStatsParams,
  type QueueStatsThresholds,
  type QueueStatsValidationIssue,
  type QueueStatsValidationResult,
  type QueueTheoreticalMetrics,
} from "./types";

const DEFAULT_MIN_ARRIVALS = 200;
const DEFAULT_MIN_COMPLETIONS = 100;

export function createDefaultStatsThresholds(
  params: QueueStatsParams,
  theoretical?: Partial<QueueTheoreticalMetrics>,
): QueueStatsThresholds {
  const theoreticalW =
    theoretical && isPositiveFinite(theoretical.W)
      ? theoretical.W
      : 1 / params.mu;
  const effectiveRate =
    theoretical && isPositiveFinite(theoretical.lambdaEffective)
      ? theoretical.lambdaEffective
      : theoretical && isPositiveFinite(theoretical.throughput)
        ? theoretical.throughput
        : params.lambda;

  if (isMmInfinityStatsParams(params)) {
    return {
      warmupDuration: Math.max(
        100 / params.lambda,
        100 / params.mu,
        10 * theoreticalW,
      ),
      minComparisonDuration: Math.max(500 / params.lambda, 20 * theoreticalW),
      minArrivals: DEFAULT_MIN_ARRIVALS,
      minCompletions: DEFAULT_MIN_COMPLETIONS,
    };
  }

  return {
    warmupDuration: Math.max(
      100 / params.lambda,
      100 / effectiveRate,
      100 / (params.s * params.mu),
      10 * theoreticalW,
    ),
    minComparisonDuration: Math.max(
      500 / params.lambda,
      500 / effectiveRate,
      20 * theoreticalW,
    ),
    minArrivals: DEFAULT_MIN_ARRIVALS,
    minCompletions: DEFAULT_MIN_COMPLETIONS,
  };
}

export function validateQueueStatsConfig(
  config: QueueStatsConfig,
): QueueStatsValidationResult {
  const errors: QueueStatsValidationIssue[] = [];
  const { params } = config;
  const isMmInfinity = isMmInfinityStatsParams(params);

  if (!isPositiveFinite(params.lambda)) {
    errors.push(
      asFieldIssue(
        arrivalRatePositiveIssue(
          "Arrival rate must be a finite number greater than 0.",
        ),
      ),
    );
  }

  if (!isPositiveFinite(params.mu)) {
    errors.push(
      asFieldIssue(
        serviceRatePositiveIssue(
          "Service rate must be a finite number greater than 0.",
        ),
      ),
    );
  }

  if (!isMmInfinity && !isWholeNumberAtLeast(params.s, 1)) {
    errors.push(asFieldIssue(serverCountIntegerMinIssue()));
  }

  if (!isMmInfinity && params.K !== undefined) {
    if (!isWholeNumberAtLeast(params.K, 1)) {
      errors.push(asFieldIssue(capacityIntegerMinIssue()));
    } else if (isWholeNumberAtLeast(params.s, 1) && params.K < params.s) {
      errors.push(asFieldIssue(capacityAtLeastServersIssue()));
    }
  }

  if (!isMmInfinity && params.modelKind === "erlang-a") {
    if (!isPositiveFinite(params.theta)) {
      errors.push(
        asFieldIssue(
          abandonmentRatePositiveIssue(
            "Abandonment rate must be a finite number greater than 0.",
          ),
        ),
      );
    }

    if (params.K !== undefined) {
      errors.push({
        field: "K",
        code: "erlang-a-capacity-not-applicable",
        message: "M/M/s+M statistics do not use finite system capacity.",
      });
    }
  }

  if (!isMmInfinity && params.modelKind === "ggs") {
    if (!isNonNegativeFinite(params.ca2)) {
      errors.push(
        asFieldIssue(
          scvNonNegativeIssue("ca2", {
            message: "Arrival SCV must be a finite number of at least 0.",
          }),
        ),
      );
    }

    if (!isNonNegativeFinite(params.cs2)) {
      errors.push(
        asFieldIssue(
          scvNonNegativeIssue("cs2", {
            message: "Service SCV must be a finite number of at least 0.",
          }),
        ),
      );
    }
  }

  if (
    config.theoretical &&
    config.theoretical.W !== undefined &&
    !isPositiveFinite(config.theoretical.W)
  ) {
    errors.push({
      field: "theoretical.W",
      code: "theoretical-w-positive",
      message: "Theoretical W must be a finite number greater than 0.",
    });
  }

  if (errors.length > 0) {
    return { status: "invalid", errors };
  }

  if (
    !isMmInfinity &&
    params.modelKind !== "erlang-a" &&
    params.K === undefined &&
    params.lambda >= params.s * params.mu
  ) {
    return {
      status: "unstable",
      errors: [
        {
          field: "system",
          code: "system-unstable",
          message:
            "Statistics require a stable queueing system with arrival rate below total service capacity.",
        },
      ],
    };
  }

  const thresholds = {
    ...createDefaultStatsThresholds(params, config.theoretical),
    ...config.thresholds,
  };
  const thresholdErrors = validateThresholds(thresholds);

  if (thresholdErrors.length > 0) {
    return { status: "invalid", errors: thresholdErrors };
  }

  return {
    status: "ok",
    params: normalizeStatsParams(params),
    thresholds,
  };
}

function validateThresholds(
  thresholds: QueueStatsThresholds,
): QueueStatsValidationIssue[] {
  const errors: QueueStatsValidationIssue[] = [];

  if (!isNonNegativeFinite(thresholds.warmupDuration)) {
    errors.push({
      field: "warmupDuration",
      code: "warmup-nonnegative",
      message: "Warmup duration must be a finite number of at least 0.",
    });
  }

  if (!isNonNegativeFinite(thresholds.minComparisonDuration)) {
    errors.push({
      field: "minComparisonDuration",
      code: "comparison-duration-nonnegative",
      message:
        "Minimum comparison duration must be a finite number of at least 0.",
    });
  }

  if (
    !Number.isFinite(thresholds.minArrivals) ||
    !Number.isInteger(thresholds.minArrivals) ||
    thresholds.minArrivals < 0
  ) {
    errors.push({
      field: "minArrivals",
      code: "min-arrivals-integer-min",
      message: "Minimum arrivals must be a whole number of at least 0.",
    });
  }

  if (
    !Number.isFinite(thresholds.minCompletions) ||
    !Number.isInteger(thresholds.minCompletions) ||
    thresholds.minCompletions < 0
  ) {
    errors.push({
      field: "minCompletions",
      code: "min-completions-integer-min",
      message: "Minimum completions must be a whole number of at least 0.",
    });
  }

  return errors;
}
