import { solveQueue } from "../queue/solver";
import type {
  QueueInputMap,
  SolverOptions,
  SolverResult,
} from "../queue/types";

export type SolverWorkerRequest = {
  requestId: number;
  input: QueueInputMap;
  options: SolverOptions;
};

export type SolverWorkerResponse =
  | {
      requestId: number;
      status: "ok";
      result: SolverResult;
    }
  | {
      requestId: number;
      status: "error";
      message: string;
    };

export type SolverResultHandler = (
  result: SolverResult,
  requestId: number,
) => void;

export type SolverWorkerLike = {
  onerror: ((event: ErrorEvent) => void) | null;
  onmessage: ((event: MessageEvent<SolverWorkerResponse>) => void) | null;
  postMessage: (message: SolverWorkerRequest) => void;
  terminate: () => void;
};

export type SolverWorkerFactory = () => SolverWorkerLike;

export class AsyncSolverClient {
  private activeRequestId = 0;
  private nextRequestId = 1;
  private onResult: SolverResultHandler | null = null;
  private worker: SolverWorkerLike | null | undefined;

  constructor(
    private readonly workerFactory: SolverWorkerFactory = createSolverWorker,
  ) {}

  solve(
    input: QueueInputMap,
    options: SolverOptions,
    onResult: SolverResultHandler,
  ): number {
    const requestId = this.nextRequestId;
    this.nextRequestId += 1;
    this.activeRequestId = requestId;
    this.onResult = onResult;

    const worker = this.getWorker();

    if (worker === null) {
      this.solveSynchronously(requestId, input, options, onResult);
      return requestId;
    }

    worker.postMessage({
      requestId,
      input,
      options,
    } satisfies SolverWorkerRequest);
    return requestId;
  }

  dispose(): void {
    this.activeRequestId = this.nextRequestId;
    this.nextRequestId += 1;
    this.onResult = null;
    this.worker?.terminate();
    this.worker = null;
  }

  private getWorker(): SolverWorkerLike | null {
    if (this.worker !== undefined) {
      return this.worker;
    }

    try {
      this.worker = this.workerFactory();
      this.worker.onmessage = this.handleWorkerMessage;
      this.worker.onerror = this.handleWorkerError;
      return this.worker;
    } catch {
      this.worker = null;
      return null;
    }
  }

  private readonly handleWorkerMessage = (
    event: MessageEvent<SolverWorkerResponse>,
  ): void => {
    const response = event.data;

    if (response.requestId !== this.activeRequestId) {
      return;
    }

    const result =
      response.status === "ok"
        ? response.result
        : solverFailureResult(response.message);

    this.onResult?.(result, response.requestId);
  };

  private readonly handleWorkerError = (event: ErrorEvent): void => {
    const requestId = this.activeRequestId;

    this.onResult?.(
      solverFailureResult(event.message || "Solver worker failed."),
      requestId,
    );
  };

  private solveSynchronously(
    requestId: number,
    input: QueueInputMap,
    options: SolverOptions,
    onResult: SolverResultHandler,
  ): void {
    const result = solveQueue(input, options);

    if (requestId === this.activeRequestId) {
      onResult(result, requestId);
    }
  }
}

function createSolverWorker(): SolverWorkerLike {
  return new Worker(new URL("./solver-worker.ts", import.meta.url), {
    type: "module",
  });
}

function solverFailureResult(message: string): SolverResult {
  return {
    status: "unsupported",
    issues: [
      {
        code: "solver-worker-failed",
        message,
      },
    ],
  };
}
