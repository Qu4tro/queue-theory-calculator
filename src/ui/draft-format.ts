import { RANDOM_DRAFT_DECIMAL_PLACES } from "./model-config";

export function formatDraftNumber(value: number): string {
  if (!Number.isFinite(value) || Object.is(value, -0)) {
    return "0";
  }

  return Number(value.toPrecision(12)).toString();
}

export function formatSimulationSpeed(value: number): string {
  return `${formatDraftNumber(value)}x`;
}

export function formatRandomDraftNumber(value: number): string {
  if (!Number.isFinite(value) || Object.is(value, -0)) {
    return "0";
  }

  return Number(value.toFixed(RANDOM_DRAFT_DECIMAL_PLACES)).toString();
}

export function normalizeNegativeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}
