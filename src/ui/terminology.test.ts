import { describe, expect, it } from "vitest";

import { defaultTerminology, normalizeTerm } from "./terminology";

describe("normalizeTerm", () => {
  it("neutralizes embedded bidi control characters", () => {
    expect(normalizeTerm("queue", "Front\u202EQueue\u2066Line")).toBe(
      "Front Queue Line",
    );
    expect(normalizeTerm("arrival", "Check\u061cIn\u200eRate")).toBe(
      "Check In Rate",
    );
  });

  it("falls back to the default term when only unsafe controls remain", () => {
    expect(normalizeTerm("system", "\u202E\u2066\u200F\u007F")).toBe(
      defaultTerminology.system,
    );
  });

  it("preserves visible non-ASCII terminology", () => {
    expect(normalizeTerm("customer", "Café 客")).toBe("Café 客");
  });
});
