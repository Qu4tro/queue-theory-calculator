import { solveQueue } from "../queue/solver";
import type { SolverWorkerRequest, SolverWorkerResponse } from "./async-solver";

type SolverWorkerScope = {
  onmessage: ((event: MessageEvent<SolverWorkerRequest>) => void) | null;
  postMessage: (message: SolverWorkerResponse) => void;
};

const solverWorker = self as unknown as SolverWorkerScope;

solverWorker.onmessage = (event: MessageEvent<SolverWorkerRequest>): void => {
  const { requestId, input, options } = event.data;

  try {
    const result = solveQueue(input, options);
    solverWorker.postMessage({
      requestId,
      status: "ok",
      result,
    } satisfies SolverWorkerResponse);
  } catch (error) {
    solverWorker.postMessage({
      requestId,
      status: "error",
      message: error instanceof Error ? error.message : "Solver worker failed.",
    } satisfies SolverWorkerResponse);
  }
};
