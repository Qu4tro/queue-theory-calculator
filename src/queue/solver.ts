import { classifyUnsolvedInput } from "./solver/classify";
import { findErlangACandidate } from "./solver/erlang-a";
import { finalizeCandidate, suppliedValueMatches } from "./solver/finalize";
import {
  dimensionlessResultForFiniteMissingScale,
  dimensionlessResultForUnsolvedFiniteTerminal,
  findFiniteCandidate,
} from "./solver/finite";
import { findGeneralServiceCandidate } from "./solver/general-service";
import { findGgSCandidate } from "./solver/ggs";
import { findMmInfinityCandidate } from "./solver/mminf";
import {
  findMmsCandidate,
  validateDimensionlessRedundantInputs,
} from "./solver/mms";
import { type NormalizedInput, normalizeInput } from "./solver/normalize";
import type { CandidateResult } from "./solver/shared";
import { terminal } from "./solver/shared";
import type { QueueInputMap, SolverOptions, SolverResult } from "./types";

export {
  SOLVER_ABS_TOLERANCE,
  SOLVER_REL_TOLERANCE,
} from "./solver/root";
export { suppliedValueMatches };

export function solveQueue(
  input: QueueInputMap,
  options: SolverOptions = {},
): SolverResult {
  const normalized = normalizeInput(
    input,
    options.modelKind ?? "mms",
    options.lossPreset ?? false,
  );

  if (normalized.status !== "ok") {
    return normalized.result;
  }

  const candidate = findCandidate(normalized.input);

  if (candidate.kind === "terminal") {
    return (
      dimensionlessResultForUnsolvedFiniteTerminal(
        normalized.input,
        candidate.result,
      ) ?? candidate.result
    );
  }

  if (candidate.kind === "candidate") {
    return finalizeCandidate(candidate.params, normalized.input);
  }

  const dimensionlessResult = validateDimensionlessRedundantInputs(
    normalized.input,
  );

  if (dimensionlessResult !== undefined) {
    return dimensionlessResult;
  }

  return classifyUnsolvedInput(normalized.input);
}

export const solveQueueInputs = solveQueue;

function findCandidate(input: NormalizedInput): CandidateResult {
  if (input.modelKind === "mminf") {
    return findMmInfinityCandidate(input);
  }

  if (input.modelKind === "mmsk") {
    const dimensionlessResult = dimensionlessResultForFiniteMissingScale(input);

    if (dimensionlessResult !== undefined) {
      return terminal(dimensionlessResult);
    }

    return findFiniteCandidate(input);
  }

  if (input.modelKind === "mg1" || input.modelKind === "md1") {
    return findGeneralServiceCandidate(input);
  }

  if (input.modelKind === "ggs") {
    return findGgSCandidate(input);
  }

  if (input.modelKind === "erlang-a") {
    return findErlangACandidate(input);
  }

  return findMmsCandidate(input);
}
