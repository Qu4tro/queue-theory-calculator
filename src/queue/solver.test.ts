import { describe, expect, it } from "vitest";

import { calculateGgS } from "./gg-s";
import { calculateMg1 } from "./mg-1";
import { calculateMmInfinity } from "./mm-infinity";
import { calculateMmS } from "./mm-s";
import { calculateMmSK } from "./mm-s-k";
import { solveQueue, suppliedValueMatches } from "./solver";
import type { QueueInputMap, SolverResult } from "./types";

type SolvedResult = Extract<SolverResult, { status: "solved" }>;

function expectSolved(result: SolverResult): SolvedResult {
  expect(result.status).toBe("solved");

  if (result.status !== "solved") {
    throw new Error(`Expected solved result, got ${result.status}.`);
  }

  return result;
}

function expectParamClose(
  result: SolvedResult,
  key: string,
  expected: number,
  precision = 5,
): void {
  const value = (result.params as unknown as Record<string, unknown>)[key];

  expect(value).toEqual(expect.any(Number));
  expect(value as number).toBeCloseTo(expected, precision);
}

describe("solveQueue", () => {
  it("infers M/M/1 service rate from arrival rate and time in system", () => {
    const result = solveQueue({ lambda: 2, W: 1 }, { modelKind: "mm1" });

    expect(result.status).toBe("solved");
    if (result.status !== "solved") {
      return;
    }

    expect(result.params).toMatchObject({ lambda: 2, mu: 3, s: 1 });
    expect(result.metrics.W).toBeCloseTo(1);
    expect(result.metrics.L).toBeCloseTo(2);
  });

  it("reports inconsistent redundant metrics", () => {
    const result = solveQueue({ lambda: 2, mu: 3, s: 1, W: 0.5 });

    expect(result.status).toBe("inconsistent");
    if (result.status !== "inconsistent") {
      return;
    }

    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ variable: "W" })]),
    );
  });

  it("continues Erlang A inverse scans when consistency metrics select a wider-radius root", () => {
    // Below the first +/-8 log scan, but inside the next configured radius.
    const lambda = Math.exp(Math.log(20 * 100) - 16);
    const result = solveQueue(
      {
        mu: 100,
        s: 20,
        theta: 2,
        W: 0.01,
        throughput: lambda,
      },
      { modelKind: "erlang-a" },
    );

    expect(result.status).toBe("solved");
    if (result.status !== "solved") {
      return;
    }

    expect(result.params).toMatchObject({
      modelKind: "erlang-a",
      mu: 100,
      s: 20,
      theta: 2,
    });
    expect(result.params.lambda).toBeCloseTo(lambda);
    expect(result.metrics.W).toBeCloseTo(0.01);
    expect(result.metrics.throughput).toBeCloseTo(lambda);
  });

  it("reports ambiguity when an Erlang A inverse target has multiple roots", () => {
    const result = solveQueue(
      {
        mu: 100,
        s: 20,
        theta: 2,
        W: 0.01,
      },
      { modelKind: "erlang-a" },
    );

    expect(result.status).toBe("need-more-inputs");
    if (result.status !== "need-more-inputs") {
      return;
    }

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          variable: "lambda",
          code: "ambiguous-erlang-a-inverse",
        }),
      ]),
    );
  });

  it.each([
    ["s", 2],
    ["K", 8],
  ] as const)("requires exact supplied-value matches for %s", (id, value) => {
    expect(suppliedValueMatches(id, value, value)).toBe(true);
    expect(suppliedValueMatches(id, value, value + 1e-8)).toBe(false);
  });

  it("keeps tolerance for continuous supplied-value matches", () => {
    expect(suppliedValueMatches("mu", 3, 3 + 1e-8)).toBe(true);
  });

  it("reports contradictory dimensionless M/M/s/K inputs before finite capacity search exhaustion", () => {
    const result = solveQueue(
      { s: 2, rho: 0.5, P0: 0.9 },
      { modelKind: "mmsk" },
    );

    expect(result.status).toBe("inconsistent");
    if (result.status !== "inconsistent") {
      return;
    }

    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ variable: "P0" })]),
    );
  });

  it("keeps matching dimensionless M/M/s/K inputs on the missing scale path", () => {
    const result = solveQueue({ s: 2, rho: 0.5 }, { modelKind: "mmsk" });

    expect(result.status).toBe("need-more-inputs");
    if (result.status !== "need-more-inputs") {
      return;
    }

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing-scale" }),
      ]),
    );
  });

  it("does not reject valid finite-capacity shape data with infinite-capacity validation", () => {
    const result = solveQueue(
      { s: 2, rho: 0.4, P0: 0.4 },
      { modelKind: "mmsk" },
    );

    expect(result.status).toBe("need-more-inputs");
    if (result.status !== "need-more-inputs") {
      return;
    }

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing-scale" }),
      ]),
    );
  });

  it("infers finite offered load from accepted-arrival wait probability", () => {
    const result = solveQueue(
      { mu: 1, s: 1, K: 2, Pwait: 2 / 3 },
      { modelKind: "mmsk" },
    );

    expect(result.status).toBe("solved");
    if (result.status !== "solved") {
      return;
    }

    expect(result.params).toMatchObject({ mu: 1, s: 1, K: 2 });
    expect(result.params.lambda).toBeCloseTo(2);
    expect(result.metrics.Pblock).toBeCloseTo(4 / 7);
    expect(result.metrics.Pwait).toBeCloseTo(2 / 3);
  });

  it.each([
    "L",
    "Lq",
    "W",
    "Wq",
    "P0",
    "Pwait",
  ] as const)("infers M/M/s service rate from arrival rate and %s", (target) => {
    const base = calculateMmS({ lambda: 4, mu: 3, s: 2 });

    expect(base.status).toBe("ok");
    if (base.status !== "ok") {
      return;
    }

    const input: QueueInputMap = {
      lambda: 4,
      s: 2,
      [target]: base.metrics[target],
    };
    const result = expectSolved(solveQueue(input, { modelKind: "mms" }));

    expectParamClose(result, "mu", 3);
    expect(result.metrics[target]).toBeCloseTo(base.metrics[target]);
  });

  it.each([
    "L",
    "Lq",
    "W",
    "Wq",
    "P0",
    "Pwait",
  ] as const)("infers M/M/s arrival rate from service rate and %s", (target) => {
    const base = calculateMmS({ lambda: 4, mu: 3, s: 2 });

    expect(base.status).toBe("ok");
    if (base.status !== "ok") {
      return;
    }

    const input: QueueInputMap = {
      mu: 3,
      s: 2,
      [target]: base.metrics[target],
    };
    const result = expectSolved(solveQueue(input, { modelKind: "mms" }));

    expectParamClose(result, "lambda", 4);
    expect(result.metrics[target]).toBeCloseTo(base.metrics[target]);
  });

  it("infers M/M/s rates from shape and time-scale metrics", () => {
    const result = expectSolved(
      solveQueue({ s: 2, Pwait: 8 / 15, Wq: 4 / 15 }, { modelKind: "mms" }),
    );

    expectParamClose(result, "lambda", 4);
    expectParamClose(result, "mu", 3);
    expectParamClose(result, "s", 2, 0);
  });

  it.each([
    "L",
    "Lq",
    "rho",
    "P0",
    "Pblock",
  ] as const)("infers finite-capacity service rate from arrival rate and %s", (target) => {
    const base = calculateMmSK({ lambda: 3, mu: 2, s: 2, K: 4 });

    expect(base.status).toBe("ok");
    if (base.status !== "ok") {
      return;
    }

    const input: QueueInputMap = {
      lambda: 3,
      s: 2,
      K: 4,
      [target]: base.metrics[target],
    };
    const result = expectSolved(solveQueue(input, { modelKind: "mmsk" }));

    expectParamClose(result, "mu", 2);
    expect(result.metrics[target]).toBeCloseTo(base.metrics[target]);
  });

  it("infers finite-capacity rates from a blocking shape and time scale", () => {
    const base = calculateMmSK({ lambda: 3, mu: 2, s: 2, K: 4 });

    expect(base.status).toBe("ok");
    if (base.status !== "ok") {
      return;
    }

    const result = expectSolved(
      solveQueue(
        { s: 2, K: 4, Pblock: base.metrics.Pblock, W: base.metrics.W },
        { modelKind: "mmsk" },
      ),
    );

    expectParamClose(result, "lambda", 3);
    expectParamClose(result, "mu", 2);
    expectParamClose(result, "K", 4, 0);
  });

  it("solves M/M/infinity from no-wait shape metrics", () => {
    const base = calculateMmInfinity({
      modelKind: "mminf",
      lambda: 6,
      mu: 3,
    });

    expect(base.status).toBe("ok");
    if (base.status !== "ok") {
      return;
    }

    const fromLoad = expectSolved(
      solveQueue({ lambda: 6, L: base.metrics.L }, { modelKind: "mminf" }),
    );
    const fromEmptyProbability = expectSolved(
      solveQueue({ mu: 3, P0: base.metrics.P0 }, { modelKind: "mminf" }),
    );

    expectParamClose(fromLoad, "mu", 3);
    expectParamClose(fromEmptyProbability, "lambda", 6);
  });

  it.each([
    "L",
    "Lq",
    "W",
    "Wq",
  ] as const)("infers M/G/1 service rate from arrival rate and %s", (target) => {
    const base = calculateMg1({
      modelKind: "mg1",
      lambda: 2,
      mu: 5,
      s: 1,
      serviceScv: 2,
    });

    expect(base.status).toBe("ok");
    if (base.status !== "ok") {
      return;
    }

    const input: QueueInputMap = {
      lambda: 2,
      serviceScv: 2,
      [target]: base.metrics[target],
    };
    const result = expectSolved(solveQueue(input, { modelKind: "mg1" }));

    expectParamClose(result, "mu", 5);
    expect(result.metrics[target]).toBeCloseTo(base.metrics[target]);
  });

  it("infers M/G/1 service variability from known rates", () => {
    const result = expectSolved(
      solveQueue({ lambda: 2, mu: 5, Wq: 0.2 }, { modelKind: "mg1" }),
    );

    expectParamClose(result, "serviceScv", 2);
    expect(result.metrics.Wq).toBeCloseTo(0.2);
  });

  it("uses deterministic service variability for M/D/1 inverse solves", () => {
    const result = expectSolved(
      solveQueue({ lambda: 2, Wq: 1 / 15 }, { modelKind: "md1" }),
    );

    expectParamClose(result, "mu", 5);
    expectParamClose(result, "serviceScv", 0, 0);
    expect(result.metrics.Wq).toBeCloseTo(1 / 15);
  });

  it.each([
    "L",
    "Lq",
    "Wq",
  ] as const)("infers G/G/s service rate from arrival rate and %s", (target) => {
    const base = calculateGgS({
      modelKind: "ggs",
      lambda: 4,
      mu: 3,
      s: 2,
      ca2: 0.5,
      cs2: 0.5,
    });

    expect(base.status).toBe("ok");
    if (base.status !== "ok") {
      return;
    }

    const input: QueueInputMap = {
      lambda: 4,
      s: 2,
      ca2: 0.5,
      cs2: 0.5,
      [target]: base.metrics[target],
    };
    const result = expectSolved(solveQueue(input, { modelKind: "ggs" }));

    expectParamClose(result, "mu", 3);
    expect(result.metrics[target]).toBeCloseTo(base.metrics[target]);
  });

  it.each([
    "L",
    "Lq",
    "W",
    "Wq",
  ] as const)("infers G/G/s arrival rate from service rate and %s", (target) => {
    const base = calculateGgS({
      modelKind: "ggs",
      lambda: 4,
      mu: 3,
      s: 2,
      ca2: 0.5,
      cs2: 0.5,
    });

    expect(base.status).toBe("ok");
    if (base.status !== "ok") {
      return;
    }

    const input: QueueInputMap = {
      mu: 3,
      s: 2,
      ca2: 0.5,
      cs2: 0.5,
      [target]: base.metrics[target],
    };
    const result = expectSolved(solveQueue(input, { modelKind: "ggs" }));

    expectParamClose(result, "lambda", 4);
    expect(result.metrics[target]).toBeCloseTo(base.metrics[target]);
  });

  it("does not accept G/G/s probability constraints for approximate SCVs", () => {
    const result = solveQueue(
      { lambda: 4, mu: 3, s: 2, ca2: 0.5, cs2: 0.5, P0: 0.2 },
      { modelKind: "ggs" },
    );

    expect(result.status).toBe("unsupported");
    if (result.status !== "unsupported") {
      return;
    }

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "ggs-probability-unsupported" }),
      ]),
    );
  });

  it("rejects non-finite and negative normalized inputs", () => {
    const nonFinite = solveQueue({ lambda: Number.POSITIVE_INFINITY });
    const negative = solveQueue({ lambda: 2, mu: 3, s: 1, L: -1 });

    expect(nonFinite.status).toBe("invalid-input");
    expect(negative.status).toBe("invalid-input");

    if (nonFinite.status !== "invalid-input") {
      return;
    }

    expect(nonFinite.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ variable: "lambda", code: "finite-number" }),
      ]),
    );

    if (negative.status !== "invalid-input") {
      return;
    }

    expect(negative.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ variable: "L", code: "non-negative" }),
      ]),
    );
  });

  it("reports alias mismatches before solving", () => {
    const result = solveQueue({
      lambda: 2,
      mu: 3,
      s: 1,
      rho: 2 / 3,
      Pbusy: 0.5,
    });

    expect(result.status).toBe("inconsistent");
    if (result.status !== "inconsistent") {
      return;
    }

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ variable: "Pbusy", code: "alias-mismatch" }),
      ]),
    );
  });

  it("accepts redundant metrics within solver tolerance", () => {
    const result = expectSolved(
      solveQueue({ lambda: 2, mu: 3, s: 1, W: 1 + 5e-8 }),
    );

    expect(result.metrics.W).toBeCloseTo(1);
  });

  it("rejects model-normalized service variability conflicts", () => {
    const markovian = solveQueue(
      { lambda: 2, mu: 3, s: 1, serviceScv: 2 },
      { modelKind: "mm1" },
    );
    const deterministic = solveQueue(
      { lambda: 2, mu: 5, serviceScv: 1 },
      { modelKind: "md1" },
    );

    expect(markovian.status).toBe("inconsistent");
    expect(deterministic.status).toBe("inconsistent");
  });
});
