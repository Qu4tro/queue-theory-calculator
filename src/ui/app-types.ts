import type { QueueMetricComparisonBadge } from "../queue/stats";
import type {
  QueueInputMap,
  QueueModelKind,
  QueueVariableId,
  SolverIssue,
  SolverResult,
  SolverStatus,
} from "../queue/types";
import type { MetricKey } from "./metrics";
import type { Terminology } from "./terminology";

export type FieldDrafts = Partial<Record<MetricKey, string>>;
export type FieldErrors = Partial<Record<MetricKey, string>>;
export type ComparisonBadge = QueueMetricComparisonBadge | "baseline";
export type PendingSolverResult = { status: "pending"; issues: [] };
export type UiSolverResult = SolverResult | PendingSolverResult;
export type UiSolverStatus = SolverStatus | "pending";

export type ParsedView = {
  input: QueueInputMap;
  fieldErrors: FieldErrors;
  result: UiSolverResult;
};

export type ParsedViewCache = {
  drafts: FieldDrafts;
  lossPreset: boolean;
  mode: QueueModelKind;
  revision: number;
  result: UiSolverResult;
  terms: Terminology;
  timeUnit: TimeUnitKey;
  view: ParsedView;
};

export type MetricIssuesByVariable = Partial<
  Record<QueueVariableId, SolverIssue>
>;

export type MetricPresentationContext = {
  view: ParsedView;
  drafts: FieldDrafts;
  issuesByField: MetricIssuesByVariable;
  lossPreset: boolean;
  mode: QueueModelKind;
  suggestedKeys: ReadonlySet<MetricKey>;
  timeUnit: TimeUnitKey;
};

export type MetricPresentation = {
  autoSolved: boolean;
  canClear: boolean;
  computedText: string;
  conflictText: string | undefined;
  draftValue: string;
  error: string | undefined;
  inputTitle: string | undefined;
  locked: boolean;
  placeholder: string;
  readOnly: boolean;
  suggested: boolean;
};

export type MetricPresentationGetter = (key: MetricKey) => MetricPresentation;

export type MetricPresentationCache = {
  context: MetricPresentationContext;
  drafts: FieldDrafts;
  lossPreset: boolean;
  mode: QueueModelKind;
  presentations: Map<MetricKey, MetricPresentation>;
  timeUnit: TimeUnitKey;
  view: ParsedView;
};

export type MetricSheetProps = {
  mode: { val: QueueModelKind };
  modeFlash: { val: boolean };
  drafts: { val: FieldDrafts };
  labelTooltipsSwapped: { val: boolean };
  lossPreset: { val: boolean };
  timeUnit: { val: TimeUnitKey };
  terms: { val: Terminology };
  urlCopied: { val: boolean };
  copyCurrentUrl: () => Promise<void>;
  getView: () => ParsedView;
  isMetricHelpHighlighted: (key: MetricKey) => boolean;
  isMetricHelpSelected: (key: MetricKey) => boolean;
  populateRandomInputs: () => void;
  setMode: (mode: QueueModelKind) => void;
  setLossPreset: (enabled: boolean) => void;
  resetInputs: () => void;
  toggleMetricHelpSelection: (key: MetricKey) => void;
  updateDraft: (key: MetricKey, value: string) => void;
  clearDraft: (key: MetricKey) => void;
};

export type TimeUnitKey = "seconds" | "minutes" | "hours";

export type TimeUnitDefinition = {
  key: TimeUnitKey;
  label: string;
  shortLabel: string;
  singular: string;
  seconds: number;
};

export type PendingTimeUnitConversion = {
  from: TimeUnitKey;
  to: TimeUnitKey;
};

export type TerminologyPreset = {
  id: string;
  label: string;
  terms: Terminology;
};

export type QueueModelWatchItem = {
  key: MetricKey;
  note: string;
};

export type QueueModelHelpDefinition = {
  description: string;
  choose: readonly string[];
  avoid: readonly string[];
  watch: readonly QueueModelWatchItem[];
  notes: readonly string[];
};

export type QueueHelpHighlightProps = {
  isMetricHelpHighlighted: (key: MetricKey) => boolean;
  isMetricHelpSelected: (key: MetricKey) => boolean;
  setMetricHelpPreview: (key: MetricKey, highlighted: boolean) => void;
  toggleMetricHelpSelection: (key: MetricKey) => void;
};

export type MetricHighlightToggleProps = {
  isMetricHelpHighlighted: (key: MetricKey) => boolean;
  isMetricHelpSelected: (key: MetricKey) => boolean;
  toggleMetricHelpSelection: (key: MetricKey) => void;
};

export type UrlState = {
  drafts: FieldDrafts;
  lossPreset?: boolean;
  mode?: QueueModelKind;
  speed?: number;
  termPreset?: string;
  terms?: Terminology;
  timeUnit?: TimeUnitKey;
};

export type AppView = "main" | "simulation";

export type AppElement = HTMLElement & { dispose: () => void };
