import { describe, expect, it } from "vitest";

import { calculateGgS } from "./gg-s";
import { calculateMg1 } from "./mg-1";
import { calculateMmInfinity } from "./mm-infinity";

describe("calculateMg1", () => {
  it("matches Pollaczek-Khinchine metrics for M/G/1", () => {
    const result = calculateMg1({
      modelKind: "mg1",
      lambda: 2,
      mu: 5,
      s: 1,
      serviceScv: 2,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }

    expect(result.metrics.rho).toBeCloseTo(0.4);
    expect(result.metrics.P0).toBeCloseTo(0.6);
    expect(result.metrics.Pwait).toBeCloseTo(0.4);
    expect(result.metrics.serviceVariance).toBeCloseTo(2 / 25);
    expect(result.metrics.serviceSecondMoment).toBeCloseTo(3 / 25);
    expect(result.metrics.Lq).toBeCloseTo(0.4);
    expect(result.metrics.Wq).toBeCloseTo(0.2);
    expect(result.metrics.W).toBeCloseTo(0.4);
    expect(result.metrics.L).toBeCloseTo(0.8);
  });

  it("matches deterministic-service M/D/1 metrics", () => {
    const result = calculateMg1({
      modelKind: "md1",
      lambda: 2,
      mu: 5,
      s: 1,
      serviceScv: 0,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }

    expect(result.metrics.serviceScv).toBe(0);
    expect(result.metrics.serviceVariance).toBe(0);
    expect(result.metrics.serviceSecondMoment).toBeCloseTo(1 / 25);
    expect(result.metrics.Lq).toBeCloseTo(2 / 15);
    expect(result.metrics.Wq).toBeCloseTo(1 / 15);
    expect(result.metrics.W).toBeCloseTo(4 / 15);
    expect(result.metrics.L).toBeCloseTo(8 / 15);
  });

  it("rejects invalid and unstable general-service inputs", () => {
    const invalid = calculateMg1({
      modelKind: "mg1",
      lambda: 2,
      mu: 5,
      s: 1,
      serviceScv: -1,
    });
    const unstable = calculateMg1({
      modelKind: "mg1",
      lambda: 5,
      mu: 5,
      s: 1,
      serviceScv: 1,
    });

    expect(invalid.status).toBe("invalid");
    expect(unstable.status).toBe("unstable");
  });
});

describe("calculateGgS", () => {
  it("scales M/M/s waiting metrics with Allen-Cunneen variability", () => {
    const result = calculateGgS({
      modelKind: "ggs",
      lambda: 4,
      mu: 3,
      s: 2,
      ca2: 0.5,
      cs2: 0.5,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }

    expect(result.metrics.variabilityFactor).toBeCloseTo(0.5);
    expect(result.metrics.P0).toBeCloseTo(1 / 5);
    expect(result.metrics.Pwait).toBeCloseTo(8 / 15);
    expect(result.metrics.Lq).toBeCloseTo(8 / 15);
    expect(result.metrics.Wq).toBeCloseTo(2 / 15);
    expect(result.metrics.W).toBeCloseTo(7 / 15);
    expect(result.metrics.L).toBeCloseTo(28 / 15);
    expect(result.metrics.computation.method).toBe("allen-cunneen-gg-s");
    expect(result.metrics.computation.metricQuality.Lq).toBe("approximate");
    expect(result.metrics.computation.metricQuality.Pwait).toBe(
      "mm-s-baseline",
    );
  });

  it("rejects unstable and invalid variability inputs", () => {
    const unstable = calculateGgS({
      modelKind: "ggs",
      lambda: 6,
      mu: 3,
      s: 2,
      ca2: 1,
      cs2: 1,
    });
    const invalid = calculateGgS({
      modelKind: "ggs",
      lambda: 4,
      mu: 3,
      s: 2,
      ca2: -0.1,
      cs2: 1,
    });

    expect(unstable.status).toBe("unstable");
    expect(invalid.status).toBe("invalid");
  });
});

describe("calculateMmInfinity", () => {
  it("matches no-wait infinite-server metrics", () => {
    const result = calculateMmInfinity({
      modelKind: "mminf",
      lambda: 6,
      mu: 3,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }

    expect(result.metrics.s).toBeNull();
    expect(result.metrics.rho).toBeNull();
    expect(result.metrics.Pbusy).toBeNull();
    expect(result.metrics.a).toBeCloseTo(2);
    expect(result.metrics.P0).toBeCloseTo(Math.exp(-2));
    expect(result.metrics.Lq).toBe(0);
    expect(result.metrics.Wq).toBe(0);
    expect(result.metrics.Pwait).toBe(0);
    expect(result.metrics.W).toBeCloseTo(1 / 3);
    expect(result.metrics.L).toBeCloseTo(2);
  });
});
