import type { QueueModelKind, QueueVariableId } from "../queue/types";
import type { QueueModelHelpDefinition, TerminologyPreset } from "./app-types";
import type { MetricKey } from "./metrics";
import { defaultTerminology, TERM_KEYS, type Terminology } from "./terminology";

export const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 5, 10, 25] as const;
export const INFINITY_DISPLAY = "∞";
export const RATE_KEYS: MetricKey[] = [
  "lambda",
  "mu",
  "theta",
  "lambdaEffective",
  "abandonRate",
  "throughput",
];
export const POSITIVE_RATE_KEYS: MetricKey[] = ["lambda", "mu", "theta"];
export const TIME_KEYS: MetricKey[] = ["W", "Wq"];
export const PARAM_KEYS: MetricKey[] = ["lambda", "mu", "s"];
export const MMINF_LOAD_KEYS: MetricKey[] = ["a"];
export const ERLANG_A_PARAM_KEYS: MetricKey[] = ["lambda", "mu", "s", "theta"];
export const GGS_PARAM_KEYS: MetricKey[] = ["lambda", "mu", "s", "ca2", "cs2"];
export const GENERAL_SERVICE_PARAM_KEYS: MetricKey[] = [
  "lambda",
  "mu",
  "s",
  "serviceScv",
];
export const FINITE_PARAM_KEYS: MetricKey[] = ["lambda", "mu", "s", "K"];
export const FINITE_THROUGHPUT_KEYS: MetricKey[] = [
  "lambdaEffective",
  "Pblock",
];
export const ERLANG_A_FLOW_KEYS: MetricKey[] = [
  "throughput",
  "abandonRate",
  "offeredRho",
  "Ls",
];
export const STEADY_KEYS: MetricKey[] = ["L", "Lq", "W", "Wq"];
export const PROBABILITY_KEYS: MetricKey[] = [
  "rho",
  "P0",
  "Pbusy",
  "Pwait",
  "Pabandon",
  "Pserved",
  "Pblock",
];
export const DISPLAY_PROBABILITY_KEYS: MetricKey[] = [
  "rho",
  "P0",
  "Pbusy",
  "Pwait",
];
export const INFINITE_DERIVED_KEYS: MetricKey[] = [
  "L",
  "Lq",
  "W",
  "Wq",
  "P0",
  "Pwait",
];
export const DIMENSIONLESS_GUIDANCE_KEYS: MetricKey[] = [
  "L",
  "Lq",
  "P0",
  "Pwait",
];
export const TIME_GUIDANCE_KEYS: MetricKey[] = ["W", "Wq"];
export const FINITE_SHAPE_GUIDANCE_KEYS: MetricKey[] = [
  "L",
  "Lq",
  "rho",
  "P0",
  "Pwait",
  "Pblock",
];
export const FINITE_SCALE_GUIDANCE_KEYS: MetricKey[] = [
  "lambdaEffective",
  "W",
  "Wq",
];
export const GENERAL_SERVICE_TARGET_KEYS: MetricKey[] = ["L", "Lq", "W", "Wq"];
export const GENERAL_SERVICE_RHO_KEYS: MetricKey[] = ["rho", "P0", "Pwait"];
export const GGS_KNOWN_LAMBDA_TARGET_KEYS: MetricKey[] = ["L", "Lq", "Wq"];
export const GGS_KNOWN_MU_TARGET_KEYS: MetricKey[] = ["L", "Lq", "W", "Wq"];
export const ERLANG_A_RATE_TARGET_KEYS: MetricKey[] = [
  "L",
  "Lq",
  "W",
  "Wq",
  "P0",
  "Pwait",
  "Pabandon",
  "rho",
];
export const ERLANG_A_THETA_TARGET_KEYS: MetricKey[] = [
  "Lq",
  "Wq",
  "Pabandon",
  "abandonRate",
];
export const ERLANG_A_PROBABILITY_KEYS: MetricKey[] = [
  "rho",
  "P0",
  "Pbusy",
  "Pwait",
  "Pabandon",
  "Pserved",
];
export const BASE_PARAM_KEYS: QueueVariableId[] = ["lambda", "mu", "s"];
export const FINITE_QUERY_KEYS: MetricKey[] = [
  "K",
  "lambdaEffective",
  "Pblock",
];
export const FIXED_SINGLE_SERVER_MODES: QueueModelKind[] = [
  "mm1",
  "mg1",
  "md1",
];
export const MMINF_NOT_APPLICABLE_KEYS: MetricKey[] = ["rho", "Pbusy"];
export const MMINF_READONLY_ZERO_KEYS: MetricKey[] = ["Lq", "Wq", "Pwait"];
export const MMINF_DROPPED_QUERY_KEYS: MetricKey[] = [
  "s",
  "K",
  "lambdaEffective",
  "Lq",
  "Wq",
  "rho",
  "Pbusy",
  "Pblock",
  "serviceScv",
  "ca2",
  "cs2",
  "theta",
  "offeredRho",
  "Ls",
  "abandonRate",
  "throughput",
  "Pabandon",
  "Pserved",
];
export const MMINF_QUERY_KEYS: MetricKey[] = ["a"];
export const GGS_QUERY_KEYS: MetricKey[] = ["ca2", "cs2"];
export const ERLANG_A_QUERY_KEYS: MetricKey[] = [
  "theta",
  "offeredRho",
  "Ls",
  "abandonRate",
  "throughput",
  "Pabandon",
  "Pserved",
];
export const DEFAULT_QUEUE_MODEL: QueueModelKind = "mm1";
export const DEFAULT_SIMULATION_SPEED = 1;
export const RANDOM_DRAFT_DECIMAL_PLACES = 2;

export const TERMINOLOGY_PRESETS = [
  {
    id: "default",
    label: "Default",
    terms: defaultTerminology,
  },
  {
    id: "call-center",
    label: "Call center",
    terms: {
      customer: "Caller",
      system: "Contact center",
      queue: "Hold queue",
      server: "Agent",
      arrival: "Call",
    },
  },
  {
    id: "retail-checkout",
    label: "Retail checkout",
    terms: {
      customer: "Shopper",
      system: "Store",
      queue: "Checkout line",
      server: "Cashier",
      arrival: "Shopper",
    },
  },
  {
    id: "bank-branch",
    label: "Bank branch",
    terms: {
      customer: "Visitor",
      system: "Branch",
      queue: "Line",
      server: "Teller",
      arrival: "Visitor",
    },
  },
  {
    id: "clinic",
    label: "Clinic",
    terms: {
      customer: "Patient",
      system: "Clinic",
      queue: "Waiting room",
      server: "Clinician",
      arrival: "Check-in",
    },
  },
  {
    id: "web-service",
    label: "Web service",
    terms: {
      customer: "Request",
      system: "Web service",
      queue: "Request queue",
      server: "Worker",
      arrival: "Request",
    },
  },
  {
    id: "restaurant",
    label: "Restaurant",
    terms: {
      customer: "Party",
      system: "Restaurant",
      queue: "Waitlist",
      server: "Table",
      arrival: "Party",
    },
  },
] as const satisfies readonly TerminologyPreset[];

export const QUEUE_MODEL_ORDER = [
  "mm1",
  "mms",
  "erlang-a",
  "ggs",
  "mg1",
  "md1",
  "mmsk",
  "mminf",
] as const satisfies readonly QueueModelKind[];

export const QUEUE_MODEL_LABELS = {
  mm1: "M/M/1",
  mms: "M/M/s",
  "erlang-a": "M/M/s+M",
  ggs: "G/G/s",
  mg1: "M/G/1",
  md1: "M/D/1",
  mmsk: "M/M/s/K",
  mminf: "M/M/∞",
} as const satisfies Record<QueueModelKind, string>;

export const QUEUE_MODEL_HELP = {
  mm1: {
    description:
      "Single random-service server with unlimited waiting and no abandonment.",
    choose: ["One bottleneck server and a simple baseline are enough."],
    avoid: [
      "Parallel servers, finite space, abandonment, or fixed service times matter.",
    ],
    watch: [
      { key: "rho", note: "Stability margin; waits climb fast near 1." },
      { key: "Wq", note: "Delay before service starts." },
    ],
    notes: [
      "Small load changes near full utilization can swing waits sharply.",
    ],
  },
  mms: {
    description:
      "One shared line feeding several identical random-service servers.",
    choose: [
      "Equivalent agents, lanes, desks, or machines draw from the same queue.",
    ],
    avoid: [
      "Abandonment, blocking, or non-exponential service drives the result.",
    ],
    watch: [
      { key: "rho", note: "Total workload relative to pooled capacity." },
      { key: "Pwait", note: "Chance an arrival waits before service." },
      { key: "Wq", note: "Average delay before service starts." },
    ],
    notes: [
      "Pooling demand into one shared line usually beats separate independent lines.",
    ],
  },
  "erlang-a": {
    description: "Multi-server queue where waiting customers can abandon.",
    choose: [
      "Callers hang up, users cancel, patients leave, or requests time out.",
    ],
    avoid: [
      "Use M/M/s/K for blocking before entry; use M/M/s when patience is irrelevant.",
    ],
    watch: [
      { key: "theta", note: "Patience rate; higher means faster abandonment." },
      { key: "Pabandon", note: "Share of arrivals lost before service." },
      { key: "throughput", note: "Rate that actually reaches service." },
    ],
    notes: [
      "Stability can come from lost demand, so a finite queue is not automatically a healthy one.",
      "W and Wq average all arrivals, including customers who abandon; when Pabandon > 0, W is not Wq + 1/mu.",
    ],
  },
  ggs: {
    description:
      "Multi-server approximation for bursty arrivals or variable service.",
    choose: [
      "You know arrival and service variability and mainly need mean waits.",
    ],
    avoid: ["Exact probabilities, blocking, or abandonment drive the answer."],
    watch: [
      { key: "ca2", note: "Arrival burstiness; above 1 means clumped demand." },
      {
        key: "cs2",
        note: "Service spread; above 1 makes waits more volatile.",
      },
      { key: "Wq", note: "Approximate wait most affected by variability." },
    ],
    notes: [
      "When both variability values are 1, this reduces to the M/M/s baseline.",
    ],
  },
  mg1: {
    description:
      "One random-arrival server with configurable service-time variability.",
    choose: ["One server handles work whose service times vary measurably."],
    avoid: [
      "Use M/M/1 or M/D/1 for exponential or fixed service; use another model for parallel servers.",
    ],
    watch: [
      {
        key: "serviceScv",
        note: "How variable service times are around the mean.",
      },
      { key: "rho", note: "Must stay below 1 for stability." },
      { key: "Wq", note: "Rises with both load and service variability." },
    ],
    notes: [
      "Higher service variability raises waits even when the mean is unchanged.",
    ],
  },
  md1: {
    description: "One random-arrival server with fixed service times.",
    choose: [
      "Each job takes nearly the same service time, such as a paced or automated step.",
    ],
    avoid: [
      "Service times vary materially, or multiple servers or limits matter.",
    ],
    watch: [
      { key: "rho", note: "Must stay below 1 for stability." },
      { key: "Wq", note: "Lower than M/M/1 at the same average load." },
    ],
    notes: ["Fixed service cuts wait versus M/M/1 at the same load."],
  },
  mmsk: {
    description:
      "Multi-server queue with hard total capacity in service plus waiting.",
    choose: ["Space, buffers, racks, parking, or admission slots can fill up."],
    avoid: [
      "Use Erlang A when customers join then abandon; use M/M/s when arrivals can always wait.",
    ],
    watch: [
      { key: "K", note: "Total capacity, including service and waiting." },
      { key: "Pblock", note: "Chance an attempted arrival is turned away." },
      { key: "lambdaEffective", note: "Accepted arrival rate after blocking." },
    ],
    notes: ["Blocked arrivals can make a strained system look stable."],
  },
  mminf: {
    description: "Unlimited parallel service, so arrivals start immediately.",
    choose: ["Capacity is automatic or so large that waiting is negligible."],
    avoid: ["Finite staffing, utilization, or queueing delay is the question."],
    watch: [
      { key: "a", note: "Offered service load; equals L in this model." },
      { key: "L", note: "Average number simultaneously in service." },
      { key: "P0", note: "Chance no work is present." },
    ],
    notes: ["Lq, Wq, and Pwait are zero; s is ∞ and utilization is undefined."],
  },
} as const satisfies Record<QueueModelKind, QueueModelHelpDefinition>;

export function isFixedSingleServerMode(mode: QueueModelKind): boolean {
  return FIXED_SINGLE_SERVER_MODES.includes(mode);
}

export function isQueueModelKind(
  value: string | null,
): value is QueueModelKind {
  return (
    value === "mm1" ||
    value === "mms" ||
    value === "mmsk" ||
    value === "mminf" ||
    value === "mg1" ||
    value === "md1" ||
    value === "ggs" ||
    value === "erlang-a"
  );
}

export function isSpeedOption(value: number): boolean {
  return SPEED_OPTIONS.some((option) => option === value);
}

export function nextSimulationSpeed(value: number): number {
  const currentIndex = (SPEED_OPTIONS as readonly number[]).indexOf(value);
  return SPEED_OPTIONS[(currentIndex + 1) % SPEED_OPTIONS.length];
}

export function terminologyPresetById(
  id: string,
): TerminologyPreset | undefined {
  return TERMINOLOGY_PRESETS.find((preset) => preset.id === id);
}

export function matchingTerminologyPresetId(terms: Terminology): string {
  return (
    TERMINOLOGY_PRESETS.find((preset) =>
      TERM_KEYS.every((key) => terms[key] === preset.terms[key]),
    )?.id ?? ""
  );
}
