import { getMetricDefinition, METRIC_KEYS, type MetricKey } from "./metrics";

export const TERMINOLOGY_STORAGE_KEY = "queue-theory-calculator:terminology:v1";
export const MAX_TERM_LENGTH = 24;

export const TERM_KEYS = [
  "customer",
  "system",
  "queue",
  "server",
  "arrival",
] as const;

export type TermKey = (typeof TERM_KEYS)[number];
export type Terminology = Record<TermKey, string>;

export type StoredTerminologyV1 = {
  version: 1;
  terms: Partial<Terminology>;
};

export type MetricLabelOptions = {
  includeSymbol?: boolean;
};

export type TermLabelOptions = {
  plural?: boolean;
  sentence?: boolean;
};

export const defaultTerminology: Terminology = {
  customer: "Customer",
  system: "System",
  queue: "Queue",
  server: "Server",
  arrival: "Arrival",
};

export function isTermKey(value: string): value is TermKey {
  return TERM_KEYS.includes(value as TermKey);
}

export function normalizeTerm(
  key: TermKey,
  value: unknown,
  maxLength = MAX_TERM_LENGTH,
): string {
  const fallback = defaultTerminology[key];

  if (typeof value !== "string") {
    return fallback;
  }

  const cleaned = Array.from(value)
    .map((character) =>
      isUnsafeTerminologyCharacter(character) ? " " : character,
    )
    .join("")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length === 0) {
    return fallback;
  }

  const max = Math.max(1, Math.floor(maxLength));
  return Array.from(cleaned).slice(0, max).join("");
}

export function normalizeTerminology(
  terms: Partial<Record<TermKey, unknown>> | null | undefined,
): Terminology {
  const normalized: Terminology = { ...defaultTerminology };

  if (!terms) {
    return normalized;
  }

  for (const key of TERM_KEYS) {
    normalized[key] = normalizeTerm(key, terms[key]);
  }

  return normalized;
}

export function withTerminologyTerm(
  terms: Partial<Record<TermKey, unknown>> | null | undefined,
  key: TermKey,
  value: unknown,
): Terminology {
  return {
    ...normalizeTerminology(terms),
    [key]: normalizeTerm(key, value),
  };
}

export function isDefaultTerminology(
  terms: Partial<Record<TermKey, unknown>> | null | undefined,
): boolean {
  const normalized = normalizeTerminology(terms);

  return TERM_KEYS.every((key) => normalized[key] === defaultTerminology[key]);
}

export function loadTerminology(
  storage: Storage | null = getBrowserLocalStorage(),
): Terminology {
  if (!storage) {
    return { ...defaultTerminology };
  }

  try {
    const raw = storage.getItem(TERMINOLOGY_STORAGE_KEY);

    if (!raw) {
      return { ...defaultTerminology };
    }

    const parsed: unknown = JSON.parse(raw);

    if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.terms)) {
      return { ...defaultTerminology };
    }

    return normalizeTerminology(parsed.terms);
  } catch {
    return { ...defaultTerminology };
  }
}

export function saveTerminology(
  terms: Partial<Record<TermKey, unknown>> | null | undefined,
  storage: Storage | null = getBrowserLocalStorage(),
): void {
  if (!storage) {
    return;
  }

  const normalized = normalizeTerminology(terms);
  const customTerms: Partial<Terminology> = {};

  for (const key of TERM_KEYS) {
    if (normalized[key] !== defaultTerminology[key]) {
      customTerms[key] = normalized[key];
    }
  }

  try {
    if (Object.keys(customTerms).length === 0) {
      storage.removeItem(TERMINOLOGY_STORAGE_KEY);
      return;
    }

    const stored: StoredTerminologyV1 = {
      version: 1,
      terms: customTerms,
    };

    storage.setItem(TERMINOLOGY_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Ignore storage failures; terminology is presentation-only.
  }
}

export function resetTerminology(
  storage: Storage | null = getBrowserLocalStorage(),
): Terminology {
  if (storage) {
    try {
      storage.removeItem(TERMINOLOGY_STORAGE_KEY);
    } catch {
      // Ignore storage failures; defaults still apply in memory.
    }
  }

  return { ...defaultTerminology };
}

export function termLabel(
  terms: Partial<Record<TermKey, unknown>> | null | undefined,
  key: TermKey,
  options: TermLabelOptions = {},
): string {
  const normalized = normalizeTerminology(terms);
  const label = options.plural
    ? pluralizeTerm(normalized[key])
    : normalized[key];

  return options.sentence ? lowerFirst(label) : label;
}

export function pluralTerm(
  terms: Partial<Record<TermKey, unknown>> | null | undefined,
  key: TermKey,
  options: Pick<TermLabelOptions, "sentence"> = {},
): string {
  return termLabel(terms, key, {
    plural: true,
    sentence: options.sentence,
  });
}

export function pluralizeTerm(term: string): string {
  const normalized = term.trim();

  if (normalized.length === 0) {
    return normalized;
  }

  const match = normalized.match(/^(.*?)([A-Za-z]+)$/);

  if (!match) {
    return `${normalized}s`;
  }

  const [, prefix, lastWord] = match;
  return `${prefix}${pluralizeWord(lastWord)}`;
}

export function metricLabel(
  key: MetricKey,
  terms:
    | Partial<Record<TermKey, unknown>>
    | null
    | undefined = defaultTerminology,
  options: MetricLabelOptions = {},
): string {
  const label = metricFriendlyLabel(key, terms);

  if (options.includeSymbol) {
    return `${label} (${getMetricDefinition(key).symbol})`;
  }

  return label;
}

export function metricDisplayLabel(
  key: MetricKey,
  terms:
    | Partial<Record<TermKey, unknown>>
    | null
    | undefined = defaultTerminology,
): string {
  return metricLabel(key, terms, { includeSymbol: true });
}

export function metricLabelParts(
  key: MetricKey,
  terms:
    | Partial<Record<TermKey, unknown>>
    | null
    | undefined = defaultTerminology,
): { label: string; symbol: string } {
  return {
    label: metricFriendlyLabel(key, terms),
    symbol: getMetricDefinition(key).symbol,
  };
}

export function metricDescription(
  key: MetricKey,
  terms:
    | Partial<Record<TermKey, unknown>>
    | null
    | undefined = defaultTerminology,
  timeUnitSingular = "time unit",
): string {
  const normalized = normalizeTerminology(terms);
  const customer = termLabel(normalized, "customer", { sentence: true });
  const customerPlural = pluralTerm(normalized, "customer", {
    sentence: true,
  });
  const system = termLabel(normalized, "system", { sentence: true });
  const queue = termLabel(normalized, "queue", { sentence: true });
  const server = termLabel(normalized, "server", { sentence: true });
  const serverPlural = pluralTerm(normalized, "server", { sentence: true });
  const arrival = termLabel(normalized, "arrival", { sentence: true });
  const arrivalPlural = pluralTerm(normalized, "arrival", { sentence: true });
  const arrivalArticle = articlePhrase(arrival);

  switch (key) {
    case "lambda":
      return `How many ${arrivalPlural} show up per ${timeUnitSingular}?`;
    case "mu":
      return `How many ${customerPlural} can one ${server} serve per ${timeUnitSingular}?`;
    case "s":
      return `How many ${serverPlural} can work at the same time?`;
    case "K":
      return `How many ${customerPlural} can fit in the ${system} at once, including the ones waiting?`;
    case "theta":
      return `How quickly does one waiting ${customer} give up, measured per ${timeUnitSingular}?`;
    case "serviceScv":
      return "How much do service times vary, where 0 means always the same and 1 means very random?";
    case "ca2":
      return `How uneven are the gaps between ${arrivalPlural}?`;
    case "cs2":
      return "How much do service times vary, where 0 means always the same and 1 means very random?";
    case "a":
      return "How much service work is offered, measured as arrival rate divided by service rate?";
    case "offeredRho":
      return "How much work is trying to enter compared with total service capacity?";
    case "lambdaEffective":
      return `How many ${arrivalPlural} actually get into the ${system} per ${timeUnitSingular}?`;
    case "Ls":
      return `How many ${customerPlural} are being served at a typical moment?`;
    case "L":
      return `How many ${customerPlural} are in the ${system} at a typical moment?`;
    case "Lq":
      return `How many ${customerPlural} are waiting in the ${queue} at a typical moment?`;
    case "W":
      return `How long does one ${customer} spend in the ${system} on average?`;
    case "Wq":
      return `How long does one ${customer} wait in the ${queue} on average?`;
    case "rho":
      return "How busy is the total service capacity on average?";
    case "P0":
      return `How often is the ${system} completely empty?`;
    case "Pbusy":
      return `How likely is ${articlePhrase(server)} to be busy?`;
    case "Pwait":
      return `How likely is ${arrivalArticle} that enters the ${system} to wait before service starts?`;
    case "abandonRate":
      return `How many waiting ${customerPlural} give up and leave per ${timeUnitSingular}?`;
    case "throughput":
      return `How many ${customerPlural} finish service per ${timeUnitSingular}?`;
    case "Pabandon":
      return `How likely is ${arrivalArticle} to give up before service?`;
    case "Pserved":
      return `How likely is ${arrivalArticle} to eventually finish service?`;
    case "Pblock":
      return `How likely is ${arrivalArticle} to be turned away because the ${system} is full?`;
  }
}

export function metricLabels(
  terms:
    | Partial<Record<TermKey, unknown>>
    | null
    | undefined = defaultTerminology,
  keys: readonly MetricKey[] = METRIC_KEYS,
): Record<MetricKey, string> {
  const labels = {} as Record<MetricKey, string>;

  for (const key of keys) {
    labels[key] = metricLabel(key, terms);
  }

  return labels;
}

export function metricFriendlyLabel(
  key: MetricKey,
  terms:
    | Partial<Record<TermKey, unknown>>
    | null
    | undefined = defaultTerminology,
): string {
  const normalized = normalizeTerminology(terms);
  const customerPlural = pluralTerm(normalized, "customer", {
    sentence: true,
  });
  const systemTitle = termLabel(normalized, "system");
  const system = termLabel(normalized, "system", { sentence: true });
  const queue = termLabel(normalized, "queue", { sentence: true });
  const serverPlural = pluralTerm(normalized, "server", { sentence: true });
  const serverSentence = termLabel(normalized, "server", { sentence: true });
  const arrival = termLabel(normalized, "arrival");
  const arrivalSentence = termLabel(normalized, "arrival", { sentence: true });

  switch (key) {
    case "lambda":
      return `${arrival} rate`;
    case "mu":
      return `Service rate per ${serverSentence}`;
    case "s":
      return `Number of ${serverPlural}`;
    case "K":
      return `${systemTitle} capacity`;
    case "theta":
      return "Patience expiration rate";
    case "serviceScv":
      return "Service SCV";
    case "ca2":
      return `${arrival} SCV`;
    case "cs2":
      return "Service SCV";
    case "a":
      return "Offered load";
    case "offeredRho":
      return "Offered traffic ratio";
    case "lambdaEffective":
      return `Accepted ${arrivalSentence} rate`;
    case "Ls":
      return `Mean number of ${customerPlural} in service`;
    case "L":
      return `Mean number of ${customerPlural} in ${system}`;
    case "Lq":
      return `Mean number of ${customerPlural} in ${queue}`;
    case "W":
      return `Mean time in ${system}`;
    case "Wq":
      return `Mean waiting time in ${queue}`;
    case "rho":
      return "Traffic intensity";
    case "P0":
      return `Probability of zero ${customerPlural} in ${system}`;
    case "Pbusy":
      return `Probability ${articlePhrase(serverSentence)} is busy`;
    case "Pwait":
      return `Delay probability for accepted ${arrivalSentence}`;
    case "abandonRate":
      return "Abandonment rate";
    case "throughput":
      return "Service throughput";
    case "Pabandon":
      return "Abandonment probability";
    case "Pserved":
      return "Service probability";
    case "Pblock":
      return "Blocking probability";
  }
}

function getBrowserLocalStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnsafeTerminologyCharacter(value: string): boolean {
  const code = value.codePointAt(0);

  if (code === undefined) {
    return false;
  }

  return (
    code <= 0x1f ||
    code === 0x7f ||
    code === 0x061c ||
    code === 0x200e ||
    code === 0x200f ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  );
}

function pluralizeWord(word: string): string {
  if (/[sxz]$/i.test(word) || /(ch|sh)$/i.test(word)) {
    return `${word}es`;
  }

  if (/[^aeiou]y$/i.test(word)) {
    return `${word.slice(0, -1)}ies`;
  }

  return `${word}s`;
}

function articlePhrase(term: string): string {
  const sentenceTerm = lowerFirst(term);
  const article = /^[aeiou]/i.test(sentenceTerm) ? "an" : "a";

  return `${article} ${sentenceTerm}`;
}

function lowerFirst(value: string): string {
  if (value.length === 0) {
    return value;
  }

  return `${value[0].toLocaleLowerCase()}${value.slice(1)}`;
}
