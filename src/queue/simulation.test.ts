import { afterEach, describe, expect, it, vi } from "vitest";

import {
  QueueSimulation,
  type SimulationParams,
  type SimulationVisualSnapshot,
} from "./simulation";

const BUSY_MM1_PARAMS: SimulationParams = {
  lambda: 900,
  mu: 1_000,
  s: 1,
  seed: 24,
};

describe("QueueSimulation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("orders M/M/infinity active service snapshots by completion time", () => {
    const simulation = new QueueSimulation(
      { modelKind: "mminf", lambda: 12, mu: 0.4, seed: 7 },
      { collectStats: false, maxSnapshotServers: 20 },
    );
    let checkedActiveSnapshot = false;

    for (let step = 0; step < 20; step += 1) {
      simulation.advance(0.5);
      const serviceEndTimes = activeServiceEndTimes(
        simulation.visualSnapshot(),
      );

      if (serviceEndTimes.length < 4) {
        continue;
      }

      checkedActiveSnapshot = true;
      expect(serviceEndTimes).toEqual(
        [...serviceEndTimes].sort((left, right) => left - right),
      );
    }

    expect(checkedActiveSnapshot).toBe(true);
  });

  it("keeps unseeded gamma normal spares isolated per simulation", () => {
    let randomCalls = 0;
    vi.spyOn(Math, "random").mockImplementation(() => {
      randomCalls += 1;
      return 0.5;
    });

    const params: SimulationParams = {
      lambda: 0.5,
      mu: 1,
      s: 1,
      serviceTime: { kind: "gamma", serviceScv: 1 },
    };
    const first = new QueueSimulation(params);
    const second = new QueueSimulation(params);

    first.advance(first.visualSnapshot().nextArrivalAt);

    const callsBeforeSecondArrival = randomCalls;

    second.advance(second.visualSnapshot().nextArrivalAt);

    expect(randomCalls - callsBeforeSecondArrival).toBe(4);
  });
});

function activeServiceEndTimes(snapshot: SimulationVisualSnapshot): number[] {
  return snapshot.servers.map((server) => {
    if (server.serviceEndsAt === null) {
      throw new Error(
        "Expected active M/M/infinity service to have an end time.",
      );
    }

    return server.serviceEndsAt;
  });
}

describe("QueueSimulation advance caps", () => {
  it("reports advanced and remaining time when the event cap is reached", () => {
    const simulation = new QueueSimulation(BUSY_MM1_PARAMS, {
      maxEventsPerAdvance: 1,
    });

    const info = simulation.advanceTime(0.02);
    const snapshot = simulation.snapshot();

    expect(info.eventCapReached).toBe(true);
    expect(info.requestedDeltaTime).toBe(0.02);
    expect(info.targetTime).toBeCloseTo(0.02);
    expect(info.processedEvents).toBe(1);
    expect(snapshot.now).toBeGreaterThan(0);
    expect(snapshot.now).toBeLessThan(info.targetTime);
    expect(info.advancedDeltaTime).toBeCloseTo(snapshot.now);
    expect(info.remainingDeltaTime).toBeCloseTo(info.targetTime - snapshot.now);
  });

  it("reports the full requested time when an advance is not capped", () => {
    const simulation = new QueueSimulation(BUSY_MM1_PARAMS, {
      maxEventsPerAdvance: 1_000,
    });

    const info = simulation.advanceTime(0.02);
    const snapshot = simulation.snapshot();

    expect(info.eventCapReached).toBe(false);
    expect(info.advancedDeltaTime).toBeCloseTo(info.requestedDeltaTime);
    expect(info.remainingDeltaTime).toBe(0);
    expect(snapshot.now).toBeCloseTo(info.targetTime);
  });

  it("can consume carried remaining time without moving time backward", () => {
    const requestedDeltaTime = 0.02;
    const simulation = new QueueSimulation(BUSY_MM1_PARAMS, {
      maxEventsPerAdvance: 1,
    });
    let info = simulation.advanceTime(requestedDeltaTime);
    let pendingDeltaTime = info.remainingDeltaTime;
    let currentNow = simulation.snapshot().now;
    let totalAdvancedTime = info.advancedDeltaTime;

    expect(info.eventCapReached).toBe(true);

    for (
      let attempt = 0;
      info.eventCapReached && attempt < 1_000;
      attempt += 1
    ) {
      const previousNow = currentNow;
      const previousPendingDeltaTime = pendingDeltaTime;

      info = simulation.advanceTime(pendingDeltaTime);
      currentNow = simulation.snapshot().now;
      pendingDeltaTime = info.remainingDeltaTime;
      totalAdvancedTime += info.advancedDeltaTime;

      expect(currentNow).toBeGreaterThanOrEqual(previousNow);
      expect(info.targetTime).toBeCloseTo(requestedDeltaTime);
      expect(pendingDeltaTime).toBeLessThanOrEqual(previousPendingDeltaTime);
    }

    expect(info.eventCapReached).toBe(false);
    expect(currentNow).toBeCloseTo(requestedDeltaTime);
    expect(pendingDeltaTime).toBe(0);
    expect(totalAdvancedTime).toBeCloseTo(requestedDeltaTime);
  });
});
