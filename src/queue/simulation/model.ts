import type { QueueModelKind } from "../types";
import type {
  FiniteSimulationParams,
  MmInfinitySimulationParams,
  SimulationParams,
  ValidatedFiniteSimulationParams,
  ValidatedMmInfinitySimulationParams,
  ValidatedSimulationParams,
} from "./types";

export function isMmInfinitySimulationParams(
  params: SimulationParams,
): params is MmInfinitySimulationParams {
  return params.modelKind === "mminf";
}

export function isMmInfinityValidatedParams(
  params: ValidatedSimulationParams,
): params is ValidatedMmInfinitySimulationParams {
  return params.modelKind === "mminf";
}

export function isErlangAValidatedParams(
  params: ValidatedSimulationParams,
): params is ValidatedFiniteSimulationParams & {
  modelKind: "erlang-a";
  theta: number;
} {
  return params.modelKind === "erlang-a";
}

export function inferFiniteModelKind(
  params: FiniteSimulationParams,
): Exclude<QueueModelKind, "mminf"> {
  if (params.modelKind) {
    return params.modelKind;
  }

  if (params.K !== undefined) {
    return "mmsk";
  }

  return params.s === 1 ? "mm1" : "mms";
}
