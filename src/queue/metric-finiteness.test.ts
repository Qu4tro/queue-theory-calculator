import { describe, expect, it } from "vitest";

import { areMetricNumbersFinite } from "./metric-finiteness";

describe("areMetricNumbersFinite", () => {
  it("rejects nonfinite scalar metric values", () => {
    for (const value of [NaN, Infinity, -Infinity]) {
      expect(areMetricNumbersFinite({ lambda: 1, L: value })).toBe(false);
    }
  });

  it("rejects nonfinite state probabilities", () => {
    expect(
      areMetricNumbersFinite({
        lambda: 1,
        stateProbabilities: [0.25, Infinity, 0.75],
      }),
    ).toBe(false);
  });

  it("rejects nonfinite nested object values", () => {
    expect(
      areMetricNumbersFinite({
        lambda: 1,
        diagnostics: { residual: -Infinity },
      }),
    ).toBe(false);
  });

  it("allows nonnumeric metadata fields", () => {
    expect(
      areMetricNumbersFinite({
        modelKind: "ggs",
        s: null,
        computation: {
          modelKind: "ggs",
          method: "allen-cunneen-gg-s",
          metricQuality: { L: "approximate", P0: "mm-s-baseline" },
          notes: ["metadata is descriptive"],
        },
        nullableMetadata: null,
        isApproximation: true,
      }),
    ).toBe(true);
  });

  it("catches newly added numeric fields without a field allowlist", () => {
    expect(
      areMetricNumbersFinite({
        lambda: 1,
        futureMetric: Number.POSITIVE_INFINITY,
      }),
    ).toBe(false);
  });
});
