import type {
  FieldDrafts,
  PendingTimeUnitConversion,
  TimeUnitDefinition,
  TimeUnitKey,
} from "./app-types";
import { formatDraftNumber, normalizeNegativeZero } from "./draft-format";
import {
  EMPTY_DISPLAY_PLACEHOLDER,
  formatMetricValue,
  formatProbabilityPointDifference,
  formatRelativeDifference,
} from "./format";
import type { MetricKey } from "./metrics";
import { PROBABILITY_KEYS, RATE_KEYS, TIME_KEYS } from "./model-config";
import { pluralTerm, type Terminology, termLabel } from "./terminology";

export const DEFAULT_TIME_UNIT: TimeUnitKey = "seconds";

const SIMULATION_CLOCK_FRACTION_DIGITS = {
  seconds: 1,
  minutes: 2,
  hours: 3,
} as const satisfies Record<TimeUnitKey, number>;

const SIMULATION_CLOCK_FORMATTERS = new Map<TimeUnitKey, Intl.NumberFormat>();

export const TIME_UNITS = [
  {
    key: "seconds",
    label: "Seconds",
    shortLabel: "s",
    singular: "second",
    seconds: 1,
  },
  {
    key: "minutes",
    label: "Minutes",
    shortLabel: "min",
    singular: "minute",
    seconds: 60,
  },
  {
    key: "hours",
    label: "Hours",
    shortLabel: "h",
    singular: "hour",
    seconds: 3600,
  },
] as const satisfies readonly TimeUnitDefinition[];

export function timeUnitDefinition(key: TimeUnitKey): TimeUnitDefinition {
  return TIME_UNITS.find((unit) => unit.key === key) ?? TIME_UNITS[0];
}

export function isRateOrTimeKey(key: MetricKey): boolean {
  return RATE_KEYS.includes(key) || TIME_KEYS.includes(key);
}

export function timeUnitConversionActionLabel(
  pendingConversion: PendingTimeUnitConversion,
): string {
  return `Convert values from ${pendingConversion.from} to ${pendingConversion.to}`;
}

export function metricValueToInternal(
  key: MetricKey,
  value: number,
  unitKey: TimeUnitKey,
): number {
  const unit = timeUnitDefinition(unitKey);

  if (RATE_KEYS.includes(key)) {
    return value / unit.seconds;
  }

  if (TIME_KEYS.includes(key)) {
    return value * unit.seconds;
  }

  return value;
}

export function metricValueFromInternal(
  key: MetricKey,
  value: number,
  unitKey: TimeUnitKey,
): number {
  const unit = timeUnitDefinition(unitKey);

  if (RATE_KEYS.includes(key)) {
    return value * unit.seconds;
  }

  if (TIME_KEYS.includes(key)) {
    return value / unit.seconds;
  }

  return value;
}

export function formatMetricForDisplay(
  key: MetricKey,
  value: number,
  unitKey: TimeUnitKey,
): string {
  return formatMetricValue(
    key,
    metricValueFromInternal(key, value, unitKey),
    PROBABILITY_KEYS.includes(key) ? { asPercent: false } : {},
  );
}

export function convertDraftsForTimeUnit(
  drafts: FieldDrafts,
  fromUnitKey: TimeUnitKey,
  toUnitKey: TimeUnitKey,
): FieldDrafts {
  const next = { ...drafts };

  for (const key of [...RATE_KEYS, ...TIME_KEYS]) {
    const raw = next[key];

    if (raw === undefined || raw.trim().length === 0) {
      continue;
    }

    const value = Number(raw.trim());

    if (!Number.isFinite(value)) {
      continue;
    }

    const internalValue = metricValueToInternal(key, value, fromUnitKey);
    const displayValue = metricValueFromInternal(key, internalValue, toUnitKey);

    if (Number.isFinite(displayValue)) {
      next[key] = formatDraftNumber(displayValue);
    }
  }

  return next;
}

export function formatTimeForDisplay(
  value: number | null | undefined,
  unitKey: TimeUnitKey,
): string {
  const unit = timeUnitDefinition(unitKey);
  const scaledValue =
    typeof value === "number" && Number.isFinite(value)
      ? normalizeNegativeZero(value / unit.seconds)
      : null;

  if (scaledValue === null) {
    return EMPTY_DISPLAY_PLACEHOLDER;
  }

  return `${simulationClockFormatter(unitKey).format(scaledValue)} ${
    unit.shortLabel
  }`;
}

function simulationClockFormatter(unitKey: TimeUnitKey): Intl.NumberFormat {
  const cached = SIMULATION_CLOCK_FORMATTERS.get(unitKey);

  if (cached !== undefined) {
    return cached;
  }

  const fractionDigits = SIMULATION_CLOCK_FRACTION_DIGITS[unitKey];
  const formatter = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
    useGrouping: true,
  });

  SIMULATION_CLOCK_FORMATTERS.set(unitKey, formatter);
  return formatter;
}

export function metricUnitLabel(
  key: MetricKey,
  terms: Terminology,
  unitKey: TimeUnitKey,
): string {
  const unit = timeUnitDefinition(unitKey);

  switch (key) {
    case "lambda":
    case "mu":
    case "theta":
    case "lambdaEffective":
    case "abandonRate":
    case "throughput":
      return `1/${unit.shortLabel}`;
    case "s":
      return pluralTerm(terms, "server");
    case "K":
      return pluralTerm(terms, "customer");
    case "serviceScv":
    case "ca2":
    case "cs2":
    case "offeredRho":
      return "ratio";
    case "a":
      return "erlangs";
    case "L":
    case "Ls":
    case "Lq":
      return pluralTerm(terms, "customer");
    case "W":
    case "Wq":
      return unit.shortLabel;
    case "rho":
    case "P0":
    case "Pbusy":
    case "Pwait":
    case "Pabandon":
    case "Pserved":
    case "Pblock":
      return "0-1";
  }
}

export function metricUnitDescription(
  key: MetricKey,
  terms: Terminology,
  unitKey: TimeUnitKey,
): string {
  const unit = timeUnitDefinition(unitKey);

  switch (key) {
    case "lambda":
      return `${pluralTerm(terms, "arrival")} per ${unit.singular}`;
    case "lambdaEffective":
      return `Accepted ${pluralTerm(terms, "arrival", {
        sentence: true,
      })} per ${unit.singular}`;
    case "mu":
      return `${pluralTerm(terms, "customer")} served per ${unit.singular} per ${termLabel(
        terms,
        "server",
        { sentence: true },
      )}`;
    case "theta":
      return `Patience expirations per waiting ${termLabel(terms, "customer", {
        sentence: true,
      })} per ${unit.singular}`;
    case "s":
      return `Number of ${pluralTerm(terms, "server", { sentence: true })}`;
    case "K":
      return `Maximum ${pluralTerm(terms, "customer", {
        sentence: true,
      })} allowed in ${termLabel(terms, "system", { sentence: true })}`;
    case "serviceScv":
      return "Squared coefficient of variation for service times";
    case "ca2":
      return "Squared coefficient of variation for interarrival times";
    case "cs2":
      return "Squared coefficient of variation for service times";
    case "a":
      return "Offered service load, equal to arrival rate divided by service rate";
    case "offeredRho":
      return `Offered ${termLabel(terms, "arrival", {
        sentence: true,
      })} load divided by total service capacity`;
    case "L":
    case "Ls":
    case "Lq":
      return `Mean number of ${pluralTerm(terms, "customer", {
        sentence: true,
      })}`;
    case "W":
    case "Wq":
      return unit.label;
    case "rho":
      return "Traffic intensity from 0 to 1";
    case "P0":
    case "Pbusy":
    case "Pwait":
    case "Pabandon":
    case "Pserved":
    case "Pblock":
      return "Probability from 0 to 1";
    case "abandonRate":
      return `${pluralTerm(terms, "customer")} abandoning per ${unit.singular}`;
    case "throughput":
      return `${pluralTerm(terms, "customer")} completing service per ${unit.singular}`;
  }
}

export function formatDifference(
  metric: MetricKey,
  absoluteDiff: number | null,
  relativeDiff: number | null,
  unitKey: TimeUnitKey,
): string {
  if (absoluteDiff === null) {
    return EMPTY_DISPLAY_PLACEHOLDER;
  }

  if (PROBABILITY_KEYS.includes(metric)) {
    return formatProbabilityPointDifference(absoluteDiff);
  }

  const absolute = formatMetricForDisplay(metric, absoluteDiff, unitKey);
  const relative =
    relativeDiff === null ? "" : ` (${formatRelativeDifference(relativeDiff)})`;

  return `${absolute}${relative}`;
}

export function isTimeUnitKey(value: string | null): value is TimeUnitKey {
  return TIME_UNITS.some((unit) => unit.key === value);
}
