import type { QueueVariableId } from "../types";

export const ERLANG_A_RATE_INVERSE_TARGETS = [
  "L",
  "Lq",
  "W",
  "Wq",
  "P0",
  "Pwait",
  "Pabandon",
  "rho",
  "Pbusy",
  "throughput",
] as const satisfies readonly QueueVariableId[];

export type ErlangARateInverseTarget =
  (typeof ERLANG_A_RATE_INVERSE_TARGETS)[number];

export const ERLANG_A_RATE_INVERSE_TARGET_SUPPORT_MESSAGE = `Erlang A lambda/mu inversion supports ${formatTargetList(ERLANG_A_RATE_INVERSE_TARGETS)}.`;

function formatTargetList(targets: readonly QueueVariableId[]): string {
  if (targets.length <= 1) {
    return targets.join("");
  }

  return `${targets.slice(0, -1).join(", ")}, or ${targets[targets.length - 1]}`;
}
