export const DEFAULT_MAX_EVENTS_PER_ADVANCE = 5_000;
export const DEFAULT_MAX_SNAPSHOT_QUEUE_ITEMS = 30;
export const DEFAULT_MAX_SNAPSHOT_SERVERS = 180;
export const MAX_EVENTS_PER_ADVANCE = 20_000;
export const MAX_SNAPSHOT_QUEUE_ITEMS = 500;
export const MAX_SNAPSHOT_SERVERS = 1_000;
export const MAX_SIMULATION_SERVERS = 10_000;

// Marsaglia-Tsang (2000) gamma sampler constants. The alpha < 1 branch
// below uses the exact alpha + 1 identity; the named values here are paper
// constants for the alpha >= 1 rejection sampler.
export const GAMMA_D_OFFSET = 1 / 3;
export const GAMMA_C_DENOMINATOR_FACTOR = 9;
export const GAMMA_SQUEEZE_COEFFICIENT = 0.0331;
export const GAMMA_SQUEEZE_POWER = 4;
export const GAMMA_LOG_ACCEPTANCE_NORMAL_WEIGHT = 0.5;

// Mulberry32 advances by this Weyl-sequence increment before mixing; an odd
// increment cycles through the full uint32 state space.
export const SEEDED_PRNG_STATE_INCREMENT = 0x6d2b79f5;
export const UINT32_OUTPUT_RANGE = 4_294_967_296;

// Defer queue compaction while skipped slots are small and the backing array
// is small or at least half live; this avoids churn while bounding sparse data.
export const QUEUE_COMPACTION_MAX_SKIPPED_HEAD = 1_024;
export const QUEUE_COMPACTION_SMALL_BACKING_LENGTH = 2_048;
export const QUEUE_COMPACTION_MIN_LIVE_RATIO = 0.5;
