import { describe, expect, it } from "vitest";

import { calculateMmS } from "./mm-s";
import { calculateMmSK } from "./mm-s-k";

describe("calculateMmS", () => {
  it("matches M/M/1 closed-form queue metrics", () => {
    const result = calculateMmS({ lambda: 2, mu: 3, s: 1 });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }

    expect(result.metrics.rho).toBeCloseTo(2 / 3);
    expect(result.metrics.P0).toBeCloseTo(1 / 3);
    expect(result.metrics.Pwait).toBeCloseTo(2 / 3);
    expect(result.metrics.Lq).toBeCloseTo(4 / 3);
    expect(result.metrics.Wq).toBeCloseTo(2 / 3);
    expect(result.metrics.W).toBeCloseTo(1);
    expect(result.metrics.L).toBeCloseTo(2);
  });

  it("rejects unstable infinite-capacity queues", () => {
    const result = calculateMmS({ lambda: 6, mu: 3, s: 2 });

    expect(result.status).toBe("unstable");
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "system-unstable" }),
      ]),
    );
  });

  it("matches M/M/s closed-form metrics for multiple servers", () => {
    const result = calculateMmS({ lambda: 4, mu: 3, s: 2 });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }

    expect(result.metrics.rho).toBeCloseTo(2 / 3);
    expect(result.metrics.P0).toBeCloseTo(1 / 5);
    expect(result.metrics.Pwait).toBeCloseTo(8 / 15);
    expect(result.metrics.Lq).toBeCloseTo(16 / 15);
    expect(result.metrics.Wq).toBeCloseTo(4 / 15);
    expect(result.metrics.W).toBeCloseTo(3 / 5);
    expect(result.metrics.L).toBeCloseTo(12 / 5);
  });
});

describe("calculateMmSK", () => {
  it("handles the K = s no-wait loss edge case", () => {
    const result = calculateMmSK({ lambda: 4, mu: 3, s: 2, K: 2 });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }

    expect(result.metrics.stateProbabilities).toHaveLength(3);
    expect(result.metrics.P0).toBeCloseTo(9 / 29);
    expect(result.metrics.Pwait).toBeCloseTo(0);
    expect(result.metrics.Pblock).toBeCloseTo(8 / 29);
    expect(result.metrics.busyServers).toBeCloseTo(28 / 29);
    expect(result.metrics.lambdaEffective).toBeCloseTo(84 / 29);
    expect(result.metrics.rho).toBeCloseTo(14 / 29);
    expect(result.metrics.Lq).toBeCloseTo(0);
    expect(result.metrics.Wq).toBeCloseTo(0);
    expect(result.metrics.W).toBeCloseTo(1 / 3);
    expect(result.metrics.L).toBeCloseTo(28 / 29);
  });

  it("matches finite-capacity birth-death metrics with blocking", () => {
    const result = calculateMmSK({ lambda: 3, mu: 2, s: 2, K: 4 });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }

    expect(result.metrics.stateProbabilities).toHaveLength(5);
    expect(result.metrics.P0).toBeCloseTo(128 / 653);
    expect(result.metrics.Pwait).toBeCloseTo(252 / 572);
    expect(result.metrics.Pblock).toBeCloseTo(81 / 653);
    expect(result.metrics.busyServers).toBeCloseTo(858 / 653);
    expect(result.metrics.lambdaEffective).toBeCloseTo(1716 / 653);
    expect(result.metrics.rho).toBeCloseTo(429 / 653);
    expect(result.metrics.Lq).toBeCloseTo(270 / 653);
    expect(result.metrics.L).toBeCloseTo(1128 / 653);
    expect(result.metrics.Wq).toBeCloseTo(45 / 286);
    expect(result.metrics.W).toBeCloseTo(188 / 286);
  });

  it("rejects capacity below server count", () => {
    const result = calculateMmSK({ lambda: 3, mu: 2, s: 3, K: 2 });

    expect(result.status).toBe("invalid");
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "K-at-least-s" }),
      ]),
    );
  });
});
