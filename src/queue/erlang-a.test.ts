import { describe, expect, it } from "vitest";

import { calculateErlangA } from "./erlang-a";
import { solveQueue } from "./solver";

describe("calculateErlangA", () => {
  it("preserves birth-death flow and Little's-law identities", () => {
    const result = calculateErlangA({
      modelKind: "erlang-a",
      lambda: 2,
      mu: 3,
      s: 1,
      theta: 1,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }

    expect(result.metrics.offeredRho).toBeCloseTo(2 / 3);
    expect(result.metrics.L).toBeCloseTo(result.metrics.Ls + result.metrics.Lq);
    expect(result.metrics.W).toBeCloseTo(result.metrics.L / 2);
    expect(result.metrics.Wq).toBeCloseTo(result.metrics.Lq / 2);
    expect(result.metrics.abandonRate).toBeCloseTo(result.metrics.Lq);
    expect(result.metrics.throughput).toBeCloseTo(
      result.metrics.lambda - result.metrics.abandonRate,
    );
    expect(result.metrics.Pabandon + result.metrics.Pserved).toBeCloseTo(1);
    expect(result.metrics.rho).toBeGreaterThan(0);
    expect(result.metrics.rho).toBeLessThan(1);
    expect(result.warnings).toEqual([]);
    expect(result.metrics.computation.method).toBe("birth-death-erlang-a");
  });

  it("stabilizes overloaded offered demand with abandonment warnings", () => {
    const result = calculateErlangA({
      modelKind: "erlang-a",
      lambda: 6,
      mu: 3,
      s: 1,
      theta: 2,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }

    expect(result.metrics.offeredRho).toBeCloseTo(2);
    expect(result.metrics.abandonRate).toBeGreaterThan(0);
    expect(result.metrics.throughput).toBeGreaterThan(0);
    expect(result.metrics.throughput).toBeLessThan(result.metrics.lambda);
    expect(result.metrics.Pabandon).toBeGreaterThan(0);
    expect(result.metrics.Pserved).toBeLessThan(1);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "erlang-a-overload" }),
      ]),
    );
    expect(result.metrics.computation.notes.join(" ")).toContain(
      "abandonment stabilizes",
    );
  });

  it("rejects non-positive abandonment rates", () => {
    const result = calculateErlangA({
      modelKind: "erlang-a",
      lambda: 2,
      mu: 3,
      s: 1,
      theta: 0,
    });

    expect(result.status).toBe("invalid");
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "theta-positive" }),
      ]),
    );
  });
});

describe("solveQueue Erlang A inverses", () => {
  it("infers service rate from a known arrival rate and wait target", () => {
    const base = calculateErlangA({
      modelKind: "erlang-a",
      lambda: 2,
      mu: 3,
      s: 1,
      theta: 1,
    });

    expect(base.status).toBe("ok");
    if (base.status !== "ok") {
      return;
    }

    const result = solveQueue(
      { lambda: 2, s: 1, theta: 1, Wq: base.metrics.Wq },
      { modelKind: "erlang-a" },
    );

    expect(result.status).toBe("solved");
    if (result.status !== "solved") {
      return;
    }

    expect(result.params).toMatchObject({ lambda: 2, s: 1, theta: 1 });
    expect(result.params.mu).toBeCloseTo(3);
    expect(result.metrics.Wq).toBeCloseTo(base.metrics.Wq);
  });

  it("infers abandonment rate from known rates and abandonment probability", () => {
    const base = calculateErlangA({
      modelKind: "erlang-a",
      lambda: 2,
      mu: 3,
      s: 1,
      theta: 1,
    });

    expect(base.status).toBe("ok");
    if (base.status !== "ok") {
      return;
    }

    const result = solveQueue(
      { lambda: 2, mu: 3, s: 1, Pabandon: base.metrics.Pabandon },
      { modelKind: "erlang-a" },
    );

    expect(result.status).toBe("solved");
    if (result.status !== "solved") {
      return;
    }

    const params = result.params as unknown as Record<string, unknown>;

    expect(result.params).toMatchObject({ lambda: 2, mu: 3, s: 1 });
    expect(params.theta).toEqual(expect.any(Number));
    expect(params.theta as number).toBeCloseTo(1);
    expect(result.metrics.Pabandon).toBeCloseTo(base.metrics.Pabandon);
  });
});
