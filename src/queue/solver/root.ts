export const SOLVER_ABS_TOLERANCE = 1e-7;
export const SOLVER_REL_TOLERANCE = 1e-6;

const ROOT_ABS_X_TOLERANCE = 1e-14;
const ROOT_REL_X_TOLERANCE = 1e-14;
const ROOT_RESIDUAL_TOLERANCE = 1e-8;
const ROOT_RESIDUAL_ABS_FLOOR = 1e-14;
const MAX_ROOT_ITERATIONS = 100;
const MAX_BOUNDARY_ADJUSTMENTS = 80;
const LOWER_BOUNDARY_GROWTH_FACTOR = 10;
const UPPER_BOUNDARY_DISTANCE_GROWTH_FACTOR = 2;
const RHO_UPPER_BOUND = 1 - 1e-15;

export type RootResult =
  | { ok: true; value: number; residual: number; iterations: number }
  | {
      ok: false;
      reason: "no-bracket" | "max-iterations" | "invalid-target";
    };

export function solveRhoForMetric(
  evaluate: (rho: number) => number | undefined,
  target: number,
): RootResult {
  if (!Number.isFinite(target)) {
    return { ok: false, reason: "invalid-target" };
  }

  const lo = findLowerBoundary(evaluate);
  const hi = findUpperBoundary(evaluate);

  if (lo === undefined || hi === undefined || lo >= hi) {
    return { ok: false, reason: "no-bracket" };
  }

  const loValue = evaluate(lo);
  const hiValue = evaluate(hi);

  if (loValue === undefined || hiValue === undefined) {
    return { ok: false, reason: "no-bracket" };
  }

  let loResidual = loValue - target;
  let hiResidual = hiValue - target;

  if (isResidualClose(loResidual, target)) {
    return { ok: true, value: lo, residual: loResidual, iterations: 0 };
  }

  if (isResidualClose(hiResidual, target)) {
    return { ok: true, value: hi, residual: hiResidual, iterations: 0 };
  }

  if (sameSign(loResidual, hiResidual)) {
    return { ok: false, reason: "no-bracket" };
  }

  let low = lo;
  let high = hi;
  let bestValue = lo;
  let bestResidual = loResidual;

  for (let iteration = 1; iteration <= MAX_ROOT_ITERATIONS; iteration += 1) {
    const mid = (low + high) / 2;
    const midValue = evaluate(mid);

    if (midValue === undefined) {
      return { ok: false, reason: "no-bracket" };
    }

    const midResidual = midValue - target;

    if (Math.abs(midResidual) < Math.abs(bestResidual)) {
      bestValue = mid;
      bestResidual = midResidual;
    }

    if (isResidualClose(midResidual, target)) {
      return {
        ok: true,
        value: mid,
        residual: midResidual,
        iterations: iteration,
      };
    }

    if (
      high - low <=
      ROOT_ABS_X_TOLERANCE + ROOT_REL_X_TOLERANCE * Math.max(1, Math.abs(mid))
    ) {
      break;
    }

    if (sameSign(loResidual, midResidual)) {
      low = mid;
      loResidual = midResidual;
    } else {
      high = mid;
      hiResidual = midResidual;
    }
  }

  if (isResidualClose(bestResidual, target)) {
    return {
      ok: true,
      value: bestValue,
      residual: bestResidual,
      iterations: MAX_ROOT_ITERATIONS,
    };
  }

  return { ok: false, reason: "max-iterations" };
}

function findLowerBoundary(
  evaluate: (rho: number) => number | undefined,
): number | undefined {
  let value = Number.MIN_VALUE;

  for (let index = 0; index < MAX_BOUNDARY_ADJUSTMENTS; index += 1) {
    if (value > 0 && value < 1 && evaluate(value) !== undefined) {
      return value;
    }

    value *= LOWER_BOUNDARY_GROWTH_FACTOR;
  }

  return undefined;
}

function findUpperBoundary(
  evaluate: (rho: number) => number | undefined,
): number | undefined {
  let distanceFromOne = 1 - RHO_UPPER_BOUND;

  for (let index = 0; index < MAX_BOUNDARY_ADJUSTMENTS; index += 1) {
    const value = 1 - distanceFromOne;

    if (value > 0 && value < 1 && evaluate(value) !== undefined) {
      return value;
    }

    distanceFromOne *= UPPER_BOUNDARY_DISTANCE_GROWTH_FACTOR;
  }

  return undefined;
}

export function nearlyEqual(actual: number, expected: number): boolean {
  const difference = Math.abs(actual - expected);
  const scale = Math.max(1, Math.abs(actual), Math.abs(expected));

  return (
    difference <= SOLVER_ABS_TOLERANCE ||
    difference <= SOLVER_REL_TOLERANCE * scale
  );
}

function isResidualClose(residual: number, target: number): boolean {
  return (
    Math.abs(residual) <=
    Math.max(
      ROOT_RESIDUAL_ABS_FLOOR,
      ROOT_RESIDUAL_TOLERANCE * Math.abs(target),
    )
  );
}

function sameSign(a: number, b: number): boolean {
  return (a < 0 && b < 0) || (a > 0 && b > 0);
}
