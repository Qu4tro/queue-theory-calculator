import type { UrlState } from "./app-types";
import { formatDraftNumber } from "./draft-format";
import { cleanupDraftsForMode } from "./input-drafts";
import { METRIC_KEYS, type MetricKey } from "./metrics";
import {
  DEFAULT_QUEUE_MODEL,
  DEFAULT_SIMULATION_SPEED,
  ERLANG_A_QUERY_KEYS,
  FINITE_QUERY_KEYS,
  GGS_QUERY_KEYS,
  isFixedSingleServerMode,
  isQueueModelKind,
  isSpeedOption,
  MMINF_DROPPED_QUERY_KEYS,
  MMINF_QUERY_KEYS,
  terminologyPresetById,
} from "./model-config";
import {
  defaultTerminology,
  normalizeTerm,
  TERM_KEYS,
  type Terminology,
  type TermKey,
} from "./terminology";
import { DEFAULT_TIME_UNIT, isTimeUnitKey } from "./time-units";

const DRAFT_QUERY_KEYS = METRIC_KEYS.filter(
  (key) => key !== "Pbusy",
) as MetricKey[];
const MODEL_QUERY_PARAM = "model";
const LOSS_PRESET_QUERY_PARAM = "loss";
const SPEED_QUERY_PARAM = "speed";
const TIME_UNIT_QUERY_PARAM = "time_unit";
const TERMINOLOGY_PRESET_QUERY_PARAM = "term_preset";
const TERM_QUERY_PREFIX = "term_";
const MAX_URL_QUERY_STRING_LENGTH = 8192;
const MAX_URL_QUERY_PARAM_NAME_LENGTH = 64;
const MAX_URL_QUERY_PARAM_VALUE_LENGTH = 128;
const TERM_QUERY_PARAMS = Object.fromEntries(
  TERM_KEYS.map((key) => [key, `${TERM_QUERY_PREFIX}${key}`]),
) as Record<TermKey, string>;
const MANAGED_QUERY_PARAMS = [
  MODEL_QUERY_PARAM,
  LOSS_PRESET_QUERY_PARAM,
  SPEED_QUERY_PARAM,
  TIME_UNIT_QUERY_PARAM,
  TERMINOLOGY_PRESET_QUERY_PARAM,
  ...DRAFT_QUERY_KEYS,
  ...Object.values(TERM_QUERY_PARAMS),
];

export function readUrlState(): UrlState {
  if (typeof window === "undefined") {
    return { drafts: {} };
  }

  return readUrlStateFromSearch(window.location.search);
}

export function readUrlStateFromSearch(search: string): UrlState {
  const state: UrlState = { drafts: {} };
  const params = readBoundedUrlSearchParams(search);
  const mode = params.get(MODEL_QUERY_PARAM);
  const lossPreset = parseUrlBoolean(params.get(LOSS_PRESET_QUERY_PARAM));
  const timeUnit = params.get(TIME_UNIT_QUERY_PARAM);
  const speed = parseUrlSpeed(params.get(SPEED_QUERY_PARAM));
  const terminologyState = readUrlTerminologyState(params);

  if (isQueueModelKind(mode)) {
    state.mode = mode;
  }

  if (lossPreset !== undefined) {
    state.lossPreset = lossPreset;
  }

  if (isTimeUnitKey(timeUnit)) {
    state.timeUnit = timeUnit;
  }

  if (speed !== undefined) {
    state.speed = speed;
  }

  if (terminologyState !== undefined) {
    state.termPreset = terminologyState.termPreset;
    state.terms = terminologyState.terms;
  }

  for (const key of DRAFT_QUERY_KEYS) {
    if (!params.has(key)) {
      continue;
    }

    if (state.mode === "mminf" && MMINF_DROPPED_QUERY_KEYS.includes(key)) {
      continue;
    }

    if (
      state.mode !== undefined &&
      state.mode !== "mminf" &&
      MMINF_QUERY_KEYS.includes(key)
    ) {
      continue;
    }

    if (
      state.mode !== undefined &&
      state.mode !== "mg1" &&
      key === "serviceScv"
    ) {
      continue;
    }

    if (
      state.mode !== undefined &&
      state.mode !== "ggs" &&
      GGS_QUERY_KEYS.includes(key)
    ) {
      continue;
    }

    if (
      state.mode !== undefined &&
      state.mode !== "erlang-a" &&
      ERLANG_A_QUERY_KEYS.includes(key)
    ) {
      continue;
    }

    const value = normalizeUrlDraftValue(params.get(key));

    if (value.length > 0) {
      state.drafts[key] = value;
    }
  }

  return state;
}

export function writeUrlState(state: Required<UrlState>): void {
  if (typeof window === "undefined") {
    return;
  }

  const currentSearch = window.location.search;
  const nextSearch = buildUrlSearchForState(state, currentSearch);
  const currentPath = isUrlQueryStringTooLong(currentSearch)
    ? undefined
    : `${window.location.pathname}${currentSearch}${window.location.hash}`;
  const nextPath = `${window.location.pathname}${nextSearch}${window.location.hash}`;

  if (currentPath === undefined || nextPath !== currentPath) {
    window.history.replaceState(window.history.state, "", nextPath);
  }
}

export function buildUrlSearchForState(
  state: Required<UrlState>,
  currentSearch = "",
): string {
  const preservedParams = readBoundedUrlSearchParams(currentSearch);
  const drafts = cleanupDraftsForMode(
    state.drafts,
    state.mode,
    state.mode === "mmsk" && state.lossPreset,
  );

  for (const key of MANAGED_QUERY_PARAMS) {
    preservedParams.delete(key);
  }

  if (state.mode !== DEFAULT_QUEUE_MODEL) {
    preservedParams.set(MODEL_QUERY_PARAM, state.mode);
  }

  if (state.mode === "mmsk" && state.lossPreset) {
    preservedParams.set(LOSS_PRESET_QUERY_PARAM, "1");
  }

  if (state.timeUnit !== DEFAULT_TIME_UNIT) {
    preservedParams.set(TIME_UNIT_QUERY_PARAM, state.timeUnit);
  }

  if (state.speed !== DEFAULT_SIMULATION_SPEED) {
    preservedParams.set(SPEED_QUERY_PARAM, formatDraftNumber(state.speed));
  }

  for (const key of DRAFT_QUERY_KEYS) {
    if (isFixedSingleServerMode(state.mode) && key === "s") {
      continue;
    }

    if (state.mode === "mminf" && MMINF_DROPPED_QUERY_KEYS.includes(key)) {
      continue;
    }

    if (state.mode !== "mminf" && MMINF_QUERY_KEYS.includes(key)) {
      continue;
    }

    if (state.mode !== "mg1" && key === "serviceScv") {
      continue;
    }

    if (state.mode !== "ggs" && GGS_QUERY_KEYS.includes(key)) {
      continue;
    }

    if (state.mode !== "erlang-a" && ERLANG_A_QUERY_KEYS.includes(key)) {
      continue;
    }

    if (state.mode !== "mmsk" && FINITE_QUERY_KEYS.includes(key)) {
      continue;
    }

    if (state.mode === "mmsk" && state.lossPreset && key === "K") {
      continue;
    }

    const value = normalizeUrlDraftValue(drafts[key]);

    if (value.length > 0) {
      preservedParams.set(key, value);
    }
  }

  const terminologyPreset =
    terminologyPresetById(state.termPreset) ?? terminologyPresetById("default");

  if (terminologyPreset) {
    if (terminologyPreset.id !== "default") {
      preservedParams.set(TERMINOLOGY_PRESET_QUERY_PARAM, terminologyPreset.id);
    }

    for (const key of TERM_KEYS) {
      const value = normalizeTerm(key, state.terms[key]);

      if (value !== terminologyPreset.terms[key]) {
        preservedParams.set(TERM_QUERY_PARAMS[key], value);
      }
    }
  }

  const nextSearch = preservedParams.toString();
  return nextSearch.length > 0 ? `?${nextSearch}` : "";
}

function readUrlTerminologyState(
  params: URLSearchParams,
): { termPreset: string; terms: Terminology } | undefined {
  const preset = terminologyPresetById(
    params.get(TERMINOLOGY_PRESET_QUERY_PARAM) ?? "",
  );
  const terms = { ...(preset?.terms ?? defaultTerminology) };
  const termPreset = preset?.id ?? "default";
  let hasTerminologyState = preset !== undefined;

  for (const key of TERM_KEYS) {
    const paramName = TERM_QUERY_PARAMS[key];

    if (!params.has(paramName)) {
      continue;
    }

    hasTerminologyState = true;
    terms[key] = normalizeTerm(
      key,
      capUrlQueryParamValue(params.get(paramName)),
    );
  }

  return hasTerminologyState ? { termPreset, terms } : undefined;
}

function readBoundedUrlSearchParams(search: string): URLSearchParams {
  const params = new URLSearchParams(capUrlQueryString(search));
  const boundedParams = new URLSearchParams();

  for (const [name, value] of params) {
    boundedParams.append(
      capUrlQueryParamName(name),
      capUrlQueryParamValue(value),
    );
  }

  return boundedParams;
}

function capUrlQueryString(search: string): string {
  if (!isUrlQueryStringTooLong(search)) {
    return search;
  }

  const hasPrefix = search.startsWith("?");
  const query = hasPrefix ? search.slice(1) : search;
  const cappedQuery = sliceUrlComponent(query, MAX_URL_QUERY_STRING_LENGTH);

  return hasPrefix ? `?${cappedQuery}` : cappedQuery;
}

function isUrlQueryStringTooLong(search: string): boolean {
  const queryLength = search.startsWith("?")
    ? search.length - 1
    : search.length;
  return queryLength > MAX_URL_QUERY_STRING_LENGTH;
}

function capUrlQueryParamName(value: string): string {
  return sliceUrlComponent(value, MAX_URL_QUERY_PARAM_NAME_LENGTH);
}

export function capUrlQueryParamValue(
  value: string | null | undefined,
): string {
  return sliceUrlComponent(value ?? "", MAX_URL_QUERY_PARAM_VALUE_LENGTH);
}

function normalizeUrlDraftValue(value: string | null | undefined): string {
  return capUrlQueryParamValue(value).trim();
}

function sliceUrlComponent(value: string, maxLength: number): string {
  const cappedValue = value.slice(0, maxLength);
  const finalCodeUnit = cappedValue.charCodeAt(cappedValue.length - 1);

  if (finalCodeUnit >= 0xd800 && finalCodeUnit <= 0xdbff) {
    return cappedValue.slice(0, -1);
  }

  return cappedValue;
}

function parseUrlBoolean(value: string | null): boolean | undefined {
  if (value === null) {
    return undefined;
  }

  return value === "1" || value === "true";
}

function parseUrlSpeed(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }

  const speed = Number(value);
  return isSpeedOption(speed) ? speed : undefined;
}
