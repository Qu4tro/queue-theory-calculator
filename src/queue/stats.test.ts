import { describe, expect, it } from "vitest";

import { compareQueueStatsToTheory, QueueStatsCollector } from "./stats";

const zeroThresholds = {
  warmupDuration: 0,
  minComparisonDuration: 0,
  minArrivals: 0,
  minCompletions: 0,
};

describe("QueueStatsCollector", () => {
  it("calculates wait probability from accepted arrivals only", () => {
    const stats = new QueueStatsCollector({
      params: { lambda: 2, mu: 3, s: 1, K: 1 },
      thresholds: zeroThresholds,
    });

    stats.recordAcceptedArrival(1, 0, 0, 0, false);
    stats.recordAcceptedArrival(2, 1, 0, 1, true);
    stats.recordBlockedArrival(3, 1, 0, 1);

    const snapshot = stats.snapshot();

    expect(snapshot.counters.acceptedArrivalsObserved).toBe(2);
    expect(snapshot.counters.attemptedArrivalsObserved).toBe(3);
    expect(snapshot.counters.blockedArrivalsObserved).toBe(1);
    expect(snapshot.metrics.Pwait).toBe(1 / 2);
    expect(snapshot.metrics.Pblock).toBe(1 / 3);
  });

  it("does not count events until warmup has completed", () => {
    const stats = new QueueStatsCollector({
      params: { lambda: 1, mu: 2, s: 1 },
      thresholds: {
        warmupDuration: 5,
        minComparisonDuration: 2,
        minArrivals: 1,
        minCompletions: 1,
      },
    });

    stats.recordAcceptedArrival(1, 0, 0, 0, false);

    expect(stats.snapshot()).toMatchObject({
      status: "warming-up",
      counters: { arrivalsObserved: 0 },
      missingComparability: ["warmup"],
    });

    stats.observeStateUntilCounts(6, 0, 0, 0);

    expect(stats.snapshot()).toMatchObject({
      status: "collecting",
      sampleStartTime: 5,
      sampleElapsed: 1,
      missingComparability: ["sample-duration", "arrivals", "completions"],
    });

    stats.recordAcceptedArrival(6, 0, 0, 0, false);
    stats.recordServiceStart(6, 1, 0, 0);
    stats.recordServiceCompletion(8, 1, 0, 1, 6, 6, 8, 2);

    const snapshot = stats.snapshot();

    expect(snapshot.status).toBe("comparable");
    expect(snapshot.counters.acceptedArrivalsObserved).toBe(1);
    expect(snapshot.counters.completedCustomers).toBe(1);
    expect(snapshot.metrics.W).toBe(2);
    expect(snapshot.metrics.Wq).toBe(0);
  });

  it("uses Erlang-A abandonments as departures for comparison gates and waits", () => {
    const stats = new QueueStatsCollector({
      params: { modelKind: "erlang-a", lambda: 3, mu: 4, s: 2, theta: 1 },
      thresholds: {
        warmupDuration: 0,
        minComparisonDuration: 0,
        minArrivals: 1,
        minCompletions: 1,
      },
    });

    stats.recordAcceptedArrival(1, 0, 0, 0, true);
    stats.recordAbandonment(3, 1, 1, 0, 1, 3);

    const snapshot = stats.snapshot();

    expect(snapshot.status).toBe("comparable");
    expect(snapshot.counters.completedCustomers).toBe(0);
    expect(snapshot.counters.abandonedCustomers).toBe(1);
    expect(snapshot.counters.departedCustomers).toBe(1);
    expect(snapshot.metrics.W).toBe(2);
    expect(snapshot.metrics.Wq).toBe(2);
    expect(snapshot.metrics.abandonRate).toBeCloseTo(1 / 3);
    expect(snapshot.metrics.theta).toBeCloseTo(1 / 2);
    expect(snapshot.metrics.Pabandon).toBe(1);
    expect(snapshot.metrics.Pserved).toBe(0);
  });

  it("keeps configured values separate from numerical comparison badges", () => {
    const stats = new QueueStatsCollector({
      params: { lambda: 1, mu: 2, s: 1 },
      thresholds: zeroThresholds,
    });

    stats.observeStateUntilCounts(10, 1, 0, 1);

    const comparisons = compareQueueStatsToTheory(
      {
        lambda: 1,
        mu: 2,
        s: 1,
        a: 0.5,
        L: 1,
        Lq: 0,
        W: 1,
        Wq: 0,
        rho: 1,
        P0: 0,
        Pbusy: 1,
        Pwait: 0,
      },
      stats.snapshot(),
    );

    expect(
      comparisons.find((comparison) => comparison.metric === "s"),
    ).toMatchObject({ theoretical: 1, simulated: 1, badge: "configured" });
    expect(
      comparisons.find((comparison) => comparison.metric === "rho"),
    ).toMatchObject({ theoretical: 1, simulated: 1, badge: "near" });
  });
});
