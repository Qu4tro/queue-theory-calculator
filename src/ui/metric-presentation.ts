import type { QueueInputMap, QueueModelKind } from "../queue/types";
import type {
  MetricPresentation,
  MetricPresentationCache,
  MetricPresentationContext,
  MetricPresentationGetter,
  MetricSheetProps,
  ParsedView,
} from "./app-types";
import { EMPTY_DISPLAY_PLACEHOLDER, NOT_APPLICABLE_DISPLAY } from "./format";
import {
  issuesByVariable,
  metricNotApplicable,
  metricNumber,
} from "./metric-results";
import type { MetricKey } from "./metrics";
import {
  DIMENSIONLESS_GUIDANCE_KEYS,
  ERLANG_A_PARAM_KEYS,
  ERLANG_A_RATE_TARGET_KEYS,
  ERLANG_A_THETA_TARGET_KEYS,
  FINITE_PARAM_KEYS,
  FINITE_SCALE_GUIDANCE_KEYS,
  FINITE_SHAPE_GUIDANCE_KEYS,
  GENERAL_SERVICE_RHO_KEYS,
  GENERAL_SERVICE_TARGET_KEYS,
  GGS_KNOWN_LAMBDA_TARGET_KEYS,
  GGS_KNOWN_MU_TARGET_KEYS,
  INFINITE_DERIVED_KEYS,
  INFINITY_DISPLAY,
  MMINF_NOT_APPLICABLE_KEYS,
  MMINF_READONLY_ZERO_KEYS,
  TIME_GUIDANCE_KEYS,
} from "./model-config";
import { formatMetricForDisplay } from "./time-units";

export function createMetricPresentationGetter(
  props: MetricSheetProps,
): MetricPresentationGetter {
  let cache: MetricPresentationCache | null = null;

  return (key: MetricKey): MetricPresentation => {
    const view = props.getView();
    const drafts = props.drafts.val;
    const mode = props.mode.val;
    const lossPreset = props.lossPreset.val;
    const timeUnit = props.timeUnit.val;

    if (
      cache === null ||
      cache.view !== view ||
      cache.drafts !== drafts ||
      cache.mode !== mode ||
      cache.lossPreset !== lossPreset ||
      cache.timeUnit !== timeUnit
    ) {
      cache = {
        context: {
          view,
          drafts,
          issuesByField: issuesByVariable(view.result.issues),
          lossPreset,
          mode,
          suggestedKeys: suggestedInputKeys(view, mode, lossPreset),
          timeUnit,
        },
        drafts,
        lossPreset,
        mode,
        presentations: new Map(),
        timeUnit,
        view,
      };
    }

    const cached = cache.presentations.get(key);

    if (cached !== undefined) {
      return cached;
    }

    const presentation = metricPresentation(key, cache.context);
    cache.presentations.set(key, presentation);
    return presentation;
  };
}

function metricPresentation(
  key: MetricKey,
  context: MetricPresentationContext,
): MetricPresentation {
  const {
    drafts,
    issuesByField,
    lossPreset,
    mode,
    suggestedKeys,
    timeUnit,
    view,
  } = context;
  const solverIssue = issuesByField[key];
  const parseError = view.fieldErrors[key];
  const error = parseError ?? solverIssue?.message;
  const draft = drafts[key];
  const hasRawDraft = (draft?.trim().length ?? 0) > 0;
  const isLossPresetCapacity = mode === "mmsk" && lossPreset && key === "K";
  const isMmInfinityServerCount = mode === "mminf" && key === "s";
  const isMmInfinityNotApplicable =
    mode === "mminf" && MMINF_NOT_APPLICABLE_KEYS.includes(key);
  const isMmInfinityReadonlyZero =
    mode === "mminf" && MMINF_READONLY_ZERO_KEYS.includes(key);
  const isFixedSingleServer =
    (mode === "mm1" || mode === "mg1" || mode === "md1") && key === "s";
  const isFixedDeterministicScv = mode === "md1" && key === "serviceScv";
  const isDefaultGgSScv =
    mode === "ggs" && (key === "ca2" || key === "cs2") && !hasRawDraft;
  const readOnly =
    isAliasMetric(key) ||
    isLossPresetCapacity ||
    isMmInfinityServerCount ||
    isMmInfinityNotApplicable ||
    isMmInfinityReadonlyZero ||
    isFixedSingleServer ||
    isFixedDeterministicScv;
  const hasDraft =
    hasRawDraft &&
    (!readOnly || (mode === "mminf" && isMmInfinityReadonlyZero));
  const isImpliedSingleServer = isFixedSingleServer && !hasDraft;
  const solvedMetrics =
    view.result.status === "solved"
      ? view.result.metrics
      : view.result.status === "inconsistent"
        ? view.result.candidate
        : undefined;
  const computed = solvedMetrics ? metricNumber(solvedMetrics, key) : null;
  const notApplicable =
    isMmInfinityNotApplicable ||
    (solvedMetrics ? metricNotApplicable(solvedMetrics, key) : false);
  const computedText = isMmInfinityServerCount
    ? INFINITY_DISPLAY
    : notApplicable
      ? NOT_APPLICABLE_DISPLAY
      : isMmInfinityReadonlyZero
        ? formatMetricForDisplay(key, 0, timeUnit)
        : computed === null
          ? EMPTY_DISPLAY_PLACEHOLDER
          : formatMetricForDisplay(key, computed, timeUnit);
  const draftValue = isFixedSingleServer
    ? (draft ?? "1")
    : isFixedDeterministicScv
      ? (draft ?? "0")
      : isDefaultGgSScv
        ? "1"
        : isMmInfinityReadonlyZero && hasRawDraft && error
          ? (draft ?? "")
          : readOnly
            ? computedText
            : (draft ?? "");
  const locked =
    isImpliedSingleServer ||
    isFixedDeterministicScv ||
    isDefaultGgSScv ||
    isMmInfinityServerCount ||
    isLossPresetCapacity ||
    hasDraft;
  const suggested =
    !hasDraft && !readOnly && !parseError && suggestedKeys.has(key);
  const visibleError = suggested ? undefined : error;
  const autoSolved =
    !hasDraft &&
    !readOnly &&
    !notApplicable &&
    computed !== null &&
    computedText !== EMPTY_DISPLAY_PLACEHOLDER;
  const placeholder = locked ? "" : autoSolved ? computedText : "Auto";
  const conflictText =
    view.result.status === "inconsistent" &&
    hasDraft &&
    solverIssue !== undefined &&
    computed !== null &&
    !notApplicable
      ? `Solved ${computedText}`
      : undefined;
  const inputTitle =
    conflictText !== undefined
      ? `${visibleError ?? "Input does not match the solved value"} ${conflictText}.`
      : autoSolved
        ? `Auto-solved value ${computedText}.`
        : visibleError;

  return {
    autoSolved,
    computedText,
    conflictText,
    canClear: hasDraft,
    draftValue,
    error: visibleError,
    inputTitle,
    locked,
    placeholder,
    readOnly,
    suggested,
  };
}

function suggestedInputKeys(
  view: ParsedView,
  mode: QueueModelKind,
  lossPreset: boolean,
): Set<MetricKey> {
  if (
    view.result.status !== "need-more-inputs" ||
    Object.keys(view.input).length === 0
  ) {
    return new Set();
  }

  switch (mode) {
    case "mm1":
    case "mms":
      return markovianInfiniteGuidanceKeys(view.input, mode);
    case "mmsk":
      return finiteGuidanceKeys(view.input, lossPreset);
    case "mminf":
      return mmInfinityGuidanceKeys(view.input);
    case "mg1":
    case "md1":
      return generalServiceGuidanceKeys(view.input, mode);
    case "ggs":
      return ggSGuidanceKeys(view.input);
    case "erlang-a":
      return erlangAGuidanceKeys(view.input);
  }
}

function markovianInfiniteGuidanceKeys(
  inputMap: QueueInputMap,
  mode: "mm1" | "mms",
): Set<MetricKey> {
  if (mode === "mm1") {
    return guidanceFromRecipes(inputMap, [
      ["lambda", "mu"],
      ["lambda", "rho"],
      ["mu", "rho"],
      ...INFINITE_DERIVED_KEYS.flatMap((target) => [
        ["lambda", target] as MetricKey[],
        ["mu", target] as MetricKey[],
      ]),
      ...TIME_GUIDANCE_KEYS.flatMap((target) => [
        ["rho", target] as MetricKey[],
        ["P0", target] as MetricKey[],
        ["Pwait", target] as MetricKey[],
      ]),
      ["L", "W"],
      ["Lq", "Wq"],
      ["W", "Wq"],
    ]);
  }

  return guidanceFromRecipes(inputMap, [
    ["lambda", "mu", "s"],
    ["lambda", "rho", "s"],
    ["mu", "rho", "s"],
    ...INFINITE_DERIVED_KEYS.flatMap((target) => [
      ["lambda", "s", target] as MetricKey[],
      ["mu", "s", target] as MetricKey[],
      ["lambda", target] as MetricKey[],
      ["mu", target] as MetricKey[],
    ]),
    ...TIME_GUIDANCE_KEYS.flatMap((target) => [
      ["rho", "s", target] as MetricKey[],
      ["rho", target] as MetricKey[],
    ]),
    ...DIMENSIONLESS_GUIDANCE_KEYS.flatMap((dimensionless) =>
      TIME_GUIDANCE_KEYS.map(
        (timeTarget) => ["s", dimensionless, timeTarget] as MetricKey[],
      ),
    ),
    ["s", "W", "Wq"],
  ]);
}

function finiteGuidanceKeys(
  inputMap: QueueInputMap,
  lossPreset: boolean,
): Set<MetricKey> {
  const suggestions = new Set<MetricKey>();
  const baseKeys = lossPreset
    ? (["lambda", "mu", "s"] as MetricKey[])
    : FINITE_PARAM_KEYS;

  addMissingGuidanceKeys(suggestions, inputMap, baseKeys);

  const hasCapacityAnchor =
    hasMetricValue(inputMap, "s") ||
    hasMetricValue(inputMap, "K") ||
    (lossPreset && hasMetricValue(inputMap, "s"));
  const hasScale =
    hasAnyMetricValue(inputMap, ["lambda", "mu"]) ||
    hasAnyMetricValue(inputMap, FINITE_SCALE_GUIDANCE_KEYS);
  const hasShape = hasAnyMetricValue(inputMap, FINITE_SHAPE_GUIDANCE_KEYS);

  if (!hasCapacityAnchor) {
    return suggestions;
  }

  if (hasScale) {
    addMissingGuidanceKeys(suggestions, inputMap, FINITE_SHAPE_GUIDANCE_KEYS);
  }

  if (hasShape) {
    addMissingGuidanceKeys(suggestions, inputMap, [
      "lambda",
      "mu",
      ...FINITE_SCALE_GUIDANCE_KEYS,
    ]);
  }

  return suggestions;
}

function mmInfinityGuidanceKeys(inputMap: QueueInputMap): Set<MetricKey> {
  const suggestions = guidanceFromRecipes(inputMap, [
    ["lambda", "mu"],
    ["lambda", "a"],
    ["lambda", "W"],
    ["lambda", "L"],
    ["lambda", "P0"],
    ["mu", "a"],
    ["mu", "L"],
    ["mu", "P0"],
    ["a", "W"],
    ["L", "W"],
    ["W", "P0"],
  ]);

  if (
    (hasMetricValue(inputMap, "L") || hasMetricValue(inputMap, "a")) &&
    hasMetricValue(inputMap, "P0")
  ) {
    addMissingGuidanceKeys(suggestions, inputMap, ["lambda", "mu", "W"]);
  }

  return suggestions;
}

function generalServiceGuidanceKeys(
  inputMap: QueueInputMap,
  mode: "mg1" | "md1",
): Set<MetricKey> {
  const suggestions = new Set<MetricKey>();
  const hasServiceScv =
    mode === "md1" || hasMetricValue(inputMap, "serviceScv");
  const hasLambda = hasMetricValue(inputMap, "lambda");
  const hasMu = hasMetricValue(inputMap, "mu");

  if (!hasServiceScv) {
    suggestions.add("serviceScv");

    if (hasLambda && hasMu) {
      addMissingGuidanceKeys(
        suggestions,
        inputMap,
        GENERAL_SERVICE_TARGET_KEYS,
      );
    } else {
      addMissingGuidanceKeys(suggestions, inputMap, ["lambda", "mu"]);
    }

    return suggestions;
  }

  if (hasLambda) {
    addMissingGuidanceKeys(suggestions, inputMap, [
      "mu",
      ...GENERAL_SERVICE_RHO_KEYS,
      ...GENERAL_SERVICE_TARGET_KEYS,
    ]);
  }

  if (hasMu) {
    addMissingGuidanceKeys(suggestions, inputMap, [
      "lambda",
      ...GENERAL_SERVICE_RHO_KEYS,
      ...GENERAL_SERVICE_TARGET_KEYS,
    ]);
  }

  if (hasAnyMetricValue(inputMap, GENERAL_SERVICE_RHO_KEYS)) {
    addMissingGuidanceKeys(suggestions, inputMap, [
      "lambda",
      "mu",
      ...TIME_GUIDANCE_KEYS,
    ]);
  }

  if (hasAnyMetricValue(inputMap, TIME_GUIDANCE_KEYS)) {
    addMissingGuidanceKeys(suggestions, inputMap, [
      "lambda",
      "mu",
      ...GENERAL_SERVICE_RHO_KEYS,
    ]);
  }

  if (hasAnyMetricValue(inputMap, ["L", "Lq"])) {
    addMissingGuidanceKeys(suggestions, inputMap, ["lambda", "mu"]);
  }

  if (suggestions.size === 0) {
    addMissingGuidanceKeys(suggestions, inputMap, [
      "lambda",
      "mu",
      ...GENERAL_SERVICE_RHO_KEYS,
    ]);
  }

  return suggestions;
}

function ggSGuidanceKeys(inputMap: QueueInputMap): Set<MetricKey> {
  const suggestions = new Set<MetricKey>();
  const hasLambda = hasMetricValue(inputMap, "lambda");
  const hasMu = hasMetricValue(inputMap, "mu");
  const hasRho = hasMetricValue(inputMap, "rho");

  if (!hasMetricValue(inputMap, "s")) {
    suggestions.add("s");

    if (hasLambda) {
      addMissingGuidanceKeys(suggestions, inputMap, ["mu", "rho"]);
    } else if (hasMu) {
      addMissingGuidanceKeys(suggestions, inputMap, ["lambda", "rho"]);
    } else if (hasRho) {
      addMissingGuidanceKeys(suggestions, inputMap, ["lambda", "mu"]);
    } else {
      addMissingGuidanceKeys(suggestions, inputMap, ["lambda", "mu"]);
    }

    return suggestions;
  }

  if (hasLambda) {
    addMissingGuidanceKeys(suggestions, inputMap, [
      "mu",
      "rho",
      ...GGS_KNOWN_LAMBDA_TARGET_KEYS,
    ]);
  }

  if (hasMu) {
    addMissingGuidanceKeys(suggestions, inputMap, [
      "lambda",
      "rho",
      ...GGS_KNOWN_MU_TARGET_KEYS,
    ]);
  }

  if (hasRho) {
    addMissingGuidanceKeys(suggestions, inputMap, [
      "lambda",
      "mu",
      ...TIME_GUIDANCE_KEYS,
    ]);
  }

  if (hasAnyMetricValue(inputMap, TIME_GUIDANCE_KEYS)) {
    addMissingGuidanceKeys(suggestions, inputMap, ["lambda", "mu", "rho"]);
  }

  if (hasAnyMetricValue(inputMap, ["L", "Lq"])) {
    addMissingGuidanceKeys(suggestions, inputMap, ["lambda", "mu"]);
  }

  if (suggestions.size === 0) {
    addMissingGuidanceKeys(suggestions, inputMap, ["lambda", "mu", "rho"]);
  }

  return suggestions;
}

function erlangAGuidanceKeys(inputMap: QueueInputMap): Set<MetricKey> {
  const suggestions = new Set<MetricKey>();
  const missingBaseKeys = ERLANG_A_PARAM_KEYS.filter(
    (key) => !hasMetricValue(inputMap, key),
  );

  addMissingGuidanceKeys(suggestions, inputMap, missingBaseKeys);

  if (missingBaseKeys.length !== 1) {
    return suggestions;
  }

  const missingBase = missingBaseKeys[0];

  if (missingBase === "lambda" || missingBase === "mu") {
    addMissingGuidanceKeys(suggestions, inputMap, ERLANG_A_RATE_TARGET_KEYS);
  }

  if (missingBase === "theta") {
    addMissingGuidanceKeys(suggestions, inputMap, ERLANG_A_THETA_TARGET_KEYS);
  }

  return suggestions;
}

function guidanceFromRecipes(
  inputMap: QueueInputMap,
  recipes: readonly (readonly MetricKey[])[],
): Set<MetricKey> {
  const suggestions = new Set<MetricKey>();
  const recipeDomain = new Set<MetricKey>(recipes.flat());
  const suppliedKeys = [...recipeDomain].filter((key) =>
    hasMetricValue(inputMap, key),
  );

  for (const recipe of recipes) {
    if (!suppliedKeys.every((key) => recipe.includes(key))) {
      continue;
    }

    addMissingGuidanceKeys(suggestions, inputMap, recipe);
  }

  return suggestions;
}

function addMissingGuidanceKeys(
  suggestions: Set<MetricKey>,
  inputMap: QueueInputMap,
  keys: readonly MetricKey[],
): void {
  for (const key of keys) {
    if (!hasMetricValue(inputMap, key)) {
      suggestions.add(key);
    }
  }
}

function hasAnyMetricValue(
  inputMap: QueueInputMap,
  keys: readonly MetricKey[],
): boolean {
  return keys.some((key) => hasMetricValue(inputMap, key));
}

function hasMetricValue(inputMap: QueueInputMap, key: MetricKey): boolean {
  return inputMap[key] !== undefined;
}

function isAliasMetric(key: MetricKey): boolean {
  return key === "Pbusy";
}
