export const PROBABILITY_CLAMP_EPSILON = 1e-14;

const LOG_MIN_VALUE = Math.log(Number.MIN_VALUE);
const LOG_MAX_VALUE = Math.log(Number.MAX_VALUE);

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function logAddExp(a: number, b: number): number {
  if (a === -Infinity) {
    return b;
  }

  if (b === -Infinity) {
    return a;
  }

  const max = Math.max(a, b);
  const min = Math.min(a, b);

  return max + Math.log1p(Math.exp(min - max));
}

export function expFromLog(value: number): number {
  if (value < LOG_MIN_VALUE) {
    return 0;
  }

  if (value > LOG_MAX_VALUE) {
    return Infinity;
  }

  return Math.exp(value);
}

export function clampProbability(
  value: number,
  epsilon = PROBABILITY_CLAMP_EPSILON,
): number {
  if (value < 0 && value >= -epsilon) {
    return 0;
  }

  if (value > 1 && value <= 1 + epsilon) {
    return 1;
  }

  return value;
}
