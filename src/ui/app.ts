import van from "vanjs-core";
import { QueueSimulation, type SimulationSnapshot } from "../queue/simulation";
import { compareQueueStatsToTheory } from "../queue/stats";
import type { QueueModelKind, SolverOptions } from "../queue/types";
import type {
  AppElement,
  AppView,
  ComparisonBadge,
  FieldDrafts,
  MetricHighlightToggleProps,
  MetricPresentationGetter,
  MetricSheetProps,
  ParsedView,
  ParsedViewCache,
  PendingTimeUnitConversion,
  QueueHelpHighlightProps,
  QueueModelWatchItem,
  TimeUnitKey,
  UiSolverResult,
  UiSolverStatus,
} from "./app-types";
import { AsyncSolverClient } from "./async-solver";

export type {
  AppElement,
  FieldDrafts,
  TimeUnitKey,
  UrlState,
} from "./app-types";

import {
  EMPTY_DISPLAY_PLACEHOLDER,
  formatInteger,
  NOT_APPLICABLE_DISPLAY,
} from "./format";
import {
  buildParsedView,
  cleanupDraftsForMode,
  inferModeFromDrafts,
  invalidResultFromFieldErrors,
  normalizeLossPresetDrafts,
  parseDrafts,
  parsePositiveIntegerDraft,
  pendingSolverResult,
  randomValidDrafts,
} from "./input-drafts";
import { createMetricPresentationGetter } from "./metric-presentation";
import {
  comparisonMetricKeys,
  comparisonThresholds,
  metricNumber,
  modelKey,
} from "./metric-results";
import { getMetricDefinition, type MetricKey } from "./metrics";
import {
  DEFAULT_SIMULATION_SPEED,
  DISPLAY_PROBABILITY_KEYS,
  ERLANG_A_FLOW_KEYS,
  ERLANG_A_PARAM_KEYS,
  ERLANG_A_PROBABILITY_KEYS,
  FINITE_PARAM_KEYS,
  FINITE_THROUGHPUT_KEYS,
  GENERAL_SERVICE_PARAM_KEYS,
  GGS_PARAM_KEYS,
  INFINITY_DISPLAY,
  isFixedSingleServerMode,
  isSpeedOption,
  MMINF_LOAD_KEYS,
  matchingTerminologyPresetId,
  nextSimulationSpeed,
  PARAM_KEYS,
  QUEUE_MODEL_HELP,
  QUEUE_MODEL_LABELS,
  QUEUE_MODEL_ORDER,
  SPEED_OPTIONS,
  STEADY_KEYS,
  TERMINOLOGY_PRESETS,
  terminologyPresetById,
} from "./model-config";
import {
  loadTerminology,
  metricDescription,
  metricLabelParts,
  normalizeTerm,
  pluralTerm,
  resetTerminology,
  saveTerminology,
  TERM_KEYS,
  type Terminology,
  type TermKey,
  termLabel,
} from "./terminology";
import {
  capUrlQueryParamValue,
  readUrlState,
  writeUrlState,
} from "./url-state";

export { buildUrlSearchForState, readUrlStateFromSearch } from "./url-state";

import { formatSimulationSpeed } from "./draft-format";
import {
  convertDraftsForTimeUnit,
  DEFAULT_TIME_UNIT,
  formatDifference,
  formatMetricForDisplay,
  formatTimeForDisplay,
  isRateOrTimeKey,
  metricUnitDescription,
  metricUnitLabel,
  TIME_UNITS,
  timeUnitConversionActionLabel,
  timeUnitDefinition,
} from "./time-units";
import { QueueCanvasVisualizer } from "./visualizer";

const {
  a,
  button,
  canvas,
  code: codeTag,
  details,
  div,
  footer,
  h1,
  h2,
  h3,
  header,
  input,
  label,
  option,
  p,
  section,
  select,
  span,
  summary,
  sub,
  sup,
  table,
  tbody,
  td,
  th,
  thead,
  tr,
} = van.tags;

export function App(): AppElement {
  const initialUrlState = readUrlState();
  const initialMode =
    initialUrlState.mode ?? inferModeFromDrafts(initialUrlState.drafts);
  const initialLossPreset =
    initialMode === "mmsk" && (initialUrlState.lossPreset ?? false);
  const initialDrafts = cleanupDraftsForMode(
    initialUrlState.drafts,
    initialMode,
    initialLossPreset,
  );
  const mode = van.state<QueueModelKind>(initialMode);
  const lossPreset = van.state(initialLossPreset);
  const drafts = van.state<FieldDrafts>(initialDrafts);
  const timeUnit = van.state<TimeUnitKey>(
    initialUrlState.timeUnit ?? DEFAULT_TIME_UNIT,
  );
  const pendingTimeUnitConversion = van.state<PendingTimeUnitConversion | null>(
    null,
  );
  const initialTerms = initialUrlState.terms ?? loadTerminology();
  const terminologyPreset = van.state(
    initialUrlState.termPreset ||
      matchingTerminologyPresetId(initialTerms) ||
      "default",
  );
  const terms = van.state<Terminology>(initialTerms);
  const running = van.state(true);
  const speed = van.state<number>(
    initialUrlState.speed ?? DEFAULT_SIMULATION_SPEED,
  );
  const labelTooltipsSwapped = van.state(false);
  const simulationRevision = van.state(0);
  const parsedViewRevision = van.state(0);
  const modeFlash = van.state(false);
  const urlCopied = van.state(false);
  const selectedHelpMetrics = van.state<ReadonlySet<MetricKey>>(new Set());
  const previewedHelpMetrics = van.state<ReadonlySet<MetricKey>>(new Set());
  const activeView = van.state<AppView>("main");
  const solverResult = van.state<UiSolverResult>(pendingSolverResult());
  let simulation: QueueSimulation | null = null;
  let simulationKey: string | null = null;
  let pendingSimulationDeltaTime = 0;
  let visualizer: QueueCanvasVisualizer | null = null;
  let quickVisualizer: QueueCanvasVisualizer | null = null;
  let lastUiMetricRefresh = 0;
  let modeFlashTimer: number | undefined;
  let urlCopiedTimer: number | undefined;
  let parsedViewCache: ParsedViewCache | null = null;
  let solveRevision = 0;
  let disposed = false;
  const asyncSolver = new AsyncSolverClient();

  const invalidateParsedView = (): void => {
    parsedViewRevision.val += 1;
  };

  const readView = (): ParsedView => {
    const revision = parsedViewRevision.val;
    const currentDrafts = drafts.val;
    const currentMode = mode.val;
    const currentTimeUnit = timeUnit.val;
    const currentLossPreset = lossPreset.val;
    const currentTerms = terms.val;
    const currentResult = solverResult.val;

    if (
      parsedViewCache !== null &&
      parsedViewCache.revision === revision &&
      parsedViewCache.drafts === currentDrafts &&
      parsedViewCache.mode === currentMode &&
      parsedViewCache.timeUnit === currentTimeUnit &&
      parsedViewCache.lossPreset === currentLossPreset &&
      parsedViewCache.terms === currentTerms &&
      parsedViewCache.result === currentResult
    ) {
      return parsedViewCache.view;
    }

    const view = buildParsedView(
      currentDrafts,
      currentTimeUnit,
      currentTerms,
      currentResult,
    );

    parsedViewCache = {
      drafts: currentDrafts,
      lossPreset: currentLossPreset,
      mode: currentMode,
      revision,
      result: currentResult,
      terms: currentTerms,
      timeUnit: currentTimeUnit,
      view,
    };

    return view;
  };

  const currentSolverOptions = (): SolverOptions => ({
    lossPreset: mode.val === "mmsk" && lossPreset.val,
    modelKind: mode.val,
  });

  const requestSolve = (): void => {
    const revision = solveRevision + 1;
    solveRevision = revision;
    const parsed = parseDrafts(drafts.val, timeUnit.val, terms.val);

    if (Object.keys(parsed.fieldErrors).length > 0) {
      solverResult.val = invalidResultFromFieldErrors(parsed.fieldErrors);
      invalidateParsedView();
      return;
    }

    solverResult.val = pendingSolverResult();
    invalidateParsedView();

    asyncSolver.solve(parsed.input, currentSolverOptions(), (result) => {
      if (disposed || revision !== solveRevision) {
        return;
      }

      solverResult.val = result;
      invalidateParsedView();
      syncSimulation(result);
      updateCanvasLabels();
    });
  };

  const syncUrlState = (): void => {
    writeUrlState({
      drafts: drafts.val,
      lossPreset: lossPreset.val,
      mode: mode.val,
      speed: speed.val,
      termPreset: terminologyPreset.val,
      terms: terms.val,
      timeUnit: timeUnit.val,
    });
  };

  const syncSimulation = (
    result: UiSolverResult = readView().result,
    options: { force?: boolean; pause?: boolean } = {},
  ): void => {
    if (result.status !== "solved") {
      simulation = null;
      simulationKey = null;
      pendingSimulationDeltaTime = 0;
      simulationRevision.val += 1;
      updateCanvasLabels();
      updateVisualizerActivity();
      return;
    }

    const nextKey = modelKey(result.metrics);

    if (!options.force && nextKey === simulationKey && simulation !== null) {
      return;
    }

    simulation = new QueueSimulation(result.params, {
      collectStats: true,
      maxSnapshotQueueItems: 40,
      maxSnapshotServers: 180,
      theoreticalMetrics: result.metrics,
      statsThresholds: comparisonThresholds(result.metrics),
    });
    simulationKey = nextKey;
    pendingSimulationDeltaTime = 0;

    if (options.pause ?? activeView.val === "simulation") {
      running.val = false;
    }

    simulationRevision.val += 1;
    updateCanvasLabels();
    updateVisualizerActivity();
  };

  const flashModeControl = (): void => {
    if (modeFlashTimer !== undefined) {
      window.clearTimeout(modeFlashTimer);
      modeFlashTimer = undefined;
    }

    queueMicrotask(() => {
      if (disposed) {
        return;
      }

      modeFlash.val = true;
      modeFlashTimer = window.setTimeout(() => {
        modeFlash.val = false;
        modeFlashTimer = undefined;
      }, 520);
    });
  };

  const syncModeFromServerDraft = (value: string): void => {
    if (
      mode.val === "mmsk" ||
      mode.val === "mminf" ||
      mode.val === "mg1" ||
      mode.val === "md1" ||
      mode.val === "ggs" ||
      mode.val === "erlang-a"
    ) {
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return;
    }

    const serverCount = Number(trimmed);

    if (
      !Number.isFinite(serverCount) ||
      !Number.isInteger(serverCount) ||
      serverCount < 1
    ) {
      return;
    }

    const nextMode: QueueModelKind = serverCount === 1 ? "mm1" : "mms";

    if (mode.val !== nextMode) {
      mode.val = nextMode;
      invalidateParsedView();
      clearHelpHighlights();
      flashModeControl();
    }
  };

  const updateDraft = (key: MetricKey, value: string): void => {
    if (isRateOrTimeKey(key)) {
      pendingTimeUnitConversion.val = null;
    }

    const nextValue = capUrlQueryParamValue(value);
    const nextDrafts = { ...drafts.val, [key]: nextValue };

    if (key === "s" && mode.val === "mmsk" && lossPreset.val) {
      const serverCount = parsePositiveIntegerDraft(nextValue);

      if (serverCount !== null) {
        nextDrafts.K = serverCount.toString();
      }
    }

    drafts.val = nextDrafts;
    invalidateParsedView();

    if (key === "s") {
      syncModeFromServerDraft(nextValue);
    }

    requestSolve();
    syncSimulation();
    syncUrlState();
  };

  const clearDraft = (key: MetricKey): void => {
    if (isRateOrTimeKey(key)) {
      pendingTimeUnitConversion.val = null;
    }

    const next = { ...drafts.val };
    delete next[key];

    if (key === "s" && mode.val === "mmsk" && lossPreset.val) {
      delete next.K;
    }

    drafts.val = next;
    invalidateParsedView();
    requestSolve();
    syncSimulation();
    syncUrlState();
  };

  const setMode = (nextMode: QueueModelKind): void => {
    const modeChanged = mode.val !== nextMode;
    mode.val = nextMode;

    if (modeChanged) {
      invalidateParsedView();
      clearHelpHighlights();
    }

    let nextDrafts = cleanupDraftsForMode(drafts.val, nextMode, lossPreset.val);

    if (isFixedSingleServerMode(nextMode)) {
      lossPreset.val = false;
      invalidateParsedView();

      if (nextMode === "md1") {
        delete nextDrafts.serviceScv;
      }
    } else if (nextMode === "mminf") {
      lossPreset.val = false;
      invalidateParsedView();
    } else {
      if (nextDrafts.s === undefined) {
        nextDrafts.s = "1";
      }

      if (nextMode !== "mmsk") {
        lossPreset.val = false;
        invalidateParsedView();
      } else if (lossPreset.val) {
        nextDrafts = normalizeLossPresetDrafts(nextDrafts);
      }
    }

    drafts.val = nextDrafts;
    invalidateParsedView();
    requestSolve();
    syncSimulation();
    syncUrlState();
  };

  const setLossPreset = (enabled: boolean): void => {
    lossPreset.val = enabled && mode.val === "mmsk";

    if (lossPreset.val) {
      drafts.val = normalizeLossPresetDrafts(drafts.val);
    }

    invalidateParsedView();
    requestSolve();
    syncSimulation();
    syncUrlState();
  };

  const setTimeUnit = (nextUnit: TimeUnitKey): void => {
    const currentUnit = timeUnit.val;

    if (nextUnit === currentUnit) {
      return;
    }

    const pendingConversion = pendingTimeUnitConversion.val;
    timeUnit.val = nextUnit;
    invalidateParsedView();
    pendingTimeUnitConversion.val =
      pendingConversion?.from === nextUnit &&
      pendingConversion.to === currentUnit
        ? null
        : { from: currentUnit, to: nextUnit };
    requestSolve();
    syncSimulation();
    visualizer?.draw();
    quickVisualizer?.draw();
    updateCanvasLabels();
    syncUrlState();
  };

  const applyPendingTimeUnitConversion = (): void => {
    const pendingConversion = pendingTimeUnitConversion.val;

    if (pendingConversion === null || pendingConversion.to !== timeUnit.val) {
      pendingTimeUnitConversion.val = null;
      return;
    }

    drafts.val = convertDraftsForTimeUnit(
      drafts.val,
      pendingConversion.from,
      pendingConversion.to,
    );
    invalidateParsedView();
    pendingTimeUnitConversion.val = null;
    requestSolve();
    syncSimulation();
    visualizer?.draw();
    quickVisualizer?.draw();
    updateCanvasLabels();
    syncUrlState();
  };

  const resetInputs = (): void => {
    drafts.val = mode.val === "ggs" ? cleanupDraftsForMode({}, "ggs") : {};
    lossPreset.val = false;
    invalidateParsedView();
    pendingTimeUnitConversion.val = null;
    requestSolve();
    syncSimulation();
    syncUrlState();
  };

  const populateRandomInputs = (): void => {
    const next = randomValidDrafts(mode.val, timeUnit.val);
    drafts.val = next.drafts;
    lossPreset.val = next.lossPreset;
    invalidateParsedView();
    pendingTimeUnitConversion.val = null;
    requestSolve();
    syncSimulation();
    syncUrlState();
  };

  const setSpeed = (nextSpeed: number): void => {
    if (!isSpeedOption(nextSpeed)) {
      return;
    }

    speed.val = nextSpeed;
    syncUrlState();
  };

  const cycleSpeed = (): void => {
    setSpeed(nextSimulationSpeed(speed.val));
  };

  const setLabelTooltipsSwapped = (enabled: boolean): void => {
    labelTooltipsSwapped.val = enabled;
  };

  const isMetricHelpHighlighted = (key: MetricKey): boolean =>
    selectedHelpMetrics.val.has(key) || previewedHelpMetrics.val.has(key);

  const isMetricHelpSelected = (key: MetricKey): boolean =>
    selectedHelpMetrics.val.has(key);

  const setMetricHelpPreview = (key: MetricKey, highlighted: boolean): void => {
    const next = new Set(previewedHelpMetrics.val);

    if (highlighted) {
      next.add(key);
    } else {
      next.delete(key);
    }

    previewedHelpMetrics.val = next;
  };

  const toggleMetricHelpSelection = (key: MetricKey): void => {
    const next = new Set(selectedHelpMetrics.val);

    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }

    selectedHelpMetrics.val = next;
  };

  const clearHelpHighlights = (): void => {
    selectedHelpMetrics.val = new Set();
    previewedHelpMetrics.val = new Set();
  };

  const setTerms = (nextTerms: Terminology): void => {
    terms.val = nextTerms;
    invalidateParsedView();
    saveTerminology(nextTerms);
    updateCanvasLabels();
    syncUrlState();
  };

  const setTerminologyPreset = (presetId: string): void => {
    const preset = terminologyPresetById(presetId);

    if (!preset) {
      return;
    }

    terminologyPreset.val = preset.id;
    setTerms({ ...preset.terms });
  };

  const updateTerm = (key: TermKey, value: string): void => {
    setTerms({
      ...terms.val,
      [key]: normalizeTerm(key, value),
    });
  };

  const resetTerms = (): void => {
    terminologyPreset.val = "default";
    terms.val = resetTerminology();
    invalidateParsedView();
    updateCanvasLabels();
    syncUrlState();
  };

  const markUrlCopied = (): void => {
    urlCopied.val = true;

    if (urlCopiedTimer !== undefined) {
      window.clearTimeout(urlCopiedTimer);
    }

    urlCopiedTimer = window.setTimeout(() => {
      urlCopied.val = false;
      urlCopiedTimer = undefined;
    }, 1400);
  };

  const copyCurrentUrl = async (): Promise<void> => {
    const copied = await copyText(window.location.href);

    if (copied) {
      markUrlCopied();
    }
  };

  const showMainView = (): void => {
    activeView.val = "main";
    updateVisualizerActivity();
    queueMicrotask(() => quickVisualizer?.resize());
  };

  const showSimulationView = (): void => {
    activeView.val = "simulation";
    updateVisualizerActivity();
    queueMicrotask(() => visualizer?.resize());
  };

  const currentSnapshot = (): SimulationSnapshot | null =>
    simulation?.snapshot() ?? null;

  const currentVisualSnapshot = () => simulation?.visualSnapshot() ?? null;

  const onFrame = (deltaSeconds: number): void => {
    if (!running.val || simulation === null) {
      return;
    }

    advanceRunningSimulation(deltaSeconds, 140);
  };

  const onQuickFrame = (deltaSeconds: number): void => {
    if (activeView.val !== "main" || !running.val || simulation === null) {
      return;
    }

    advanceRunningSimulation(deltaSeconds, 180);
  };

  const advanceRunningSimulation = (
    deltaSeconds: number,
    metricRefreshIntervalMs: number,
  ): void => {
    if (simulation === null) {
      return;
    }

    const requestedDeltaTime = deltaSeconds * speed.val;

    if (Number.isFinite(requestedDeltaTime) && requestedDeltaTime > 0) {
      pendingSimulationDeltaTime += requestedDeltaTime;
    }

    const lastAdvance = simulation.advanceTime(pendingSimulationDeltaTime);
    pendingSimulationDeltaTime = lastAdvance.eventCapReached
      ? lastAdvance.remainingDeltaTime
      : 0;
    const now = performance.now();

    if (now - lastUiMetricRefresh > metricRefreshIntervalMs) {
      lastUiMetricRefresh = now;
      simulationRevision.val += 1;
      updateCanvasLabels();
    }
  };

  const mountCanvas = (canvasElement: HTMLCanvasElement): void => {
    if (visualizer !== null) {
      return;
    }

    visualizer = new QueueCanvasVisualizer({
      canvas: canvasElement,
      getSnapshot: currentVisualSnapshot,
      getTerminology: () => terms.val,
      onFrame,
    });

    updateVisualizerActivity();
  };

  const mountQuickCanvas = (canvasElement: HTMLCanvasElement): void => {
    if (quickVisualizer !== null) {
      return;
    }

    quickVisualizer = new QueueCanvasVisualizer({
      canvas: canvasElement,
      emptyMessage: "Solve inputs for preview",
      getSnapshot: currentVisualSnapshot,
      getTerminology: () => terms.val,
      maxDetailedServers: 14,
      maxServerCells: 28,
      maxVisibleQueueCustomers: 10,
      onFrame: onQuickFrame,
      playing: false,
      variant: "compact",
    });

    updateVisualizerActivity();
  };

  const resetSimulation = (): void => {
    const result = readView().result;
    if (result.status !== "solved") {
      return;
    }

    simulation = new QueueSimulation(result.params, {
      collectStats: true,
      maxSnapshotQueueItems: 40,
      maxSnapshotServers: 180,
      theoreticalMetrics: result.metrics,
      statsThresholds: comparisonThresholds(result.metrics),
    });
    simulationKey = modelKey(result.metrics);
    pendingSimulationDeltaTime = 0;
    running.val = false;
    simulationRevision.val += 1;
    updateCanvasLabels();
    visualizer?.draw();
    quickVisualizer?.draw();
    updateVisualizerActivity();
  };

  const toggleSimulation = (): void => {
    const result = readView().result;
    syncSimulation(result, { pause: false });

    if (result.status === "solved" && simulation !== null) {
      running.val = !running.val;
      updateVisualizerActivity();
    }
  };

  const toggleQuickSimulation = (): void => {
    const result = readView().result;
    syncSimulation(result, { pause: false });

    if (result.status === "solved" && simulation !== null) {
      running.val = !running.val;
      updateVisualizerActivity();
    }
  };

  function updateVisualizerActivity(): void {
    if (disposed) {
      return;
    }

    const hasSimulation = simulation !== null;

    if (activeView.val === "simulation") {
      quickVisualizer?.pause();

      if (hasSimulation && running.val) {
        visualizer?.play();
      } else {
        visualizer?.pause();
      }

      return;
    }

    visualizer?.pause();

    if (hasSimulation && running.val) {
      quickVisualizer?.play();
    } else {
      quickVisualizer?.pause();
    }
  }

  function dispose(): void {
    if (disposed) {
      return;
    }

    disposed = true;
    simulation = null;
    simulationKey = null;

    if (modeFlashTimer !== undefined) {
      window.clearTimeout(modeFlashTimer);
      modeFlashTimer = undefined;
    }

    if (urlCopiedTimer !== undefined) {
      window.clearTimeout(urlCopiedTimer);
      urlCopiedTimer = undefined;
    }

    asyncSolver.dispose();
    visualizer?.dispose();
    quickVisualizer?.dispose();
    visualizer = null;
    quickVisualizer = null;
  }

  function updateCanvasLabels(): void {
    const summary = formatSnapshotSummary(
      currentSnapshot(),
      timeUnit.val,
      terms.val,
    );

    visualizerCanvas.setAttribute(
      "aria-label",
      summary ?? "Queueing simulation visualizer",
    );
    quickVisualizerCanvas.setAttribute(
      "aria-label",
      summary ?? "Quick queueing simulation preview",
    );
  }

  queueMicrotask(() => {
    if (disposed) {
      return;
    }

    requestSolve();
    syncSimulation(readView().result);
    updateCanvasLabels();
    syncUrlState();
  });
  const visualizerCanvas = canvas({
    "aria-label": "Queueing simulation visualizer",
    class: "queue-canvas",
  }) as HTMLCanvasElement;
  const quickVisualizerCanvas = canvas({
    "aria-label": "Quick queueing simulation preview",
    class: "queue-canvas quick-queue-canvas",
  }) as HTMLCanvasElement;
  queueMicrotask(() => {
    if (!disposed) {
      mountCanvas(visualizerCanvas);
    }
  });
  queueMicrotask(() => {
    if (!disposed) {
      mountQuickCanvas(quickVisualizerCanvas);
    }
  });

  const appElement = div(
    { class: "app-shell" },
    header(
      { class: "app-header" },
      div(
        { class: "title-block" },
        h1("Queueing Theory Calculator"),
        p(
          () =>
            `Solve and simulate ${pluralTerm(terms.val, "queue", {
              sentence: true,
            })}.`,
        ),
      ),
      div(
        { class: "topbar-panel" },
        div(
          { class: "topbar-time-stack" },
          label(
            { class: "mode-control topbar-time-control" },
            span("Time unit"),
            select(
              {
                "aria-label": "Time unit",
                value: () => timeUnit.val,
                onchange: (event: Event) =>
                  setTimeUnit(
                    (event.currentTarget as HTMLSelectElement)
                      .value as TimeUnitKey,
                  ),
              },
              TIME_UNITS.map((unit) =>
                option(
                  {
                    selected: () => timeUnit.val === unit.key,
                    value: unit.key,
                  },
                  unit.label,
                ),
              ),
            ),
          ),
          () => {
            const pendingConversion = pendingTimeUnitConversion.val;
            const isPending = pendingConversion !== null;

            return button(
              {
                "aria-hidden": String(!isPending),
                "aria-label": isPending
                  ? timeUnitConversionActionLabel(pendingConversion)
                  : "Convert pending time unit values",
                class: `topbar-convert-button${isPending ? "" : " is-hidden"}`,
                disabled: !isPending,
                title: isPending
                  ? timeUnitConversionActionLabel(pendingConversion)
                  : "",
                type: "button",
                onclick: applyPendingTimeUnitConversion,
              },
              span("Convert"),
              span(
                { class: "topbar-convert-from" },
                isPending ? ` from ${pendingConversion.from}` : " from seconds",
              ),
            );
          },
        ),
      ),
    ),
    () =>
      activeView.val === "simulation"
        ? div(
            { class: "view-stack simulation-view" },
            div(
              { class: "view-toolbar" },
              button(
                {
                  class: "button secondary",
                  type: "button",
                  onclick: showMainView,
                },
                "Back to main view",
              ),
            ),
            section(
              { class: "simulation-band" },
              div(
                { class: "simulation-panel" },
                div(
                  { class: "simulation-panel-header" },
                  h2("Discrete-event simulation"),
                ),
                () =>
                  SnapshotSummaryBadges(
                    currentSnapshot(),
                    timeUnit.val,
                    terms.val,
                    simulationRevision.val,
                  ),
                div({ class: "canvas-wrap" }, visualizerCanvas),
                SimulationControls({
                  running,
                  speed,
                  setSpeed,
                  getResult: () => readView().result,
                  reset: resetSimulation,
                  toggle: toggleSimulation,
                }),
              ),
              div({ class: "comparison-panel" }, () =>
                ComparisonPanel(
                  readView().result,
                  currentSnapshot(),
                  timeUnit.val,
                  terms.val,
                  {
                    isMetricHelpHighlighted,
                    isMetricHelpSelected,
                    toggleMetricHelpSelection,
                  },
                  simulationRevision.val,
                ),
              ),
            ),
          )
        : div(
            { class: "view-stack main-view" },
            section(
              { class: "workspace" },
              div(
                { class: "calculator-panel" },
                MetricGrid({
                  mode,
                  modeFlash,
                  drafts,
                  labelTooltipsSwapped,
                  lossPreset,
                  timeUnit,
                  terms,
                  urlCopied,
                  copyCurrentUrl,
                  getView: readView,
                  isMetricHelpHighlighted,
                  isMetricHelpSelected,
                  populateRandomInputs,
                  setMode,
                  setLossPreset,
                  resetInputs,
                  toggleMetricHelpSelection,
                  updateDraft,
                  clearDraft,
                }),
              ),
              div(
                { class: "side-stack" },
                QuickSimulationPanel({
                  canvasElement: quickVisualizerCanvas,
                  cycleSpeed,
                  getResult: () => readView().result,
                  onToggle: (open) => {
                    if (open) {
                      queueMicrotask(() => quickVisualizer?.resize());
                    } else {
                      running.val = false;
                      updateVisualizerActivity();
                    }
                  },
                  openSimulation: showSimulationView,
                  running,
                  speed,
                  toggle: toggleQuickSimulation,
                }),
                QueueModelHelpPanel({
                  isMetricHelpHighlighted,
                  isMetricHelpSelected,
                  mode,
                  setMetricHelpPreview,
                  terms,
                  timeUnit,
                  toggleMetricHelpSelection,
                }),
                TerminologyPanel({
                  labelTooltipsSwapped,
                  resetTerms,
                  setLabelTooltipsSwapped,
                  setTerminologyPreset,
                  terminologyPreset,
                  terms,
                  updateTerm,
                }),
              ),
            ),
          ),
    footer(
      { class: "app-footer" },
      p(
        a(
          {
            href: "https://github.com/Qu4tro/queue-theory-calculator",
            rel: "noopener noreferrer",
            target: "_blank",
          },
          "Github",
        ),
        span({ class: "app-footer-separator" }, "·"),
        a(
          {
            href: "https://en.wikipedia.org/wiki/Kendall%27s_notation",
            rel: "noopener noreferrer",
            target: "_blank",
          },
          "Kendall's notation",
        ),
      ),
    ),
  ) as HTMLElement;

  return Object.assign(appElement, { dispose });
}

function MetricGrid(props: MetricSheetProps): HTMLElement {
  const getPresentation = createMetricPresentationGetter(props);

  return section(
    { class: "calculator-sheet", "aria-label": "Queueing model inputs" },
    div(
      { class: "sheet-title-row" },
      div({ class: "sheet-title-heading" }, h2("Inputs"), () =>
        SheetStatusSummary(props.getView(), props.terms.val),
      ),
      div(
        { class: "sheet-title-actions" },
        () =>
          props.mode.val === "mmsk"
            ? label(
                { class: "loss-preset-control" },
                input({
                  checked: () => props.lossPreset.val,
                  type: "checkbox",
                  onchange: (event: Event) => {
                    props.setLossPreset(
                      (event.currentTarget as HTMLInputElement).checked,
                    );
                  },
                }),
                span("K = s"),
              )
            : "",
        label(
          {
            class: () =>
              `sheet-model-control queue-type-control ${
                props.modeFlash.val ? "is-flashing" : ""
              }`,
          },
          select(
            {
              "aria-label": "Queueing model",
              class: "sheet-model-select",
              value: () => props.mode.val,
              onchange: (event: Event) =>
                props.setMode(
                  (event.currentTarget as HTMLSelectElement)
                    .value as QueueModelKind,
                ),
            },
            QueueModelOptions(props.mode),
          ),
        ),
        button(
          {
            "aria-label": "Fill required inputs with a valid random example",
            class: "sheet-utility-button",
            title: "Fill required inputs with a valid random example.",
            type: "button",
            onclick: props.populateRandomInputs,
          },
          "Randomize",
        ),
        button(
          {
            "aria-label": "Copy a shareable link with the current inputs",
            class: "sheet-utility-button copy-link",
            title: "Copy a shareable link with the current inputs.",
            type: "button",
            onclick: () => void props.copyCurrentUrl(),
          },
          () => (props.urlCopied.val ? "Copied" : "Copy link"),
        ),
        button(
          {
            "aria-label": "Clear all inputs",
            class: "sheet-clear-all-button",
            type: "button",
            onclick: props.resetInputs,
          },
          "Clear all",
        ),
      ),
    ),
    div(
      { class: "sheet-scroll" },
      table(
        {
          class: () =>
            `metric-sheet${
              props.labelTooltipsSwapped.val ? " is-label-tooltip-swapped" : ""
            }`,
        },
        thead(
          tr(
            th({ scope: "col" }, "Quantity"),
            th({ scope: "col" }, "Value"),
            th({ scope: "col" }, "Unit"),
            th({ class: "sheet-action-heading", scope: "col" }, ""),
          ),
        ),
        () =>
          tbody(
            metricGroupsForMode(props.mode.val).flatMap(([title, keys]) => [
              tr(
                { class: "sheet-group-row" },
                th({ colspan: "4", scope: "colgroup" }, title),
              ),
              ...(keys as MetricKey[]).map((key) =>
                MetricRow(key, props, getPresentation),
              ),
            ]),
          ),
      ),
    ),
  );
}

function SheetStatusSummary(view: ParsedView, terms: Terminology): HTMLElement {
  const result = view.result;
  const title = statusTitle(result.status, terms);
  const badgeTitle = sheetStatusTitle(result.status);
  const message = statusMessage(result, terms);

  return div(
    {
      "aria-label": `Status: ${title}. ${message}`,
      class: `sheet-status-summary ${result.status}`,
      title: message,
    },
    span({ "aria-hidden": "true", class: "sheet-status-dot" }),
    span({ class: "sheet-status-title" }, badgeTitle),
  );
}

function sheetStatusTitle(status: UiSolverStatus): string {
  switch (status) {
    case "pending":
      return "Solving";
    case "solved":
      return "Solved";
    case "invalid-input":
      return "Invalid";
    case "need-more-inputs":
      return "Incomplete";
    case "inconsistent":
      return "Conflicting";
    case "unstable":
      return "Unstable";
    case "unsupported":
      return "Unsupported";
  }
}

function metricGroupsForMode(
  mode: QueueModelKind,
): Array<[string, readonly MetricKey[]]> {
  if (mode === "mmsk") {
    return [
      ["Model parameters", FINITE_PARAM_KEYS],
      ["Throughput and capacity", FINITE_THROUGHPUT_KEYS],
      ["Steady-state measures", STEADY_KEYS],
      ["Probability measures", DISPLAY_PROBABILITY_KEYS],
    ];
  }

  if (mode === "erlang-a") {
    return [
      ["Model parameters", ERLANG_A_PARAM_KEYS],
      ["Flow and offered load", ERLANG_A_FLOW_KEYS],
      ["Steady-state measures", STEADY_KEYS],
      ["Probability measures", ERLANG_A_PROBABILITY_KEYS],
    ];
  }

  if (mode === "mminf") {
    return [
      ["Model parameters", PARAM_KEYS],
      ["Offered load", MMINF_LOAD_KEYS],
      ["Steady-state measures", STEADY_KEYS],
      ["Probability measures", DISPLAY_PROBABILITY_KEYS],
    ];
  }

  if (mode === "mg1" || mode === "md1") {
    return [
      ["Model parameters", GENERAL_SERVICE_PARAM_KEYS],
      ["Steady-state measures", STEADY_KEYS],
      ["Probability measures", DISPLAY_PROBABILITY_KEYS],
    ];
  }

  if (mode === "ggs") {
    return [
      ["Model parameters", GGS_PARAM_KEYS],
      ["Steady-state measures", STEADY_KEYS],
      ["Probability measures", DISPLAY_PROBABILITY_KEYS],
    ];
  }

  return [
    ["Model parameters", PARAM_KEYS],
    ["Steady-state measures", STEADY_KEYS],
    ["Probability measures", DISPLAY_PROBABILITY_KEYS],
  ];
}

function QueueModelOptions(mode: { val: QueueModelKind }): HTMLOptionElement[] {
  return QUEUE_MODEL_ORDER.map((value) =>
    option(
      { selected: () => mode.val === value, value },
      QUEUE_MODEL_LABELS[value],
    ),
  );
}

function QueueModelHelpPanel(props: {
  isMetricHelpHighlighted: (key: MetricKey) => boolean;
  isMetricHelpSelected: (key: MetricKey) => boolean;
  mode: { val: QueueModelKind };
  setMetricHelpPreview: (key: MetricKey, highlighted: boolean) => void;
  terms: { val: Terminology };
  timeUnit: { val: TimeUnitKey };
  toggleMetricHelpSelection: (key: MetricKey) => void;
}): HTMLElement {
  return details(
    {
      class: "queue-help-panel",
      "aria-label": "Selected queue type guide",
      open: true,
    },
    summary(
      { class: "queue-help-summary" },
      h2(() => QUEUE_MODEL_LABELS[props.mode.val]),
      span({ "aria-hidden": "true", class: "queue-help-toggle" }, "+"),
    ),
    () => {
      const help = QUEUE_MODEL_HELP[props.mode.val];

      return div(
        { class: "queue-help-body" },
        p({ class: "queue-help-description" }, help.description),
        QueueHelpTextSection("Use for", help.choose),
        QueueHelpTextSection("Avoid", help.avoid),
        QueueHelpWatchSection(
          help.watch,
          props.terms.val,
          props.timeUnit.val,
          props,
        ),
        QueueHelpTextSection("Note", help.notes),
      );
    },
  );
}

function QueueHelpTextSection(
  title: string,
  items: readonly string[],
): HTMLElement {
  return div(
    { class: "queue-help-section" },
    h3(title),
    div(
      { class: "queue-help-copy-stack" },
      items.map((item) => p(item)),
    ),
  );
}

function QueueHelpWatchSection(
  items: readonly QueueModelWatchItem[],
  terms: Terminology,
  timeUnit: TimeUnitKey,
  highlights: QueueHelpHighlightProps,
): HTMLElement {
  return div(
    { class: "queue-help-section queue-help-watch-section" },
    h3("Watch"),
    div(
      { class: "queue-help-watch-list" },
      items.map((item) =>
        div(
          { class: "queue-help-watch-item" },
          QueueHelpVariableChip(item.key, terms, timeUnit, highlights),
          span({ class: "queue-help-watch-note" }, item.note),
        ),
      ),
    ),
  );
}

function QueueHelpVariableChip(
  key: MetricKey,
  terms: Terminology,
  timeUnit: TimeUnitKey,
  highlights: QueueHelpHighlightProps,
): HTMLButtonElement {
  return button(
    {
      "aria-label": `Highlight ${metricLabelParts(key, terms).label}`,
      "aria-pressed": () => String(highlights.isMetricHelpSelected(key)),
      class: () =>
        `queue-help-var${
          highlights.isMetricHelpHighlighted(key) ? " is-help-highlighted" : ""
        }`,
      title: metricDescription(
        key,
        terms,
        timeUnitDefinition(timeUnit).singular,
      ),
      type: "button",
      onblur: () => highlights.setMetricHelpPreview(key, false),
      onclick: () => {
        highlights.toggleMetricHelpSelection(key);
        highlights.setMetricHelpPreview(key, false);
        scrollMetricRowIntoView(key);
      },
      onfocus: () => highlights.setMetricHelpPreview(key, true),
      onmouseenter: () => highlights.setMetricHelpPreview(key, true),
      onmouseleave: (event: MouseEvent) => {
        if (event.currentTarget !== document.activeElement) {
          highlights.setMetricHelpPreview(key, false);
        }
      },
    },
    codeTag(metricCodeLabel(key)),
  ) as HTMLButtonElement;
}

function scrollMetricRowIntoView(key: MetricKey): void {
  const row = document.querySelector(`[data-metric="${key}"]`);

  if (!(row instanceof HTMLElement)) {
    return;
  }

  row.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function metricCodeLabel(key: MetricKey): string {
  return getMetricDefinition(key).symbol;
}

function MetricSymbol(
  key: MetricKey,
  className: string,
  title?: string | (() => string),
): HTMLElement {
  const attributes: {
    "aria-label": string;
    class: string;
    title?: string | (() => string);
  } = {
    "aria-label": getMetricDefinition(key).symbol,
    class: className,
  };

  if (title !== undefined) {
    attributes.title = title;
  }

  switch (key) {
    case "serviceScv":
      return span(attributes, "SCV", sub("s"));
    case "cs2":
      return span(attributes, "C", sub("s"), sup("2"));
    case "ca2":
      return span(attributes, "C", sub("a"), sup("2"));
    case "lambdaEffective":
      return span(attributes, "λ", sub("eff"));
    case "Ls":
      return span(attributes, "L", sub("s"));
    case "Lq":
      return span(attributes, "L", sub("q"));
    case "Wq":
      return span(attributes, "W", sub("q"));
    case "P0":
      return span(attributes, "P", sub("0"));
    case "abandonRate":
      return span(attributes, "λ", sub("ab"));
    case "throughput":
      return span(attributes, "λ", sub("served"));
    default:
      return span(attributes, getMetricDefinition(key).symbol);
  }
}

function MetricSymbolButton(
  key: MetricKey,
  props: MetricSheetProps,
  title: string | (() => string),
): HTMLButtonElement {
  return button(
    {
      "aria-label": () =>
        `Highlight ${metricLabelParts(key, props.terms.val).label}`,
      "aria-pressed": () => String(props.isMetricHelpSelected(key)),
      class: () =>
        `sheet-symbol-button${
          props.isMetricHelpSelected(key) ? " is-help-selected" : ""
        }`,
      title,
      type: "button",
      onclick: () => props.toggleMetricHelpSelection(key),
    },
    MetricSymbol(key, "metric-symbol sheet-symbol"),
  ) as HTMLButtonElement;
}

function MetricRow(
  key: MetricKey,
  props: MetricSheetProps,
  getPresentation: MetricPresentationGetter,
): HTMLElement {
  const definition = getMetricDefinition(key);
  const fieldId = `metric-${key}`;
  const inputMode = definition.valueKind === "integer" ? "numeric" : "decimal";
  const labelText = (): string => metricLabelParts(key, props.terms.val).label;
  const descriptionText = (): string =>
    metricDescription(
      key,
      props.terms.val,
      timeUnitDefinition(props.timeUnit.val).singular,
    );
  const visibleLabelText = (): string =>
    props.labelTooltipsSwapped.val ? descriptionText() : labelText();
  const labelTitleText = (): string =>
    props.labelTooltipsSwapped.val ? labelText() : descriptionText();

  return tr(
    {
      class: () => {
        const presentation = getPresentation(key);
        return `metric-row ${
          presentation.locked ? "is-locked" : "is-derived"
        } ${presentation.error ? "is-invalid" : ""} ${
          presentation.suggested ? "is-suggested" : ""
        } ${props.isMetricHelpHighlighted(key) ? "is-help-highlighted" : ""}`;
      },
      "data-metric": key,
    },
    th(
      {
        class: "sheet-metric-name",
        scope: "row",
      },
      div(
        { class: "sheet-parameter-content" },
        () => MetricSymbolButton(key, props, labelTitleText),
        label(
          {
            class: "sheet-parameter-label",
            for: fieldId,
            title: labelTitleText,
          },
          visibleLabelText,
        ),
      ),
    ),
    td(
      { class: "sheet-value-cell" },
      div(
        { class: "sheet-value-stack" },
        input({
          id: fieldId,
          "aria-invalid": () => (getPresentation(key).error ? "true" : "false"),
          class: () => {
            const presentation = getPresentation(key);
            const readOnlyClass = presentation.readOnly ? " is-read-only" : "";
            const suggestedClass = presentation.suggested
              ? " is-suggested"
              : "";
            const autoSolvedClass = presentation.autoSolved
              ? " is-auto-solved"
              : "";
            return `metric-input${readOnlyClass}${suggestedClass}${autoSolvedClass}`;
          },
          inputmode: inputMode,
          placeholder: () => getPresentation(key).placeholder,
          readOnly: () => getPresentation(key).readOnly,
          title: () => getPresentation(key).inputTitle ?? "",
          type: "text",
          value: () => getPresentation(key).draftValue,
          oninput: (event: InputEvent) => {
            const target = event.currentTarget as HTMLInputElement;

            if (target.readOnly) {
              return;
            }

            props.updateDraft(key, target.value);
          },
        }),
        () => {
          const conflictText = getPresentation(key).conflictText;
          return conflictText
            ? div({ class: "sheet-conflict-value" }, conflictText)
            : "";
        },
      ),
    ),
    td(
      {
        class: "sheet-unit",
        title: () =>
          metricUnitDescription(key, props.terms.val, props.timeUnit.val),
      },
      () => metricUnitLabel(key, props.terms.val, props.timeUnit.val),
    ),
    td({ class: "sheet-action-cell" }, () => {
      const presentation = getPresentation(key);
      return presentation.canClear
        ? button(
            {
              "aria-label": `Clear ${key}`,
              class: "sheet-clear-button",
              type: "button",
              onclick: () => props.clearDraft(key),
            },
            "Clear",
          )
        : "";
    }),
  );
}

async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText !== undefined) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall back to the older selection-based copy path below.
    }
  }

  return copyTextFallback(text);
}

function copyTextFallback(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  document.body.append(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  try {
    return document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}

function formatSnapshotSummary(
  snapshot: SimulationSnapshot | null,
  unitKey: TimeUnitKey,
  terms: Terminology,
): string | null {
  if (snapshot === null) {
    return null;
  }

  const queueSummary =
    snapshot.serverCapacity === "infinite"
      ? `No waiting ${termLabel(terms, "queue", { sentence: true })}.`
      : snapshot.queueOverflow > 0
        ? `${formatInteger(snapshot.queueLength)} ${pluralTerm(
            terms,
            "customer",
            {
              sentence: true,
            },
          )} waiting; ${formatInteger(snapshot.queue.length)} shown and ${formatInteger(
            snapshot.queueOverflow,
          )} more summarized.`
        : `${formatInteger(snapshot.queueLength)} ${pluralTerm(
            terms,
            "customer",
            {
              sentence: true,
            },
          )} waiting.`;
  const serverSummary =
    snapshot.serverCapacity === "infinite"
      ? `Active services: ${formatInteger(snapshot.busyServers)}.`
      : `${formatInteger(snapshot.busyServers)} of ${formatInteger(
          snapshot.serverCount,
        )} ${pluralTerm(terms, "server", { sentence: true })} busy.`;
  const capSummary = snapshot.lastAdvance.eventCapReached
    ? ` Event cap reached on the last advance; ${formatTimeForDisplay(
        snapshot.lastAdvance.remainingDeltaTime,
        unitKey,
      )} of requested simulation time remains queued.`
    : "";
  const hasFiniteCapacity =
    snapshot.serverCapacity === "finite" &&
    "K" in snapshot.params &&
    snapshot.params.K !== undefined;
  const arrivalsSummary = !hasFiniteCapacity
    ? `${formatInteger(snapshot.arrivals)} ${pluralTerm(terms, "arrival", {
        sentence: true,
      })}`
    : `${formatInteger(snapshot.arrivals)} attempted ${pluralTerm(
        terms,
        "arrival",
        {
          sentence: true,
        },
      )}, ${formatInteger(snapshot.acceptedArrivals)} accepted, ${formatInteger(
        snapshot.blockedArrivals,
      )} blocked`;
  const abandonmentSummary =
    snapshot.modelKind === "erlang-a"
      ? `, ${formatInteger(snapshot.abandonments)} abandonments`
      : "";

  return `Simulation time ${formatTimeForDisplay(
    snapshot.now,
    unitKey,
  )}. ${queueSummary} ${serverSummary} ${formatInteger(
    snapshot.completions,
  )} completions${abandonmentSummary} from ${arrivalsSummary}.${capSummary}`;
}

function SnapshotSummaryBadges(
  snapshot: SimulationSnapshot | null,
  unitKey: TimeUnitKey,
  terms: Terminology,
  _revision: number,
): HTMLElement {
  void _revision;

  if (snapshot === null) {
    return div(
      { "aria-label": "No active simulation.", class: "canvas-summary-badges" },
      simulationBadge("Simulation", "Inactive", "muted"),
    );
  }

  const summary = formatSnapshotSummary(snapshot, unitKey, terms);
  const customerPlural = pluralTerm(terms, "customer", { sentence: true });
  const serverPlural = pluralTerm(terms, "server", { sentence: true });
  const arrivalPlural = pluralTerm(terms, "arrival", { sentence: true });
  const hasFiniteCapacity =
    snapshot.serverCapacity === "finite" &&
    "K" in snapshot.params &&
    snapshot.params.K !== undefined;
  const systemCount = snapshotSystemCount(snapshot);
  const badges = [
    simulationBadge(
      "Simulation time",
      formatTimeForDisplay(snapshot.now, unitKey),
      undefined,
      "clock",
    ),
  ];

  if (snapshot.serverCapacity === "infinite") {
    badges.push(
      simulationBadge(
        "Waiting",
        `No ${termLabel(terms, "queue", { sentence: true })}`,
      ),
      simulationBadge("Active services", formatInteger(snapshot.busyServers)),
      simulationBadge(termLabel(terms, "system"), formatInteger(systemCount)),
    );
  } else {
    badges.push(
      simulationBadge(
        `${capitalize(customerPlural)} waiting`,
        formatInteger(snapshot.queueLength),
      ),
      simulationBadge(
        `${capitalize(serverPlural)} busy`,
        `${formatInteger(snapshot.busyServers)} / ${formatInteger(
          snapshot.serverCount,
        )}`,
      ),
      simulationBadge(termLabel(terms, "system"), formatInteger(systemCount)),
    );

    if (snapshot.queueOverflow > 0) {
      badges.push(
        simulationBadge("Queue shown", formatInteger(snapshot.queue.length)),
        simulationBadge("Summarized", formatInteger(snapshot.queueOverflow)),
      );
    }
  }

  badges.push(
    simulationBadge("Completions", formatInteger(snapshot.completions)),
  );

  if (hasFiniteCapacity) {
    badges.push(
      simulationBadge(
        `Attempted ${arrivalPlural}`,
        formatInteger(snapshot.arrivals),
      ),
      simulationBadge("Accepted", formatInteger(snapshot.acceptedArrivals)),
      simulationBadge("Blocked", formatInteger(snapshot.blockedArrivals)),
    );
  } else {
    badges.push(
      simulationBadge(
        capitalize(arrivalPlural),
        formatInteger(snapshot.arrivals),
      ),
    );
  }

  if (snapshot.modelKind === "erlang-a") {
    badges.push(
      simulationBadge("Abandonments", formatInteger(snapshot.abandonments)),
    );
  }

  if (snapshot.lastAdvance.eventCapReached) {
    badges.push(simulationBadge("Event cap", "Reached", "warning"));
    badges.push(
      simulationBadge(
        "Queued time",
        formatTimeForDisplay(snapshot.lastAdvance.remainingDeltaTime, unitKey),
        "warning",
      ),
    );
  }

  return div(
    {
      "aria-label": summary ?? "Queueing simulation state",
      class: "canvas-summary-badges",
    },
    ...badges,
  );
}

function snapshotSystemCount(snapshot: SimulationSnapshot): number {
  if (snapshot.serverCapacity === "infinite") {
    return snapshot.busyServers;
  }

  return snapshot.busyServers + snapshot.queueLength;
}

function simulationBadge(
  labelText: string,
  valueText: string,
  tone?: "muted" | "warning",
  valueKind?: "clock",
): HTMLElement {
  const toneClass = tone === undefined ? "" : ` is-${tone}`;
  const valueKindClass = valueKind === undefined ? "" : ` is-${valueKind}`;

  return span(
    { class: `badge simulation-badge${toneClass}${valueKindClass}` },
    span({ class: "simulation-badge-label" }, labelText),
    span({ class: "simulation-badge-value" }, valueText),
  );
}

function TerminologyPanel(props: {
  labelTooltipsSwapped: { val: boolean };
  terminologyPreset: { val: string };
  terms: { val: Terminology };
  updateTerm: (key: TermKey, value: string) => void;
  setLabelTooltipsSwapped: (enabled: boolean) => void;
  setTerminologyPreset: (presetId: string) => void;
  resetTerms: () => void;
}): HTMLElement {
  return details(
    { class: "terminology-panel" },
    summary(
      { class: "terminology-summary" },
      h2("Domain terms"),
      div(
        { class: "terminology-header-actions" },
        select(
          {
            "aria-label": "Domain term preset",
            class: "terminology-preset-select",
            value: () => props.terminologyPreset.val,
            onclick: stopSummaryControlEvent,
            onkeydown: stopSummaryControlEvent,
            onpointerdown: stopSummaryControlEvent,
            onchange: (event: Event) => {
              event.stopPropagation();
              props.setTerminologyPreset(
                (event.currentTarget as HTMLSelectElement).value,
              );
            },
          },
          TERMINOLOGY_PRESETS.map((preset) =>
            option(
              {
                selected: () => props.terminologyPreset.val === preset.id,
                value: preset.id,
              },
              preset.label,
            ),
          ),
        ),
        button(
          {
            "aria-label": "Clear domain terms",
            class: "terminology-clear-button",
            type: "button",
            onclick: (event: MouseEvent) => {
              event.preventDefault();
              event.stopPropagation();
              props.resetTerms();
            },
            onkeydown: stopSummaryControlEvent,
            onpointerdown: stopSummaryControlEvent,
          },
          "Clear",
        ),
      ),
      span({ "aria-hidden": "true", class: "terminology-toggle" }, "+"),
    ),
    div(
      { class: "terminology-body" },
      label(
        { class: "term-label-option" },
        input({
          checked: () => props.labelTooltipsSwapped.val,
          type: "checkbox",
          onchange: (event: Event) => {
            props.setLabelTooltipsSwapped(
              (event.currentTarget as HTMLInputElement).checked,
            );
          },
        }),
        span("Show descriptions as input labels"),
      ),
      div(
        { class: "term-grid" },
        TERM_KEYS.map((key) =>
          label(
            { class: "term-control" },
            span({ class: "term-control-label" }, `${capitalize(key)} term`),
            input({
              type: "text",
              value: () => props.terms.val[key],
              maxlength: "24",
              oninput: (event: InputEvent) => {
                props.updateTerm(
                  key,
                  (event.currentTarget as HTMLInputElement).value,
                );
              },
            }),
          ),
        ),
      ),
    ),
  );
}

function stopSummaryControlEvent(event: Event): void {
  event.stopPropagation();
}

function QuickSimulationPanel(props: {
  canvasElement: HTMLCanvasElement;
  cycleSpeed: () => void;
  getResult: () => UiSolverResult;
  onToggle: (open: boolean) => void;
  openSimulation: () => void;
  running: { val: boolean };
  speed: { val: number };
  toggle: () => void;
}): HTMLElement {
  const isRunning = (): boolean =>
    props.running.val && props.getResult().status === "solved";

  return details(
    {
      class: "quick-simulation-panel",
      open: true,
      ontoggle: (event: Event) =>
        props.onToggle((event.currentTarget as HTMLDetailsElement).open),
    },
    summary(
      { class: "quick-simulation-summary" },
      h2("Simulation"),
      div(
        { class: "quick-simulation-header-actions" },
        button(
          {
            "aria-label": () =>
              isRunning()
                ? "Pause simulation preview"
                : "Play simulation preview",
            "aria-pressed": () => String(isRunning()),
            class: () =>
              `quick-simulation-icon-button quick-simulation-play-button${
                isRunning() ? " is-running" : ""
              }`,
            disabled: () => props.getResult().status !== "solved",
            title: () =>
              isRunning()
                ? "Pause simulation preview"
                : "Play simulation preview",
            type: "button",
            onclick: (event: MouseEvent) => {
              event.preventDefault();
              event.stopPropagation();
              props.toggle();
            },
            onkeydown: stopSummaryControlEvent,
            onpointerdown: stopSummaryControlEvent,
          },
          span({ "aria-hidden": "true", class: "quick-simulation-play-icon" }),
        ),
        button(
          {
            "aria-label": () =>
              `Simulation speed ${formatSimulationSpeed(
                props.speed.val,
              )}. Change speed.`,
            class: "quick-simulation-icon-button quick-simulation-speed-button",
            disabled: () => props.getResult().status !== "solved",
            title: () =>
              `Simulation speed ${formatSimulationSpeed(props.speed.val)}`,
            type: "button",
            onclick: (event: MouseEvent) => {
              event.preventDefault();
              event.stopPropagation();
              props.cycleSpeed();
            },
            onkeydown: stopSummaryControlEvent,
            onpointerdown: stopSummaryControlEvent,
          },
          span({ "aria-hidden": "true", class: "quick-simulation-speed-icon" }),
          span({ class: "quick-simulation-speed-label" }, () =>
            formatSimulationSpeed(props.speed.val),
          ),
        ),
      ),
      span({ "aria-hidden": "true", class: "quick-simulation-toggle" }, "+"),
    ),
    div(
      { class: "quick-simulation-body" },
      button(
        {
          "aria-label": "Open full simulation",
          class: "quick-canvas-wrap",
          type: "button",
          onclick: props.openSimulation,
        },
        props.canvasElement,
      ),
    ),
  );
}

function SimulationControls(props: {
  running: { val: boolean };
  speed: { val: number };
  setSpeed: (speed: number) => void;
  getResult: () => UiSolverResult;
  reset: () => void;
  toggle: () => void;
}): HTMLElement {
  return div(
    { class: "simulation-controls" },
    div(
      { class: "control-row" },
      button(
        {
          "aria-label": () =>
            props.running.val ? "Pause simulation" : "Play simulation",
          class: "button primary",
          disabled: () => props.getResult().status !== "solved",
          type: "button",
          onclick: () => props.toggle(),
        },
        () => (props.running.val ? "Pause" : "Play"),
      ),
      button(
        {
          class: "button secondary",
          disabled: () => props.getResult().status !== "solved",
          type: "button",
          onclick: () => props.reset(),
        },
        "Reset simulation",
      ),
      label(
        { class: "speed-control" },
        span("Speed"),
        select(
          {
            value: () => String(props.speed.val),
            onchange: (event: Event) => {
              props.setSpeed(
                Number((event.currentTarget as HTMLSelectElement).value),
              );
            },
          },
          SPEED_OPTIONS.map((value) =>
            option(
              {
                selected: () => props.speed.val === value,
                value: String(value),
              },
              `${value}x`,
            ),
          ),
        ),
      ),
    ),
  );
}

function ComparisonPanel(
  result: UiSolverResult,
  snapshot: SimulationSnapshot | null,
  unitKey: TimeUnitKey,
  terms: Terminology,
  highlights: MetricHighlightToggleProps,
  _revision: number,
): HTMLElement {
  if (result.status !== "solved") {
    return section(
      { class: "comparison-content" },
      h2("Simulation vs analytical"),
      p(
        `Solve a stable queueing ${termLabel(terms, "system", {
          sentence: true,
        })} to compare simulated estimates with analytical values.`,
      ),
    );
  }

  const stats = snapshot?.stats ?? null;
  const comparisons = stats
    ? compareQueueStatsToTheory(result.metrics, stats)
    : [];
  const isApproximation = result.metrics.modelKind === "ggs";
  const referenceLabel = isApproximation ? "Approximation" : "Analytical";

  return section(
    { class: "comparison-content" },
    h2(
      isApproximation
        ? "Simulation vs approximation"
        : "Simulation vs analytical",
    ),
    div(
      { class: "sample-strip" },
      simulationBadge(
        "Sample time",
        formatTimeForDisplay(stats?.sampleElapsed, unitKey),
        undefined,
        "clock",
      ),
      simulationBadge(
        pluralTerm(terms, "arrival"),
        formatInteger(stats?.counters.arrivalsObserved ?? null),
      ),
      result.metrics.K === undefined
        ? ""
        : simulationBadge(
            "Blocked",
            formatInteger(stats?.counters.blockedArrivalsObserved ?? null),
          ),
      result.metrics.modelKind === "erlang-a"
        ? simulationBadge(
            "Abandoned",
            formatInteger(stats?.counters.abandonedCustomers ?? null),
          )
        : "",
      simulationBadge(
        "Completions",
        formatInteger(stats?.counters.completedCustomers ?? null),
      ),
    ),
    table(
      { class: "comparison-table" },
      thead(
        tr(
          th("Metric"),
          th(referenceLabel),
          th("Simulated"),
          th("Difference"),
          th("Assessment"),
        ),
      ),
      tbody(
        (comparisons.length > 0
          ? comparisons
          : comparisonMetricKeys(result.metrics).map((metric) => ({
              metric,
              theoretical: metricNumber(result.metrics, metric),
              simulated: null,
              absoluteDiff: null,
              relativeDiff: null,
              badge: "unavailable" as const,
            }))
        ).map((comparison) => {
          const quality =
            result.metrics.computation?.metricQuality[comparison.metric];
          const badge =
            quality === "mm-s-baseline" ? "baseline" : comparison.badge;

          return tr(
            {
              class: () =>
                `comparison-row${
                  highlights.isMetricHelpHighlighted(comparison.metric)
                    ? " is-help-highlighted"
                    : ""
                }`,
              "data-metric": comparison.metric,
            },
            td(
              {
                title: metricDescription(
                  comparison.metric,
                  terms,
                  timeUnitDefinition(unitKey).singular,
                ),
              },
              ComparisonMetricSymbolButton(
                comparison.metric,
                terms,
                unitKey,
                highlights,
              ),
            ),
            td(
              result.metrics.modelKind === "mminf" && comparison.metric === "s"
                ? INFINITY_DISPLAY
                : comparison.theoretical === null
                  ? NOT_APPLICABLE_DISPLAY
                  : formatMetricForDisplay(
                      comparison.metric,
                      comparison.theoretical,
                      unitKey,
                    ),
            ),
            td(
              result.metrics.modelKind === "mminf" && comparison.metric === "s"
                ? INFINITY_DISPLAY
                : comparison.simulated === null
                  ? comparison.theoretical === null
                    ? NOT_APPLICABLE_DISPLAY
                    : EMPTY_DISPLAY_PLACEHOLDER
                  : formatMetricForDisplay(
                      comparison.metric,
                      comparison.simulated,
                      unitKey,
                    ),
            ),
            td(
              formatDifference(
                comparison.metric,
                comparison.absoluteDiff,
                comparison.relativeDiff,
                unitKey,
              ),
            ),
            td(span({ class: `badge ${badge}` }, comparisonBadgeLabel(badge))),
          );
        }),
      ),
    ),
  );
}

function ComparisonMetricSymbolButton(
  key: MetricKey,
  terms: Terminology,
  unitKey: TimeUnitKey,
  highlights: MetricHighlightToggleProps,
): HTMLButtonElement {
  return button(
    {
      "aria-label": `Highlight ${metricLabelParts(key, terms).label}`,
      "aria-pressed": () => String(highlights.isMetricHelpSelected(key)),
      class: () =>
        `comparison-symbol-button${
          highlights.isMetricHelpSelected(key) ? " is-help-selected" : ""
        }`,
      title: metricDescription(
        key,
        terms,
        timeUnitDefinition(unitKey).singular,
      ),
      type: "button",
      onclick: () => highlights.toggleMetricHelpSelection(key),
    },
    MetricSymbol(key, "metric-symbol comparison-symbol"),
  ) as HTMLButtonElement;
}

function comparisonBadgeLabel(badge: ComparisonBadge): string {
  switch (badge) {
    case "pending":
      return "Collecting";
    case "near":
      return "Close";
    case "watch":
      return "Off";
    case "wide":
      return "Far";
    case "configured":
      return "Set";
    case "unavailable":
      return "No sample";
    case "baseline":
      return "Baseline";
  }
}

function statusTitle(status: UiSolverStatus, terms: Terminology): string {
  switch (status) {
    case "pending":
      return "Solving";
    case "solved":
      return "Solved";
    case "invalid-input":
      return "Invalid input";
    case "need-more-inputs":
      return "Need more inputs";
    case "inconsistent":
      return "Inconsistent constraints";
    case "unstable":
      return `Unstable ${termLabel(terms, "queue", { sentence: true })}`;
    case "unsupported":
      return "Unsupported combination";
  }
}

function statusMessage(result: UiSolverResult, terms: Terminology): string {
  switch (result.status) {
    case "pending":
      return "Solving the current inputs.";
    case "solved":
      if (result.metrics.modelKind === "mminf") {
        return "Solved the M/M/∞ no-wait model.";
      }

      if (result.metrics.modelKind === "mg1") {
        return `Solved the M/G/1 general-service model with one ${termLabel(
          terms,
          "server",
          { sentence: true },
        )}.`;
      }

      if (result.metrics.modelKind === "md1") {
        return "Solved the M/D/1 deterministic-service model.";
      }

      if (result.metrics.modelKind === "ggs") {
        return result.metrics.computation.method === "exact-mm-s"
          ? "Solved the G/G/s case as the exact M/M/s baseline because both SCVs are 1."
          : "Solved a stable G/G/s Allen-Cunneen approximation.";
      }

      if (result.metrics.modelKind === "erlang-a") {
        return "Solved the M/M/s+M Erlang A abandonment model.";
      }

      return `All supplied constraints match the selected ${termLabel(
        terms,
        "system",
        {
          sentence: true,
        },
      )}.`;
    case "invalid-input":
      return "Fix the highlighted field values before solving.";
    case "need-more-inputs":
      if (
        result.issues.some(
          (issue) =>
            issue.code === "missing-rate-scale" ||
            issue.message.includes("M/M/∞") ||
            issue.message.includes("M/M/infinity"),
        )
      ) {
        return "Add enough M/M/∞ values to determine both lambda and mu.";
      }

      return `Add another independent rate, traffic intensity, ${termLabel(
        terms,
        "server",
        { sentence: true },
      )} count, or time-scale value.`;
    case "inconsistent":
      return `At least one locked value conflicts with the solved ${termLabel(
        terms,
        "queue",
        { sentence: true },
      )}.`;
    case "unstable":
      return `${termLabel(terms, "arrival")} rate must stay below total service capacity for a finite steady state.`;
    case "unsupported":
      return "This input set is valid, but this version cannot infer the missing base parameters.";
  }
}

function capitalize(value: string): string {
  if (value.length === 0) {
    return value;
  }

  return `${value[0]?.toLocaleUpperCase()}${value.slice(1)}`;
}
