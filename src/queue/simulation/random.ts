import { isNonNegativeFinite, isPositiveFinite } from "../validation";
import {
  GAMMA_C_DENOMINATOR_FACTOR,
  GAMMA_D_OFFSET,
  GAMMA_LOG_ACCEPTANCE_NORMAL_WEIGHT,
  GAMMA_SQUEEZE_COEFFICIENT,
  GAMMA_SQUEEZE_POWER,
  SEEDED_PRNG_STATE_INCREMENT,
  UINT32_OUTPUT_RANGE,
} from "./constants";
import type { ServiceTimeModel } from "./types";

const spareStandardNormals = new WeakMap<() => number, number>();

export function sampleExponential(
  rate: number,
  random: () => number = Math.random,
): number {
  if (!isPositiveFinite(rate)) {
    throw new RangeError(
      "Exponential rate must be a finite number greater than 0.",
    );
  }

  const raw = random();
  const u = Math.min(
    1 - Number.EPSILON,
    Math.max(Number.EPSILON, Number.isFinite(raw) ? raw : Number.EPSILON),
  );

  return -Math.log(1 - u) / rate;
}

export function sampleServiceDuration(
  mu: number,
  serviceTime: ServiceTimeModel,
  random: () => number = Math.random,
): number {
  if (!isPositiveFinite(mu)) {
    throw new RangeError(
      "Service rate must be a finite number greater than 0.",
    );
  }

  switch (serviceTime.kind) {
    case "exponential":
      return sampleExponential(mu, random);
    case "deterministic":
      return 1 / mu;
    case "gamma":
      if (!isPositiveFinite(serviceTime.serviceScv)) {
        throw new RangeError(
          "Gamma service SCV must be a finite number greater than 0.",
        );
      }

      return sampleGamma(
        1 / serviceTime.serviceScv,
        serviceTime.serviceScv / mu,
        random,
      );
  }
}

export function sampleDurationWithScv(
  rate: number,
  scv: number,
  random: () => number = Math.random,
): number {
  if (!isPositiveFinite(rate)) {
    throw new RangeError("Rate must be a finite number greater than 0.");
  }

  if (!isNonNegativeFinite(scv)) {
    throw new RangeError("SCV must be a finite number of at least 0.");
  }

  if (scv === 0) {
    return 1 / rate;
  }

  if (scv === 1) {
    return sampleExponential(rate, random);
  }

  return sampleGamma(1 / scv, scv / rate, random);
}

function sampleGamma(
  shape: number,
  scale: number,
  random: () => number,
): number {
  if (!isPositiveFinite(shape) || !isPositiveFinite(scale)) {
    throw new RangeError(
      "Gamma shape and scale must be finite numbers greater than 0.",
    );
  }

  if (shape < 1) {
    const boosted = sampleGamma(shape + 1, scale, random);
    return boosted * clampedUnitRandom(random) ** (1 / shape);
  }

  const d = shape - GAMMA_D_OFFSET;
  const c = 1 / Math.sqrt(GAMMA_C_DENOMINATOR_FACTOR * d);

  while (true) {
    const normal = sampleStandardNormal(random);
    const vBase = 1 + c * normal;

    if (vBase <= 0) {
      continue;
    }

    const v = vBase * vBase * vBase;
    const u = clampedUnitRandom(random);

    if (
      u < 1 - GAMMA_SQUEEZE_COEFFICIENT * normal ** GAMMA_SQUEEZE_POWER ||
      Math.log(u) <
        GAMMA_LOG_ACCEPTANCE_NORMAL_WEIGHT * normal * normal +
          d * (1 - v + Math.log(v))
    ) {
      return d * v * scale;
    }
  }
}

function sampleStandardNormal(random: () => number): number {
  const spare = spareStandardNormals.get(random);

  if (spare !== undefined) {
    spareStandardNormals.delete(random);
    return spare;
  }

  const u1 = clampedUnitRandom(random);
  const u2 = clampedUnitRandom(random);
  const radius = Math.sqrt(-2 * Math.log(u1));
  const angle = 2 * Math.PI * u2;

  spareStandardNormals.set(random, radius * Math.sin(angle));

  return radius * Math.cos(angle);
}

function clampedUnitRandom(random: () => number): number {
  const raw = random();

  return Math.min(
    1 - Number.EPSILON,
    Math.max(Number.EPSILON, Number.isFinite(raw) ? raw : Number.EPSILON),
  );
}

export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state += SEEDED_PRNG_STATE_INCREMENT;

    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / UINT32_OUTPUT_RANGE;
  };
}

export function createUnseededRandom(
  random: () => number = Math.random,
): () => number {
  return () => random();
}
