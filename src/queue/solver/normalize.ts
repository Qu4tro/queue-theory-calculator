import { MAX_SERVERS_FOR_MATH } from "../mm-s";
import { MAX_CAPACITY_FOR_MATH } from "../mm-s-k";
import { isFiniteNumber } from "../numeric";
import type {
  QueueInputMap,
  QueueModelKind,
  QueueVariableId,
  SolverIssue,
  SolverResult,
} from "../types";
import { QUEUE_VARIABLES } from "../types";
import {
  abandonmentRatePositiveIssue,
  arrivalRatePositiveIssue,
  asVariableIssue,
  capacityIntegerMinIssue,
  capacityMaxIssue,
  isNonNegativeFinite,
  isPositiveFinite,
  isWholeNumberAtLeast,
  scvNonNegativeIssue,
  serverCountIntegerMinIssue,
  serverCountMaxIssue,
  serviceRatePositiveIssue,
} from "../validation";
import { nearlyEqual } from "./root";

export type NormalizedInput = {
  values: QueueInputMap;
  supplied: QueueInputMap;
  modelKind: QueueModelKind;
  lossPreset: boolean;
};

const FINITE_ONLY_VARIABLES = [
  "K",
  "lambdaEffective",
  "Pblock",
] as const satisfies readonly QueueVariableId[];
const MMINF_NOT_APPLICABLE_VARIABLES = [
  "s",
  "rho",
  "Pbusy",
] as const satisfies readonly QueueVariableId[];
const MMINF_NO_WAIT_VARIABLES = [
  "Lq",
  "Wq",
  "Pwait",
] as const satisfies readonly QueueVariableId[];
const GGS_VARIABILITY_VARIABLES = [
  "ca2",
  "cs2",
] as const satisfies readonly QueueVariableId[];
const ERLANG_A_ONLY_VARIABLES = [
  "theta",
  "offeredRho",
  "Ls",
  "abandonRate",
  "throughput",
  "Pabandon",
  "Pserved",
] as const satisfies readonly QueueVariableId[];
const ERLANG_A_FINITE_CONFLICT_VARIABLES = [
  "theta",
  "Ls",
  "abandonRate",
  "throughput",
  "Pabandon",
  "Pserved",
] as const satisfies readonly QueueVariableId[];
const ERLANG_A_ONLY_SUPPLIED_METRICS = [
  "offeredRho",
  "Ls",
  "abandonRate",
  "throughput",
  "Pabandon",
  "Pserved",
] as const satisfies readonly QueueVariableId[];

export function isErlangAOnlySuppliedMetric(
  variable: QueueVariableId,
): boolean {
  return (
    ERLANG_A_ONLY_SUPPLIED_METRICS as readonly QueueVariableId[]
  ).includes(variable);
}

export function normalizeInput(
  input: QueueInputMap,
  modelKind: QueueModelKind,
  lossPreset: boolean,
):
  | { status: "ok"; input: NormalizedInput }
  | { status: "error"; result: SolverResult } {
  const supplied: QueueInputMap = {};
  const values: QueueInputMap = {};
  const invalidIssues: SolverIssue[] = [];

  for (const id of QUEUE_VARIABLES) {
    const value = input[id];

    if (value === undefined) {
      continue;
    }

    const issue = validateVariableInput(id, value);

    if (issue !== undefined) {
      invalidIssues.push(issue);
      continue;
    }

    supplied[id] = value;
    values[id] = value;
  }

  if (invalidIssues.length > 0) {
    return {
      status: "error",
      result: { status: "invalid-input", issues: invalidIssues },
    };
  }

  const modelSelection = selectCompatibleModelKind(modelKind, supplied);

  if (modelSelection.status === "error") {
    return modelSelection;
  }

  const selectedModelKind = modelSelection.modelKind;

  if (
    selectedModelKind !== modelKind &&
    supplied.s === undefined &&
    isSingleServerModelKind(modelKind)
  ) {
    values.s = 1;
  }

  if (selectedModelKind === "ggs") {
    values.ca2 = values.ca2 ?? 1;
    values.cs2 = values.cs2 ?? 1;
    delete values.serviceScv;
    delete supplied.serviceScv;
  } else {
    for (const variable of GGS_VARIABILITY_VARIABLES) {
      delete values[variable];
      delete supplied[variable];
    }
  }

  if (isMarkovianModelKind(selectedModelKind)) {
    const serviceScv = supplied.serviceScv;

    if (serviceScv !== undefined && !nearlyEqual(serviceScv, 1)) {
      return {
        status: "error",
        result: {
          status: "inconsistent",
          issues: [
            {
              variable: "serviceScv",
              code: "markovian-service-scv-fixed",
              message:
                "M/M models use exponential service, so service SCV must be 1.",
            },
          ],
        },
      };
    }

    values.serviceScv = 1;
  }

  if (selectedModelKind === "mminf") {
    const mminfIssues = validateMmInfinitySuppliedInputs(supplied);

    if (mminfIssues.length > 0) {
      return {
        status: "error",
        result: {
          status: "inconsistent",
          issues: mminfIssues,
        },
      };
    }

    return {
      status: "ok",
      input: {
        values,
        supplied,
        modelKind: selectedModelKind,
        lossPreset: false,
      },
    };
  }

  if (
    supplied.rho !== undefined &&
    supplied.Pbusy !== undefined &&
    !nearlyEqual(supplied.rho, supplied.Pbusy)
  ) {
    return {
      status: "error",
      result: {
        status: "inconsistent",
        issues: [
          {
            variable: "Pbusy",
            code: "alias-mismatch",
            message:
              "Pbusy is an alias of rho and must match traffic intensity.",
          },
        ],
      },
    };
  }

  if (supplied.rho === undefined && supplied.Pbusy !== undefined) {
    values.rho = supplied.Pbusy;
  }

  if (selectedModelKind === "mm1") {
    if (supplied.s !== undefined && supplied.s !== 1) {
      return {
        status: "error",
        result: {
          status: "inconsistent",
          issues: [
            {
              variable: "s",
              code: "mm1-server-count",
              message: "M/M/1 models must use exactly one server.",
            },
          ],
        },
      };
    }

    values.s = 1;
  }

  if (selectedModelKind === "mg1" || selectedModelKind === "md1") {
    if (supplied.s !== undefined && supplied.s !== 1) {
      return {
        status: "error",
        result: {
          status: "inconsistent",
          issues: [
            {
              variable: "s",
              code: "single-server-model",
              message: "This model uses one server; s must be 1.",
            },
          ],
        },
      };
    }

    if (selectedModelKind === "md1") {
      const serviceScv = supplied.serviceScv;

      if (serviceScv !== undefined && !nearlyEqual(serviceScv, 0)) {
        return {
          status: "error",
          result: {
            status: "inconsistent",
            issues: [
              {
                variable: "serviceScv",
                code: "md1-service-scv-fixed",
                message:
                  "M/D/1 uses deterministic service, so service SCV must be 0.",
              },
            ],
          },
        };
      }

      values.serviceScv = 0;
    }

    values.s = 1;
  }

  if (selectedModelKind === "mmsk") {
    if (lossPreset && values.s !== undefined) {
      if (supplied.K !== undefined && supplied.K !== values.s) {
        return {
          status: "error",
          result: {
            status: "inconsistent",
            issues: [
              {
                variable: "K",
                code: "loss-preset-capacity",
                message:
                  "The K = s loss preset requires capacity to equal servers.",
              },
            ],
          },
        };
      }

      values.K = values.s;
    }

    if (
      values.K !== undefined &&
      values.s !== undefined &&
      values.K < values.s
    ) {
      return {
        status: "error",
        result: {
          status: "invalid-input",
          issues: [
            {
              variable: "K",
              code: "K-at-least-s",
              message:
                "Capacity must be a whole number at least as large as servers.",
            },
          ],
        },
      };
    }
  }

  return {
    status: "ok",
    input: { values, supplied, modelKind: selectedModelKind, lossPreset },
  };
}

function selectCompatibleModelKind(
  modelKind: QueueModelKind,
  supplied: QueueInputMap,
):
  | { status: "ok"; modelKind: QueueModelKind }
  | { status: "error"; result: SolverResult } {
  const finiteOnlyVariable = FINITE_ONLY_VARIABLES.find(
    (variable) => supplied[variable] !== undefined,
  );
  const erlangAVariables =
    finiteOnlyVariable === undefined
      ? ERLANG_A_ONLY_VARIABLES
      : ERLANG_A_FINITE_CONFLICT_VARIABLES;
  const erlangAOnlyVariable = erlangAVariables.find(
    (variable) => supplied[variable] !== undefined,
  );

  if (finiteOnlyVariable !== undefined && erlangAOnlyVariable !== undefined) {
    return {
      status: "error",
      result: {
        status: "unsupported",
        issues: [
          {
            variable: erlangAOnlyVariable,
            code: "model-selection-conflict",
            message:
              "Finite-capacity and Erlang A-specific metrics require different queueing models.",
          },
        ],
      },
    };
  }

  if (finiteOnlyVariable !== undefined) {
    return { status: "ok", modelKind: "mmsk" };
  }

  if (erlangAOnlyVariable !== undefined) {
    return { status: "ok", modelKind: "erlang-a" };
  }

  return { status: "ok", modelKind };
}

function validateMmInfinitySuppliedInputs(
  supplied: QueueInputMap,
): SolverIssue[] {
  const issues: SolverIssue[] = [];

  for (const variable of MMINF_NOT_APPLICABLE_VARIABLES) {
    if (supplied[variable] === undefined) {
      continue;
    }

    issues.push(mmInfinityNotApplicableIssue(variable));
  }

  for (const variable of MMINF_NO_WAIT_VARIABLES) {
    const value = supplied[variable];

    if (value === undefined || nearlyEqual(value, 0)) {
      continue;
    }

    issues.push({
      variable,
      code: "mminf-no-wait-metric",
      message:
        "M/M/∞ has immediate service, so queueing and wait metrics must be zero.",
    });
  }

  return issues;
}

function mmInfinityNotApplicableIssue(variable: QueueVariableId): SolverIssue {
  switch (variable) {
    case "s":
      return {
        variable,
        code: "mminf-server-count-not-applicable",
        message:
          "M/M/∞ has infinitely many servers; a finite server count is not applicable.",
      };
    case "rho":
      return {
        variable,
        code: "mminf-utilization-not-applicable",
        message: "Finite-server utilization is not defined for M/M/∞.",
      };
    case "Pbusy":
      return {
        variable,
        code: "mminf-busy-probability-not-applicable",
        message:
          "Busy-server probability for a finite server pool is not defined for M/M/∞.",
      };
    default:
      return {
        variable,
        code: "mminf-metric-not-applicable",
        message: `${variable} is not applicable to M/M/∞.`,
      };
  }
}

function validateVariableInput(
  variable: QueueVariableId,
  value: unknown,
): SolverIssue | undefined {
  if (variable === "serviceScv" || variable === "ca2" || variable === "cs2") {
    return isNonNegativeFinite(value)
      ? undefined
      : asVariableIssue(scvNonNegativeIssue(variable));
  }

  if (!isFiniteNumber(value) || Object.is(value, -0)) {
    return {
      variable,
      code: "finite-number",
      message: `${variable} must be a finite number.`,
    };
  }

  if (variable === "lambda") {
    return isPositiveFinite(value)
      ? undefined
      : asVariableIssue(arrivalRatePositiveIssue());
  }

  if (variable === "mu") {
    return isPositiveFinite(value)
      ? undefined
      : asVariableIssue(serviceRatePositiveIssue());
  }

  if (variable === "theta") {
    return isPositiveFinite(value)
      ? undefined
      : asVariableIssue(abandonmentRatePositiveIssue());
  }

  if (variable === "s") {
    if (!isWholeNumberAtLeast(value, 1)) {
      return asVariableIssue(serverCountIntegerMinIssue());
    }

    if (value > MAX_SERVERS_FOR_MATH) {
      return asVariableIssue(serverCountMaxIssue(MAX_SERVERS_FOR_MATH));
    }

    return undefined;
  }

  if (variable === "K") {
    if (!isWholeNumberAtLeast(value, 1)) {
      return asVariableIssue(capacityIntegerMinIssue());
    }

    if (value > MAX_CAPACITY_FOR_MATH) {
      return asVariableIssue(capacityMaxIssue(MAX_CAPACITY_FOR_MATH));
    }

    return undefined;
  }

  if (variable === "lambdaEffective") {
    return isPositiveFinite(value)
      ? undefined
      : {
          variable,
          code: "lambda-effective-positive",
          message: "Accepted arrival rate must be greater than 0.",
        };
  }

  if (variable === "offeredRho") {
    return isPositiveFinite(value)
      ? undefined
      : {
          variable,
          code: "offered-rho-positive",
          message: "Offered traffic ratio must be greater than 0.",
        };
  }

  if (variable === "a") {
    return isPositiveFinite(value)
      ? undefined
      : {
          variable,
          code: "offered-load-positive",
          message: "Offered load must be greater than 0.",
        };
  }

  if (variable === "abandonRate" || variable === "throughput") {
    return value >= 0
      ? undefined
      : {
          variable,
          code: "non-negative-rate",
          message: `${variable} must be greater than or equal to 0.`,
        };
  }

  if (variable === "rho" || variable === "Pbusy") {
    return value >= 0 && value <= 1
      ? undefined
      : {
          variable,
          code: "probability-range",
          message: `${variable} must be between 0 and 1.`,
        };
  }

  if (variable === "P0" || variable === "Pwait" || variable === "Pblock") {
    return value >= 0 && value <= 1
      ? undefined
      : {
          variable,
          code: "probability-range",
          message: `${variable} must be between 0 and 1.`,
        };
  }

  if (variable === "Pabandon" || variable === "Pserved") {
    return value >= 0 && value <= 1
      ? undefined
      : {
          variable,
          code: "probability-range",
          message: `${variable} must be between 0 and 1.`,
        };
  }

  return value >= 0
    ? undefined
    : {
        variable,
        code: "non-negative",
        message: `${variable} must be greater than or equal to 0.`,
      };
}

function isMarkovianModelKind(modelKind: QueueModelKind): boolean {
  return (
    modelKind === "mm1" ||
    modelKind === "mms" ||
    modelKind === "mmsk" ||
    modelKind === "mminf" ||
    modelKind === "erlang-a"
  );
}

function isSingleServerModelKind(modelKind: QueueModelKind): boolean {
  return modelKind === "mm1" || modelKind === "mg1" || modelKind === "md1";
}
