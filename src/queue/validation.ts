import { isFiniteNumber as numericIsFiniteNumber } from "./numeric";
import type { QueueVariableId } from "./types";

export interface QueueValidationIssue<
  Variable extends QueueVariableId = QueueVariableId,
> {
  variable: Variable;
  code: string;
  message: string;
}

export interface FieldValidationIssue<Field extends string> {
  field: Field;
  code: string;
  message: string;
}

export interface VariableValidationIssue<Variable extends string> {
  variable: Variable;
  code: string;
  message: string;
}

export function isPositiveFinite(value: unknown): value is number {
  return numericIsFiniteNumber(value) && value > 0;
}

export function isNonNegativeFinite(
  value: unknown,
  options: { allowNegativeZero?: boolean } = {},
): value is number {
  return (
    numericIsFiniteNumber(value) &&
    (options.allowNegativeZero === true || !Object.is(value, -0)) &&
    value >= 0
  );
}

export function isWholeNumberAtLeast(
  value: unknown,
  minimum: number,
): value is number {
  return (
    numericIsFiniteNumber(value) && Number.isInteger(value) && value >= minimum
  );
}

export function asFieldIssue<Variable extends QueueVariableId>(
  issue: QueueValidationIssue<Variable>,
): FieldValidationIssue<Variable> {
  return {
    field: issue.variable,
    code: issue.code,
    message: issue.message,
  };
}

export function asVariableIssue<Variable extends QueueVariableId>(
  issue: QueueValidationIssue<Variable>,
): VariableValidationIssue<Variable> {
  return issue;
}

export function arrivalRatePositiveIssue(
  message = "Arrival rate must be greater than 0.",
): QueueValidationIssue<"lambda"> {
  return {
    variable: "lambda",
    code: "lambda-positive",
    message,
  };
}

export function serviceRatePositiveIssue(
  message = "Service rate must be greater than 0.",
): QueueValidationIssue<"mu"> {
  return {
    variable: "mu",
    code: "mu-positive",
    message,
  };
}

export function abandonmentRatePositiveIssue(
  message = "Abandonment rate must be greater than 0.",
): QueueValidationIssue<"theta"> {
  return {
    variable: "theta",
    code: "theta-positive",
    message,
  };
}

export function serverCountIntegerMinIssue(): QueueValidationIssue<"s"> {
  return {
    variable: "s",
    code: "s-integer-min",
    message: "Servers must be a whole number of at least 1.",
  };
}

export function serverCountMaxIssue(
  max: number,
  message = `Servers must be ${max} or fewer for formula calculations.`,
): QueueValidationIssue<"s"> {
  return {
    variable: "s",
    code: "s-max",
    message,
  };
}

export function capacityIntegerMinIssue(): QueueValidationIssue<"K"> {
  return {
    variable: "K",
    code: "K-integer-min",
    message: "Capacity must be a whole number of at least 1.",
  };
}

export function capacityMaxIssue(
  max: number,
  message = `Capacity must be ${max} or fewer for formula calculations.`,
): QueueValidationIssue<"K"> {
  return {
    variable: "K",
    code: "K-max",
    message,
  };
}

export function capacityAtLeastServersIssue(): QueueValidationIssue<"K"> {
  return {
    variable: "K",
    code: "K-at-least-s",
    message: "Capacity must be at least as large as servers.",
  };
}

export function scvNonNegativeIssue<
  Variable extends "serviceScv" | "ca2" | "cs2",
>(
  variable: Variable,
  options: { code?: string; message?: string } = {},
): QueueValidationIssue<Variable> {
  const label = variable === "ca2" ? "Arrival SCV" : "Service SCV";

  return {
    variable,
    code: options.code ?? `${variable}-non-negative`,
    message: options.message ?? `${label} must be greater than or equal to 0.`,
  };
}
