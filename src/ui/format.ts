import { clamp } from "./math";
import {
  getMetricValueKind,
  type MetricKey,
  type MetricValueKind,
} from "./metrics";

export const DEFAULT_SIGNIFICANT_DIGITS = 4;
export const EMPTY_DISPLAY_PLACEHOLDER = "--";
export const NOT_APPLICABLE_DISPLAY = "N/A";

const DEFAULT_LOCALE = "en-US";
const MIN_SCIENTIFIC_ABSOLUTE_VALUE = 0.0001;
const MAX_DECIMAL_ABSOLUTE_VALUE = 1_000_000_000;
const INTEGER_NUMBER_FORMAT = new Intl.NumberFormat(DEFAULT_LOCALE, {
  maximumFractionDigits: 0,
  useGrouping: true,
});
const SIGNIFICANT_NUMBER_FORMATS = new Map<number, Intl.NumberFormat>();

export type NumericDisplayValue = number | string | null | undefined;

export type NumericFormatOptions = {
  significantDigits?: number;
  placeholder?: string;
  signed?: boolean;
  unit?: string;
  unitSeparator?: string;
  forceScientific?: boolean;
};

export type ProbabilityFormatOptions = NumericFormatOptions & {
  asPercent?: boolean;
  clamp?: boolean;
};

export type RateFormatOptions = NumericFormatOptions & {
  perUnit?: string;
};

export function hasDisplayNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function toDisplayNumber(value: NumericDisplayValue): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? normalizeNegativeZero(value) : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return null;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? normalizeNegativeZero(parsed) : null;
  }

  return null;
}

export function displayOrPlaceholder(
  value: string | null | undefined,
  placeholder = EMPTY_DISPLAY_PLACEHOLDER,
): string {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : placeholder;
}

export function formatNumber(
  value: NumericDisplayValue,
  options: NumericFormatOptions = {},
): string {
  const numberValue = toDisplayNumber(value);

  if (numberValue === null) {
    return options.placeholder ?? EMPTY_DISPLAY_PLACEHOLDER;
  }

  const digits = normalizeSignificantDigits(options.significantDigits);
  const signedPrefix = options.signed && numberValue > 0 ? "+" : "";
  const unit = options.unit
    ? `${options.unitSeparator ?? " "}${options.unit}`
    : "";

  return `${signedPrefix}${formatFiniteNumber(numberValue, digits, {
    forceScientific: options.forceScientific,
  })}${unit}`;
}

export function formatInteger(
  value: NumericDisplayValue,
  options: NumericFormatOptions = {},
): string {
  const numberValue = toDisplayNumber(value);

  if (numberValue === null) {
    return options.placeholder ?? EMPTY_DISPLAY_PLACEHOLDER;
  }

  const rounded = Math.round(numberValue);
  const signedPrefix = options.signed && rounded > 0 ? "+" : "";
  const unit = options.unit
    ? `${options.unitSeparator ?? " "}${options.unit}`
    : "";
  const formatted = INTEGER_NUMBER_FORMAT.format(rounded);

  return `${signedPrefix}${formatted}${unit}`;
}

export function formatCount(
  value: NumericDisplayValue,
  options: NumericFormatOptions = {},
): string {
  return formatNumber(value, options);
}

export function formatTime(
  value: NumericDisplayValue,
  options: NumericFormatOptions = {},
): string {
  return formatNumber(value, options);
}

export function formatRate(
  value: NumericDisplayValue,
  options: RateFormatOptions = {},
): string {
  const perUnit = options.perUnit ? `/${options.perUnit}` : undefined;

  return formatNumber(value, {
    ...options,
    unit: options.unit ?? perUnit,
    unitSeparator: options.unitSeparator ?? (options.unit ? " " : ""),
  });
}

export function formatProbability(
  value: NumericDisplayValue,
  options: ProbabilityFormatOptions = {},
): string {
  const numberValue = toDisplayNumber(value);

  if (numberValue === null) {
    return options.placeholder ?? EMPTY_DISPLAY_PLACEHOLDER;
  }

  const probability = options.clamp ? clamp(numberValue, 0, 1) : numberValue;

  if (options.asPercent === false) {
    return formatNumber(probability, options);
  }

  return formatNumber(probability * 100, {
    ...options,
    unit: "%",
    unitSeparator: "",
  });
}

export function formatProbabilityPointDifference(
  value: NumericDisplayValue,
  options: NumericFormatOptions = {},
): string {
  const numberValue = toDisplayNumber(value);

  if (numberValue === null) {
    return options.placeholder ?? EMPTY_DISPLAY_PLACEHOLDER;
  }

  return formatNumber(numberValue * 100, {
    ...options,
    signed: options.signed ?? true,
    unit: "pp",
  });
}

export function formatRelativeDifference(
  value: NumericDisplayValue,
  options: ProbabilityFormatOptions = {},
): string {
  return formatProbability(value, {
    ...options,
    signed: options.signed ?? true,
  });
}

export function formatMetricValue(
  key: MetricKey,
  value: NumericDisplayValue,
  options: ProbabilityFormatOptions = {},
): string {
  const kind = getMetricValueKind(key);
  return formatValueByKind(
    kind,
    value,
    kind === "probability" ? { asPercent: false, ...options } : options,
  );
}

export function formatValueByKind(
  kind: MetricValueKind,
  value: NumericDisplayValue,
  options: ProbabilityFormatOptions = {},
): string {
  switch (kind) {
    case "integer":
      return formatInteger(value, options);
    case "count":
    case "dimensionless":
      return formatCount(value, options);
    case "time":
      return formatTime(value, options);
    case "rate":
      return formatRate(value, options);
    case "probability":
      return formatProbability(value, options);
  }
}

function normalizeSignificantDigits(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return DEFAULT_SIGNIFICANT_DIGITS;
  }

  return clamp(value, 1, 15);
}

function formatFiniteNumber(
  value: number,
  significantDigits: number,
  options: Pick<NumericFormatOptions, "forceScientific">,
): string {
  const normalized = normalizeNegativeZero(value);

  if (normalized === 0) {
    return "0";
  }

  const absolute = Math.abs(normalized);
  const useScientific =
    options.forceScientific === true ||
    absolute < MIN_SCIENTIFIC_ABSOLUTE_VALUE ||
    absolute >= MAX_DECIMAL_ABSOLUTE_VALUE;

  if (useScientific) {
    return normalizeExponent(normalized.toPrecision(significantDigits));
  }

  return getSignificantNumberFormat(significantDigits).format(normalized);
}

function getSignificantNumberFormat(
  significantDigits: number,
): Intl.NumberFormat {
  const cached = SIGNIFICANT_NUMBER_FORMATS.get(significantDigits);

  if (cached !== undefined) {
    return cached;
  }

  const formatter = new Intl.NumberFormat(DEFAULT_LOCALE, {
    maximumSignificantDigits: significantDigits,
    useGrouping: true,
  });
  SIGNIFICANT_NUMBER_FORMATS.set(significantDigits, formatter);
  return formatter;
}

function normalizeExponent(value: string): string {
  const exponentIndex = value.search(/[eE]/);

  if (exponentIndex === -1) {
    return value;
  }

  const mantissa = value.slice(0, exponentIndex);
  const exponent = value.slice(exponentIndex + 1);
  const normalizedMantissa = mantissa.includes(".")
    ? mantissa.replace(/0+$/, "").replace(/\.$/, "")
    : mantissa;
  const normalizedExponent = exponent.startsWith("+")
    ? exponent.slice(1)
    : exponent;

  return `${normalizedMantissa}e${normalizedExponent}`;
}

function normalizeNegativeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}
