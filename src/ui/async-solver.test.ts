import { describe, expect, it } from "vitest";

import type { SolverResult } from "../queue/types";
import {
  AsyncSolverClient,
  type SolverWorkerLike,
  type SolverWorkerRequest,
  type SolverWorkerResponse,
} from "./async-solver";

class MockSolverWorker implements SolverWorkerLike {
  readonly messages: SolverWorkerRequest[] = [];
  terminated = false;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessage: ((event: MessageEvent<SolverWorkerResponse>) => void) | null =
    null;

  postMessage(message: SolverWorkerRequest): void {
    this.messages.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  respond(response: SolverWorkerResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<SolverWorkerResponse>);
  }
}

const needMoreInputsResult: SolverResult = {
  status: "need-more-inputs",
  issues: [{ code: "missing", message: "Need more inputs." }],
};

const unsupportedResult: SolverResult = {
  status: "unsupported",
  issues: [{ code: "unsupported", message: "Unsupported." }],
};

describe("AsyncSolverClient", () => {
  it("ignores stale worker responses", () => {
    const worker = new MockSolverWorker();
    const client = new AsyncSolverClient(() => worker);
    const results: SolverResult[] = [];

    const firstRequestId = client.solve(
      { lambda: 1 },
      { modelKind: "mm1" },
      (result) => results.push(result),
    );
    const secondRequestId = client.solve(
      { lambda: 1, mu: 2 },
      { modelKind: "mm1" },
      (result) => results.push(result),
    );

    expect(worker.messages.map((message) => message.requestId)).toEqual([
      firstRequestId,
      secondRequestId,
    ]);

    worker.respond({
      requestId: firstRequestId,
      status: "ok",
      result: needMoreInputsResult,
    });

    expect(results).toEqual([]);

    worker.respond({
      requestId: secondRequestId,
      status: "ok",
      result: unsupportedResult,
    });

    expect(results).toEqual([unsupportedResult]);
  });

  it("falls back to synchronous solving when worker construction fails", () => {
    const client = new AsyncSolverClient(() => {
      throw new Error("Worker unavailable.");
    });
    let result: SolverResult | undefined;

    client.solve(
      { lambda: 2, mu: 3, s: 1 },
      { modelKind: "mm1" },
      (nextResult) => {
        result = nextResult;
      },
    );

    expect(result?.status).toBe("solved");
  });
});
