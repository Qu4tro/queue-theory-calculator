import type {
  QueueInputMap,
  QueueModelKind,
  QueueVariableId,
  SolverIssue,
  SolverResult,
} from "../queue/types";
import type {
  FieldDrafts,
  FieldErrors,
  ParsedView,
  PendingSolverResult,
  TimeUnitKey,
  UiSolverResult,
} from "./app-types";
import { formatRandomDraftNumber } from "./draft-format";
import { METRIC_KEYS, type MetricKey } from "./metrics";
import {
  DEFAULT_QUEUE_MODEL,
  ERLANG_A_QUERY_KEYS,
  FINITE_QUERY_KEYS,
  GGS_QUERY_KEYS,
  isFixedSingleServerMode,
  MMINF_DROPPED_QUERY_KEYS,
  MMINF_QUERY_KEYS,
  POSITIVE_RATE_KEYS,
  PROBABILITY_KEYS,
  RATE_KEYS,
} from "./model-config";
import { metricLabelParts, type Terminology } from "./terminology";
import { metricValueFromInternal, metricValueToInternal } from "./time-units";

export function buildParsedView(
  drafts: FieldDrafts,
  unitKey: TimeUnitKey,
  terms: Terminology,
  solverResult: UiSolverResult,
): ParsedView {
  const parsed = parseDrafts(drafts, unitKey, terms);

  if (Object.keys(parsed.fieldErrors).length > 0) {
    return {
      ...parsed,
      result: invalidResultFromFieldErrors(parsed.fieldErrors),
    };
  }

  return {
    ...parsed,
    result: solverResult,
  };
}

export function pendingSolverResult(): PendingSolverResult {
  return { status: "pending", issues: [] };
}

export function invalidResultFromFieldErrors(
  fieldErrors: FieldErrors,
): SolverResult {
  const issues: SolverIssue[] = Object.entries(fieldErrors).map(
    ([variable, message]) => ({
      code: "ui-parse-error",
      message,
      variable: variable as QueueVariableId,
    }),
  );

  return { status: "invalid-input", issues };
}

export function parseDrafts(
  drafts: FieldDrafts,
  unitKey: TimeUnitKey,
  terms: Terminology,
): { input: QueueInputMap; fieldErrors: FieldErrors } {
  const inputMap: QueueInputMap = {};
  const fieldErrors: FieldErrors = {};

  for (const key of METRIC_KEYS) {
    if (key === "Pbusy") {
      continue;
    }

    const raw = drafts[key];

    if (raw === undefined || raw.trim().length === 0) {
      continue;
    }

    const parsed = parseDraft(key, raw, unitKey, terms);

    if (parsed.status === "invalid") {
      fieldErrors[key] = parsed.message;
      continue;
    }

    inputMap[key] = parsed.value;
  }

  return { input: inputMap, fieldErrors };
}

function parseDraft(
  key: MetricKey,
  raw: string,
  unitKey: TimeUnitKey,
  terms: Terminology,
): { status: "ok"; value: number } | { status: "invalid"; message: string } {
  const value = Number(raw.trim());

  if (!Number.isFinite(value) || Object.is(value, -0)) {
    return { status: "invalid", message: `${key} must be a finite number.` };
  }

  if (POSITIVE_RATE_KEYS.includes(key)) {
    return value > 0
      ? { status: "ok", value: metricValueToInternal(key, value, unitKey) }
      : { status: "invalid", message: `${key} must be greater than 0.` };
  }

  if (RATE_KEYS.includes(key)) {
    return value >= 0
      ? { status: "ok", value: metricValueToInternal(key, value, unitKey) }
      : {
          status: "invalid",
          message: `${key} must be greater than or equal to 0.`,
        };
  }

  if (key === "s" || key === "K") {
    return Number.isInteger(value) && value >= 1
      ? { status: "ok", value }
      : {
          status: "invalid",
          message: `${key} must be a whole number of at least 1.`,
        };
  }

  if (key === "serviceScv" || key === "ca2" || key === "cs2") {
    const label = metricLabelParts(key, terms).label;

    return value >= 0
      ? { status: "ok", value }
      : {
          status: "invalid",
          message: `${label} must be greater than or equal to 0.`,
        };
  }

  if (PROBABILITY_KEYS.includes(key)) {
    return value >= 0 && value <= 1
      ? { status: "ok", value: metricValueToInternal(key, value, unitKey) }
      : { status: "invalid", message: `${key} must be between 0 and 1.` };
  }

  if (key === "offeredRho") {
    return value > 0
      ? { status: "ok", value }
      : {
          status: "invalid",
          message: "offeredRho must be greater than 0.",
        };
  }

  if (key === "a") {
    return value > 0
      ? { status: "ok", value }
      : {
          status: "invalid",
          message: "Offered load must be greater than 0.",
        };
  }

  return value >= 0
    ? { status: "ok", value: metricValueToInternal(key, value, unitKey) }
    : { status: "invalid", message: `${key} must be at least 0.` };
}

export function cleanupDraftsForMode(
  drafts: FieldDrafts,
  mode: QueueModelKind,
  lossPreset = false,
): FieldDrafts {
  const next = { ...drafts };

  if (mode === "mminf") {
    for (const key of MMINF_DROPPED_QUERY_KEYS) {
      delete next[key];
    }
    return next;
  }

  if (isFixedSingleServerMode(mode)) {
    delete next.s;
  }

  for (const key of MMINF_QUERY_KEYS) {
    delete next[key];
  }

  if (mode !== "mg1") {
    delete next.serviceScv;
  }

  if (mode !== "ggs") {
    for (const key of GGS_QUERY_KEYS) {
      delete next[key];
    }
  }

  if (mode !== "erlang-a") {
    for (const key of ERLANG_A_QUERY_KEYS) {
      delete next[key];
    }
  }

  if (mode !== "mmsk") {
    for (const key of FINITE_QUERY_KEYS) {
      delete next[key];
    }
  } else if (lossPreset) {
    return normalizeLossPresetDrafts(next);
  }

  return next;
}

export function normalizeLossPresetDrafts(drafts: FieldDrafts): FieldDrafts {
  const next = { ...drafts };
  const serverCount = parsePositiveIntegerDraft(next.s ?? "");

  if (serverCount === null) {
    delete next.K;
    return next;
  }

  next.K = serverCount.toString();
  return next;
}

export function parsePositiveIntegerDraft(value: string): number | null {
  const parsed = Number(value.trim());

  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= 1
    ? parsed
    : null;
}

export function randomValidDrafts(
  mode: QueueModelKind,
  unitKey: TimeUnitKey,
): { drafts: FieldDrafts; lossPreset: boolean } {
  if (mode === "mminf") {
    const displayMu = randomDraftBetween(0.8, 6);
    const internalMu = metricValueToInternal("mu", displayMu, unitKey);
    const offeredLoad = randomDraftBetween(0.35, 5.5);
    const internalLambda = offeredLoad * internalMu;

    return {
      drafts: {
        lambda: formatRandomDraftNumber(
          metricValueFromInternal("lambda", internalLambda, unitKey),
        ),
        mu: formatRandomDraftNumber(displayMu),
      },
      lossPreset: false,
    };
  }

  if (mode === "erlang-a") {
    const serverCount = randomInteger(1, 6);
    const displayMu = randomDraftBetween(0.8, 6);
    const displayTheta = randomDraftBetween(0.25, 3.5);
    const internalMu = metricValueToInternal("mu", displayMu, unitKey);
    const offeredRho = randomDraftBetween(0.45, 1.55);
    const internalLambda = offeredRho * serverCount * internalMu;

    return {
      drafts: {
        lambda: formatRandomDraftNumber(
          metricValueFromInternal("lambda", internalLambda, unitKey),
        ),
        mu: formatRandomDraftNumber(displayMu),
        s: serverCount.toString(),
        theta: formatRandomDraftNumber(displayTheta),
      },
      lossPreset: false,
    };
  }

  const serverCount =
    mode === "mm1" || mode === "mg1" || mode === "md1"
      ? 1
      : mode === "mms" || mode === "ggs"
        ? randomInteger(2, 6)
        : randomInteger(1, 6);
  const lossPreset = mode === "mmsk" && Math.random() < 0.22;
  const capacity =
    mode === "mmsk"
      ? lossPreset
        ? serverCount
        : serverCount + randomInteger(1, 12)
      : undefined;
  const utilization =
    mode === "mmsk"
      ? randomDraftBetween(0.45, 1.65)
      : randomDraftBetween(0.28, 0.84);
  const displayMu = randomDraftBetween(0.8, 6);
  const internalMu = metricValueToInternal("mu", displayMu, unitKey);
  const internalLambda = utilization * serverCount * internalMu;
  const next: FieldDrafts = {
    lambda: formatRandomDraftNumber(
      metricValueFromInternal("lambda", internalLambda, unitKey),
    ),
    mu: formatRandomDraftNumber(displayMu),
  };

  if (mode === "mg1") {
    next.serviceScv = formatRandomDraftNumber(randomDraftBetween(0, 3));
  }

  if (mode === "ggs") {
    const ca2 = randomDraftBetween(0.15, 2.8);
    const cs2 =
      Math.abs(ca2 - 1) < 0.15
        ? randomDraftBetween(1.35, 3.2)
        : randomDraftBetween(0, 3.2);
    next.s = serverCount.toString();
    next.ca2 = formatRandomDraftNumber(ca2);
    next.cs2 = formatRandomDraftNumber(cs2);
  }

  if (mode === "mms") {
    next.s = serverCount.toString();
  }

  if (mode === "mmsk") {
    next.s = serverCount.toString();
    next.K = String(capacity ?? serverCount);
  }

  return { drafts: next, lossPreset };
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomDraftBetween(min: number, max: number): number {
  return Number(randomBetween(min, max).toFixed(2));
}

function randomInteger(min: number, max: number): number {
  return Math.floor(randomBetween(min, max + 1));
}

export function inferModeFromDrafts(drafts: FieldDrafts): QueueModelKind {
  if (
    drafts.K !== undefined ||
    drafts.lambdaEffective !== undefined ||
    drafts.Pblock !== undefined
  ) {
    return "mmsk";
  }

  if (drafts.ca2 !== undefined || drafts.cs2 !== undefined) {
    return "ggs";
  }

  if (ERLANG_A_QUERY_KEYS.some((key) => drafts[key] !== undefined)) {
    return "erlang-a";
  }

  if (MMINF_QUERY_KEYS.some((key) => drafts[key] !== undefined)) {
    return "mminf";
  }

  if (drafts.serviceScv !== undefined) {
    return "mg1";
  }

  const serverDraft = drafts.s?.trim();

  if (serverDraft === undefined || serverDraft.length === 0) {
    return DEFAULT_QUEUE_MODEL;
  }

  const serverCount = Number(serverDraft);

  return Number.isFinite(serverCount) &&
    Number.isInteger(serverCount) &&
    serverCount > 1
    ? "mms"
    : DEFAULT_QUEUE_MODEL;
}
