import { describe, expect, it } from "vitest";

import { calculateMmSK } from "./mm-s-k";

describe("calculateMmSK", () => {
  it("reports numeric underflow when throughput collapses to zero", () => {
    const result = calculateMmSK({
      lambda: Number.MIN_VALUE,
      mu: Number.MAX_VALUE,
      s: 1,
      K: 1,
    });

    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") {
      return;
    }

    expect(result.errors).toEqual([
      {
        field: "numeric",
        code: "numeric-underflow",
        message:
          "The finite-capacity formulas underflowed to zero accepted throughput for these inputs.",
      },
    ]);
  });

  it("reports wait probability conditional on accepted arrivals", () => {
    const result = calculateMmSK({ lambda: 2, mu: 1, s: 1, K: 2 });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }

    expect(result.metrics.Pblock).toBeCloseTo(4 / 7);
    expect(result.metrics.Pwait).toBeCloseTo(2 / 3);
  });
});
