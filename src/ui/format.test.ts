import { describe, expect, it } from "vitest";

import { formatNumber } from "./format";

describe("formatNumber", () => {
  it("normalizes large scientific notation exponents", () => {
    expect(formatNumber(1_000_000_000)).toBe("1e9");
    expect(formatNumber(1_230_000_000)).toBe("1.23e9");
  });

  it("preserves negative exponents after trimming mantissa zeros", () => {
    expect(formatNumber(1.2e-7)).toBe("1.2e-7");
  });

  it("preserves fixed notation produced by the scientific formatting branch", () => {
    expect(formatNumber(123, { forceScientific: true })).toBe("123.0");
    expect(formatNumber(0.0000123)).toBe("0.00001230");
  });
});
