import { describe, expect, it } from "vitest";

import type { UrlState } from "./app-types";
import { defaultTerminology } from "./terminology";
import { buildUrlSearchForState, readUrlStateFromSearch } from "./url-state";

function fullState(overrides: Partial<Required<UrlState>>): Required<UrlState> {
  return {
    drafts: {},
    lossPreset: false,
    mode: "mm1",
    speed: 1,
    termPreset: "default",
    terms: defaultTerminology,
    timeUnit: "seconds",
    ...overrides,
  };
}

describe("URL state helpers", () => {
  it("round-trips model state while preserving unmanaged query params", () => {
    const search = buildUrlSearchForState(
      fullState({
        drafts: {
          lambda: "4",
          mu: "3",
          s: "2",
          ca2: "0.5",
          cs2: "0.5",
          Pbusy: "0.4",
        },
        mode: "ggs",
        speed: 5,
        timeUnit: "minutes",
      }),
      "?utm=keep&model=mm1&lambda=old",
    );
    const read = readUrlStateFromSearch(search);

    expect(search).toContain("utm=keep");
    expect(search).toContain("model=ggs");
    expect(search).toContain("time_unit=minutes");
    expect(search).toContain("speed=5");
    expect(search).not.toContain("Pbusy");
    expect(read).toMatchObject({
      drafts: {
        lambda: "4",
        mu: "3",
        s: "2",
        ca2: "0.5",
        cs2: "0.5",
      },
      mode: "ggs",
      speed: 5,
      timeUnit: "minutes",
    });
  });

  it("omits fixed capacity for the loss preset and restores the preset flag", () => {
    const search = buildUrlSearchForState(
      fullState({
        drafts: {
          lambda: "10",
          mu: "4",
          s: "3",
          K: "9",
          Pblock: "0.12",
        },
        lossPreset: true,
        mode: "mmsk",
      }),
    );
    const read = readUrlStateFromSearch(search);

    expect(search).toContain("model=mmsk");
    expect(search).toContain("loss=1");
    expect(search).not.toContain("K=");
    expect(read.lossPreset).toBe(true);
    expect(read.drafts).toMatchObject({
      lambda: "10",
      mu: "4",
      s: "3",
      Pblock: "0.12",
    });
  });

  it("drops incompatible M/M/infinity query metrics when reading", () => {
    const read = readUrlStateFromSearch(
      "?model=mminf&lambda=6&mu=3&s=2&Lq=5&Wq=1&a=2",
    );

    expect(read.mode).toBe("mminf");
    expect(read.drafts).toEqual({ lambda: "6", mu: "3", a: "2" });
  });

  it("caps oversized query data before decoding drafts", () => {
    const longValue = "1".repeat(200);
    const read = readUrlStateFromSearch(`?lambda=${longValue}`);

    expect(read.drafts.lambda).toHaveLength(128);
  });
});
