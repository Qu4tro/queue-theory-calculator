import type {
  QueueInputMap,
  QueueVariableId,
  SolverIssue,
  SolverResult,
} from "../types";
import {
  ERLANG_A_RATE_INVERSE_TARGET_SUPPORT_MESSAGE,
  ERLANG_A_RATE_INVERSE_TARGETS,
} from "./erlang-a-targets";
import type { NormalizedInput } from "./normalize";

const FINITE_BASE_VARIABLES = [
  "lambda",
  "mu",
  "s",
  "K",
] as const satisfies readonly QueueVariableId[];
const FINITE_DERIVED_VARIABLES = [
  "lambdaEffective",
  "L",
  "Lq",
  "W",
  "Wq",
  "rho",
  "P0",
  "Pwait",
  "Pblock",
] as const satisfies readonly QueueVariableId[];
const FINITE_SCALE_VARIABLES = [
  "lambda",
  "mu",
  "lambdaEffective",
  "W",
  "Wq",
] as const satisfies readonly QueueVariableId[];
const FINITE_INVERSE_SHAPE_VARIABLES = [
  "L",
  "Lq",
  "rho",
  "P0",
  "Pwait",
  "Pblock",
] as const satisfies readonly QueueVariableId[];
const ERLANG_A_BASE_VARIABLES = [
  "lambda",
  "mu",
  "s",
  "theta",
] as const satisfies readonly QueueVariableId[];
const ERLANG_A_DERIVED_VARIABLES = [
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
const ERLANG_A_THETA_INVERSE_TARGETS = [
  "Lq",
  "Wq",
  "Pabandon",
  "abandonRate",
] as const satisfies readonly QueueVariableId[];
const GENERAL_SERVICE_METRIC_VARIABLES = [
  "L",
  "Lq",
  "W",
  "Wq",
] as const satisfies readonly QueueVariableId[];
const GENERAL_SERVICE_RHO_VARIABLES = [
  "rho",
  "P0",
  "Pwait",
] as const satisfies readonly QueueVariableId[];
const GENERAL_SERVICE_TIME_VARIABLES = [
  "W",
  "Wq",
] as const satisfies readonly QueueVariableId[];
const GGS_PROBABILITY_VARIABLES = [
  "P0",
  "Pwait",
] as const satisfies readonly QueueVariableId[];

export function classifyUnsolvedInput(input: NormalizedInput): SolverResult {
  if (input.modelKind === "mminf") {
    return classifyMmInfinityUnsolvedInput(input);
  }

  if (input.modelKind === "mmsk") {
    return classifyFiniteUnsolvedInput(input);
  }

  if (input.modelKind === "mg1" || input.modelKind === "md1") {
    return classifyGeneralServiceUnsolvedInput(input);
  }

  if (input.modelKind === "ggs") {
    return classifyGgSUnsolvedInput(input);
  }

  if (input.modelKind === "erlang-a") {
    return classifyErlangAUnsolvedInput(input);
  }

  const { values } = input;
  const suppliedCount = Object.keys(input.supplied).length;

  if (suppliedCount === 0) {
    return {
      status: "need-more-inputs",
      issues: [
        {
          code: "no-inputs",
          message:
            "Enter enough queue values to infer arrival rate, service rate, and servers.",
        },
      ],
    };
  }

  if (!has(values, "s")) {
    if (
      (has(values, "lambda") || has(values, "mu") || has(values, "rho")) &&
      hasAny(values, ["L", "Lq", "W", "Wq", "P0", "Pwait"])
    ) {
      return {
        status: "unsupported",
        issues: [
          {
            variable: "s",
            code: "unknown-server-count",
            message:
              "Solving for an unknown server count from derived metrics is not supported.",
          },
        ],
      };
    }

    return {
      status: "need-more-inputs",
      issues: [
        {
          variable: "s",
          code: "missing-server-count",
          message: "Enter the number of servers or use the M/M/1 model.",
        },
      ],
    };
  }

  if (
    hasAny(values, ["L", "Lq", "W", "Wq", "P0", "Pwait"]) &&
    !has(values, "lambda") &&
    !has(values, "mu") &&
    !has(values, "rho")
  ) {
    return {
      status: "need-more-inputs",
      issues: [
        {
          code: "missing-congestion-shape",
          message:
            "Add utilization, a base rate, or a scale-free metric such as L, Lq, P0, or Pwait to determine the queue shape.",
        },
      ],
    };
  }

  return {
    status: "need-more-inputs",
    issues: [
      {
        code: "insufficient-inputs",
        message:
          "The supplied values do not determine a unique queue; add an arrival rate, service rate, utilization, or time scale.",
      },
    ],
  };
}

function classifyMmInfinityUnsolvedInput(input: NormalizedInput): SolverResult {
  const { values } = input;
  const suppliedCount = Object.keys(input.supplied).length;

  if (suppliedCount === 0) {
    return {
      status: "need-more-inputs",
      issues: [
        {
          code: "no-inputs",
          message:
            "Enter enough M/M/∞ values to infer arrival and service rates.",
        },
      ],
    };
  }

  if (
    hasAny(values, ["a", "L", "P0"]) &&
    !hasAny(values, ["lambda", "mu", "W"])
  ) {
    return {
      status: "need-more-inputs",
      issues: [
        {
          code: "missing-rate-scale",
          message:
            "Offered-load shape values need an arrival rate, service rate, or W to set the time scale.",
        },
      ],
    };
  }

  return {
    status: "need-more-inputs",
    issues: [
      {
        code: "insufficient-inputs",
        message:
          "The supplied M/M/∞ values do not determine both lambda and mu.",
      },
    ],
  };
}

function classifyFiniteUnsolvedInput(input: NormalizedInput): SolverResult {
  const { values } = input;
  const suppliedCount = Object.keys(input.supplied).length;

  if (suppliedCount === 0) {
    return {
      status: "need-more-inputs",
      issues: [
        {
          code: "no-inputs",
          message:
            "Enter attempted arrival rate, service rate, servers, and capacity for M/M/s/K.",
        },
      ],
    };
  }

  const missingBase = FINITE_BASE_VARIABLES.filter(
    (variable) => !has(values, variable),
  );
  const hasDerivedInput = hasAny(values, FINITE_DERIVED_VARIABLES);
  const hasScaleInput = hasAny(values, FINITE_SCALE_VARIABLES);
  const hasInverseShapeInput = hasAny(values, FINITE_INVERSE_SHAPE_VARIABLES);

  if (hasDerivedInput && missingBase.length > 0) {
    if (!has(values, "s") && !has(values, "K")) {
      return {
        status: "need-more-inputs",
        issues: [
          {
            code: "finite-two-dimensional-search",
            message:
              "Finite-capacity inverse solving needs either s or K fixed; enter one of them before solving for the other.",
          },
        ],
      };
    }

    if (!hasScaleInput) {
      return {
        status: "need-more-inputs",
        issues: [
          {
            code: "missing-finite-scale",
            message:
              "Finite-capacity shape constraints need an arrival rate, service rate, or time-scale value.",
          },
        ],
      };
    }

    if (
      (!has(values, "lambda") || !has(values, "mu")) &&
      !hasInverseShapeInput
    ) {
      return {
        status: "need-more-inputs",
        issues: [
          {
            code: "missing-finite-shape",
            message:
              "Add L, Lq, rho, P0, Pwait, or Pblock to identify the finite-capacity shape.",
          },
        ],
      };
    }

    return {
      status: "need-more-inputs",
      issues: [
        {
          code: "finite-search-ambiguous",
          message:
            "This finite-capacity inverse input does not identify a unique queue; enter the missing base value or add another independent finite-capacity metric.",
        },
      ],
    };
  }

  if (missingBase.length > 0) {
    const firstMissing = missingBase[0];

    return {
      status: "need-more-inputs",
      issues: [
        {
          variable: firstMissing,
          code: `missing-${firstMissing}`,
          message:
            firstMissing === "K"
              ? "Enter system capacity, or enable K = s for a loss queue."
              : "Enter lambda, mu, s, and K to solve an M/M/s/K queue.",
        },
      ],
    };
  }

  return {
    status: "unsupported",
    issues: [
      {
        code: "finite-combination-unsupported",
        message:
          "This finite-capacity input combination is valid, but it does not match a supported direct or finite inverse path.",
      },
    ],
  };
}

function classifyGeneralServiceUnsolvedInput(
  input: NormalizedInput,
): SolverResult {
  const { values } = input;
  const suppliedCount = Object.keys(input.supplied).length;

  if (suppliedCount === 0) {
    return {
      status: "need-more-inputs",
      issues: [
        {
          code: "no-inputs",
          message:
            "Enter enough queue values to infer arrival rate and service rate.",
        },
      ],
    };
  }

  const canInferMg1ServiceScv =
    input.modelKind === "mg1" &&
    has(values, "lambda") &&
    has(values, "mu") &&
    hasAny(values, GENERAL_SERVICE_METRIC_VARIABLES);

  if (
    input.modelKind === "mg1" &&
    !has(values, "serviceScv") &&
    !canInferMg1ServiceScv
  ) {
    return {
      status: "need-more-inputs",
      issues: [
        {
          variable: "serviceScv",
          code: "service-scv-required",
          message: "M/G/1 requires a service SCV value.",
        },
      ],
    };
  }

  if (
    has(values, "serviceScv") &&
    !has(values, "lambda") &&
    !has(values, "mu") &&
    hasAny(values, [...GENERAL_SERVICE_RHO_VARIABLES, "L", "Lq"]) &&
    !hasAny(values, GENERAL_SERVICE_TIME_VARIABLES)
  ) {
    return {
      status: "need-more-inputs",
      issues: [
        {
          code: "missing-scale",
          message:
            "General-service shape constraints need an arrival rate, service rate, W, or Wq to set the time scale.",
        },
      ],
    };
  }

  if (
    has(values, "serviceScv") &&
    !has(values, "lambda") &&
    !has(values, "mu") &&
    hasAny(values, GENERAL_SERVICE_TIME_VARIABLES) &&
    !hasAny(values, [...GENERAL_SERVICE_RHO_VARIABLES, "L", "Lq"])
  ) {
    return {
      status: "need-more-inputs",
      issues: [
        {
          code: "missing-congestion-shape",
          message:
            "A general-service time value needs utilization, P0, Pwait, L, Lq, or a base rate to determine the queue shape.",
        },
      ],
    };
  }

  if (hasAny(values, ["L", "Lq", "W", "Wq", "P0", "Pwait"])) {
    return {
      status: "unsupported",
      issues: [
        {
          code: "mg1-inverse-unsupported",
          message:
            "This M/G/1 input combination is valid, but this version only implements rate, utilization, probability, and time-scale inverse paths.",
        },
      ],
    };
  }

  return {
    status: "need-more-inputs",
    issues: [
      {
        code: "insufficient-inputs",
        message:
          "Enter lambda and mu, or one rate plus traffic intensity, to solve this single-server general-service queue.",
      },
    ],
  };
}

function classifyGgSUnsolvedInput(input: NormalizedInput): SolverResult {
  const { values } = input;
  const suppliedCount = Object.keys(input.supplied).length;

  if (suppliedCount === 0) {
    return {
      status: "need-more-inputs",
      issues: [
        {
          code: "no-inputs",
          message:
            "Enter enough G/G/s values to infer arrival rate, service rate, and servers.",
        },
      ],
    };
  }

  if (!has(values, "s")) {
    return {
      status: "need-more-inputs",
      issues: [
        {
          variable: "s",
          code: "missing-server-count",
          message: "Enter the number of servers for the G/G/s approximation.",
        },
      ],
    };
  }

  if (
    hasAny(values, GGS_PROBABILITY_VARIABLES) &&
    !ggsVariabilityMatchesMmS(values)
  ) {
    return {
      status: "unsupported",
      issues: ggsUnsupportedProbabilityIssues(input),
    };
  }

  if (
    hasAny(values, ["L", "Lq", "W", "Wq", "P0", "Pwait"]) &&
    !has(values, "lambda") &&
    !has(values, "mu") &&
    !has(values, "rho")
  ) {
    return {
      status: "need-more-inputs",
      issues: [
        {
          code: "missing-congestion-shape",
          message:
            "G/G/s approximation constraints need a base rate or traffic intensity to determine the queue shape.",
        },
      ],
    };
  }

  if (hasAny(values, ["L", "Lq", "W", "Wq", "P0", "Pwait"])) {
    return {
      status: "unsupported",
      issues: [
        {
          code: "ggs-inverse-unsupported",
          message:
            "This G/G/s input combination is valid, but this version supports mean inverse solving only for one rate or rho with s, ca2, and cs2.",
        },
      ],
    };
  }

  return {
    status: "need-more-inputs",
    issues: [
      {
        code: "insufficient-inputs",
        message:
          "Enter lambda and mu, or one rate plus traffic intensity, with server count to solve this G/G/s approximation.",
      },
    ],
  };
}

function ggsVariabilityMatchesMmS(values: QueueInputMap): boolean {
  return (
    has(values, "ca2") &&
    has(values, "cs2") &&
    isNearlyOne(values.ca2) &&
    isNearlyOne(values.cs2)
  );
}

function ggsUnsupportedProbabilityIssues(
  input: NormalizedInput,
): SolverIssue[] {
  return GGS_PROBABILITY_VARIABLES.flatMap((variable) =>
    input.supplied[variable] === undefined
      ? []
      : [
          {
            variable,
            code: "ggs-probability-unsupported",
            message:
              "The G/G/s approximation does not determine P0 or Pwait from SCV inputs; those values are M/M/s baselines unless ca2 and cs2 are both 1.",
          },
        ],
  );
}

function isNearlyOne(value: number): boolean {
  const difference = Math.abs(value - 1);
  return (
    difference <= 1e-7 || difference <= 1e-6 * Math.max(1, Math.abs(value))
  );
}

function classifyErlangAUnsolvedInput(input: NormalizedInput): SolverResult {
  const { values } = input;
  const suppliedCount = Object.keys(input.supplied).length;

  if (suppliedCount === 0) {
    return {
      status: "need-more-inputs",
      issues: [
        {
          code: "no-inputs",
          message: "Enter lambda, mu, s, and theta to solve an M/M/s+M queue.",
        },
      ],
    };
  }

  const missingBase = ERLANG_A_BASE_VARIABLES.filter(
    (variable) => !has(values, variable),
  );
  const hasDerivedInput = hasAny(values, ERLANG_A_DERIVED_VARIABLES);
  const hasBaseInput = hasAny(values, ERLANG_A_BASE_VARIABLES);

  if (missingBase.length > 0) {
    if (hasDerivedInput && hasBaseInput) {
      const unsupported = classifyUnsupportedErlangAInverse(missingBase, input);

      if (unsupported !== undefined) {
        return unsupported;
      }

      return {
        status: "need-more-inputs",
        issues: [
          {
            variable: missingBase[0],
            code: `missing-${missingBase[0]}`,
            message:
              "Enter one supported Erlang A inverse target with the other base parameters.",
          },
        ],
      };
    }

    const firstMissing = missingBase[0];

    return {
      status: "need-more-inputs",
      issues: [
        {
          variable: firstMissing,
          code: `missing-${firstMissing}`,
          message: "Enter lambda, mu, s, and theta to solve M/M/s+M.",
        },
      ],
    };
  }

  return {
    status: "unsupported",
    issues: [
      {
        code: "erlang-a-combination-unsupported",
        message:
          "This Erlang A input combination is valid, but this version cannot infer it from the supplied values.",
      },
    ],
  };
}

function classifyUnsupportedErlangAInverse(
  missingBase: readonly QueueVariableId[],
  input: NormalizedInput,
): SolverResult | undefined {
  const { values } = input;

  if (missingBase.includes("s")) {
    return {
      status: "unsupported",
      issues: [
        {
          variable: "s",
          code: "erlang-a-server-count-inverse-unsupported",
          message:
            "Erlang A inverse solving does not infer server count; enter s directly.",
        },
      ],
    };
  }

  if (missingBase.length !== 1) {
    return {
      status: "unsupported",
      issues: [
        {
          code: "erlang-a-inverse-underdetermined",
          message:
            "Erlang A inverse solving needs exactly one missing base rate; enter three of lambda, mu, s, and theta plus a supported target.",
        },
      ],
    };
  }

  const missing = missingBase[0];

  if (missing === "lambda" || missing === "mu") {
    const target = firstPresent(values, ERLANG_A_DERIVED_VARIABLES);

    if (
      target !== undefined &&
      !includesQueueVariable(ERLANG_A_RATE_INVERSE_TARGETS, target)
    ) {
      return {
        status: "unsupported",
        issues: [
          {
            variable: target,
            code: "erlang-a-rate-target-unsupported",
            message: ERLANG_A_RATE_INVERSE_TARGET_SUPPORT_MESSAGE,
          },
        ],
      };
    }

    return undefined;
  }

  if (missing === "theta") {
    const target = firstPresent(values, ERLANG_A_DERIVED_VARIABLES);

    if (
      target !== undefined &&
      !includesQueueVariable(ERLANG_A_THETA_INVERSE_TARGETS, target)
    ) {
      return {
        status: "unsupported",
        issues: [
          {
            variable: target,
            code: "erlang-a-theta-target-unsupported",
            message:
              "Erlang A theta inversion supports Lq, Wq, Pabandon, or abandonRate.",
          },
        ],
      };
    }
  }

  return undefined;
}

function has<T extends QueueVariableId>(
  values: QueueInputMap,
  variable: T,
): values is QueueInputMap & Record<T, number> {
  return values[variable] !== undefined;
}

function hasAny(
  values: QueueInputMap,
  variables: readonly QueueVariableId[],
): boolean {
  return variables.some((variable) => has(values, variable));
}

function firstPresent<T extends QueueVariableId>(
  values: QueueInputMap,
  variables: readonly T[],
): T | undefined {
  return variables.find((variable) => has(values, variable));
}

function includesQueueVariable(
  variables: readonly QueueVariableId[],
  variable: QueueVariableId,
): boolean {
  return variables.includes(variable);
}
