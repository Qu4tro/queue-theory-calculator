import type { QueueModelKind } from "../types";
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
  serverCountMaxIssue,
  serviceRatePositiveIssue,
} from "../validation";
import {
  DEFAULT_MAX_EVENTS_PER_ADVANCE,
  DEFAULT_MAX_SNAPSHOT_QUEUE_ITEMS,
  DEFAULT_MAX_SNAPSHOT_SERVERS,
  MAX_EVENTS_PER_ADVANCE,
  MAX_SIMULATION_SERVERS,
  MAX_SNAPSHOT_QUEUE_ITEMS,
  MAX_SNAPSHOT_SERVERS,
} from "./constants";
import { inferFiniteModelKind, isMmInfinitySimulationParams } from "./model";
import type {
  FiniteSimulationParams,
  NormalizedSimulationOptions,
  QueueSimulationOptions,
  ServiceTimeModel,
  SimulationParams,
  SimulationValidationIssue,
  SimulationValidationResult,
  ValidatedFiniteSimulationParams,
  ValidatedMmInfinitySimulationParams,
} from "./types";
import { SimulationParameterError } from "./types";

export function validateSimulationParams(
  params: SimulationParams,
): SimulationValidationResult {
  const errors: SimulationValidationIssue[] = [];
  const isMmInfinity = isMmInfinitySimulationParams(params);

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

  if (isMmInfinity) {
    const rawParams = params as { s?: unknown; K?: unknown };

    if (rawParams.s !== undefined) {
      errors.push({
        field: "s",
        code: "mminf-server-count-not-applicable",
        message: "M/M/∞ simulation does not accept a finite server count.",
      });
    }

    if (rawParams.K !== undefined) {
      errors.push({
        field: "K",
        code: "mminf-capacity-not-applicable",
        message: "M/M/∞ simulation does not use finite capacity.",
      });
    }
  }

  if (!isMmInfinity && !isWholeNumberAtLeast(params.s, 1)) {
    errors.push(asFieldIssue(serverCountIntegerMinIssue()));
  } else if (!isMmInfinity && params.s > MAX_SIMULATION_SERVERS) {
    errors.push(
      asFieldIssue(
        serverCountMaxIssue(
          MAX_SIMULATION_SERVERS,
          `Simulation supports ${MAX_SIMULATION_SERVERS} or fewer servers.`,
        ),
      ),
    );
  }

  if (!isMmInfinity && params.K !== undefined) {
    if (!isWholeNumberAtLeast(params.K, 1)) {
      errors.push(asFieldIssue(capacityIntegerMinIssue()));
    } else if (isWholeNumberAtLeast(params.s, 1) && params.K < params.s) {
      errors.push(asFieldIssue(capacityAtLeastServersIssue()));
    }
  }

  if (!isMmInfinity) {
    const modelKind = params.modelKind ?? inferFiniteModelKind(params);

    if (modelKind === "erlang-a") {
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
          message: "M/M/s+M simulation does not use finite system capacity.",
        });
      }
    }

    if (
      (modelKind === "mg1" || modelKind === "md1") &&
      Number.isFinite(params.s) &&
      params.s !== 1
    ) {
      errors.push({
        field: "s",
        code: "single-server-model",
        message: "This model uses one server; s must be 1.",
      });
    }

    if (modelKind === "mg1") {
      if (!isNonNegativeFinite(params.serviceScv)) {
        errors.push(
          asFieldIssue(
            scvNonNegativeIssue("serviceScv", {
              code: "service-scv-non-negative",
            }),
          ),
        );
      }
    } else if (modelKind === "md1") {
      if (
        params.serviceScv !== undefined &&
        (!Number.isFinite(params.serviceScv) || params.serviceScv !== 0)
      ) {
        errors.push({
          field: "serviceScv",
          code: "md1-service-scv-fixed",
          message:
            "M/D/1 uses deterministic service, so service SCV must be 0.",
        });
      }
    } else if (modelKind === "ggs") {
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
    } else if (
      params.serviceScv !== undefined &&
      (!Number.isFinite(params.serviceScv) || params.serviceScv !== 1)
    ) {
      errors.push({
        field: "serviceScv",
        code: "markovian-service-scv-fixed",
        message:
          "M/M models use exponential service, so service SCV must be 1.",
      });
    }

    validateServiceTimeModel(params.serviceTime, errors);
  }

  if (params.seed !== undefined && !Number.isFinite(params.seed)) {
    errors.push({
      field: "seed",
      code: "seed-finite",
      message: "Seed must be a finite number when supplied.",
    });
  }

  if (errors.length > 0) {
    return { status: "invalid", errors };
  }

  if (
    !isMmInfinity &&
    (params.modelKind ?? inferFiniteModelKind(params)) !== "erlang-a" &&
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
            "Simulation requires a stable queueing system with arrival rate below total service capacity.",
        },
      ],
    };
  }

  if (isMmInfinity) {
    const normalized: ValidatedMmInfinitySimulationParams = {
      modelKind: "mminf",
      lambda: params.lambda,
      mu: params.mu,
    };

    if (params.seed !== undefined) {
      normalized.seed = Math.trunc(params.seed);
    }

    return { status: "ok", params: normalized };
  }

  const modelKind = params.modelKind ?? inferFiniteModelKind(params);
  const serviceScv = serviceScvForFiniteModel(params, modelKind);
  const serviceTime =
    params.serviceTime ?? serviceTimeModelForFiniteModel(modelKind, serviceScv);
  const normalized: ValidatedFiniteSimulationParams = {
    modelKind,
    lambda: params.lambda,
    mu: params.mu,
    s: params.s,
    serviceTime,
  };

  if (params.K !== undefined) {
    normalized.K = params.K;
  }

  if (modelKind === "erlang-a") {
    normalized.theta = params.theta;
  }

  if (serviceScv !== undefined) {
    normalized.serviceScv = serviceScv;
  }

  if (modelKind === "ggs") {
    normalized.ca2 = params.ca2 ?? 1;
    normalized.cs2 = params.cs2 ?? 1;
  }

  if (params.seed !== undefined) {
    normalized.seed = Math.trunc(params.seed);
  }

  return { status: "ok", params: normalized };
}

export function normalizeSimulationOptions(
  options: QueueSimulationOptions,
): NormalizedSimulationOptions {
  const errors: SimulationValidationIssue[] = [];
  const maxEventsPerAdvance = normalizeIntegerOption(
    options.maxEventsPerAdvance,
    DEFAULT_MAX_EVENTS_PER_ADVANCE,
    1,
    MAX_EVENTS_PER_ADVANCE,
    "maxEventsPerAdvance",
    errors,
  );
  const maxSnapshotQueueItems = normalizeIntegerOption(
    options.maxSnapshotQueueItems,
    DEFAULT_MAX_SNAPSHOT_QUEUE_ITEMS,
    0,
    MAX_SNAPSHOT_QUEUE_ITEMS,
    "maxSnapshotQueueItems",
    errors,
  );
  const maxSnapshotServers = normalizeIntegerOption(
    options.maxSnapshotServers,
    DEFAULT_MAX_SNAPSHOT_SERVERS,
    0,
    MAX_SNAPSHOT_SERVERS,
    "maxSnapshotServers",
    errors,
  );

  if (errors.length > 0) {
    throw new SimulationParameterError(errors);
  }

  const normalized: NormalizedSimulationOptions = {
    maxEventsPerAdvance,
    maxSnapshotQueueItems,
    maxSnapshotServers,
    collectStats: options.collectStats ?? true,
  };

  if (options.theoreticalMetrics) {
    normalized.theoreticalMetrics = options.theoreticalMetrics;
  }

  if (options.statsThresholds) {
    normalized.statsThresholds = options.statsThresholds;
  }

  return normalized;
}

function validateServiceTimeModel(
  serviceTime: ServiceTimeModel | undefined,
  errors: SimulationValidationIssue[],
): void {
  if (serviceTime === undefined) {
    return;
  }

  if (
    serviceTime.kind === "gamma" &&
    !isPositiveFinite(serviceTime.serviceScv)
  ) {
    errors.push({
      field: "serviceTime",
      code: "gamma-service-scv-positive",
      message:
        "Gamma service-time sampling requires service SCV to be greater than 0.",
    });
  }
}

function serviceScvForFiniteModel(
  params: FiniteSimulationParams,
  modelKind: Exclude<QueueModelKind, "mminf">,
): number | undefined {
  if (modelKind === "md1") {
    return 0;
  }

  if (modelKind === "mg1") {
    return params.serviceScv;
  }

  if (modelKind === "ggs") {
    return params.cs2;
  }

  return params.serviceScv;
}

function serviceTimeModelForFiniteModel(
  modelKind: Exclude<QueueModelKind, "mminf">,
  serviceScv: number | undefined,
): ServiceTimeModel {
  if (modelKind === "md1" || serviceScv === 0) {
    return { kind: "deterministic" };
  }

  if (
    (modelKind === "mg1" || modelKind === "ggs") &&
    serviceScv !== undefined
  ) {
    return serviceScv === 1
      ? { kind: "exponential" }
      : { kind: "gamma", serviceScv };
  }

  return { kind: "exponential" };
}

function normalizeIntegerOption(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
  field: keyof QueueSimulationOptions,
  errors: SimulationValidationIssue[],
): number {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isFinite(value) || !Number.isInteger(value) || value < min) {
    errors.push({
      field,
      code: `${String(field)}-integer-min`,
      message: `${String(field)} must be a whole number of at least ${min}.`,
    });
    return fallback;
  }

  return Math.min(value, max);
}
