import { describe, expect, it } from "vitest";

import { normalizeSnapshot } from "./snapshot";
import type { VisualizerSnapshot } from "./types";

describe("normalizeSnapshot", () => {
  it("returns an empty state when no snapshot is available", () => {
    expect(normalizeSnapshot(null)).toMatchObject({
      hasSnapshot: false,
      queueLength: 0,
      serverCount: 0,
      status: null,
    });
  });

  it("uses queue previews and finite capacity metadata", () => {
    const snapshot: VisualizerSnapshot = {
      params: { s: 2, K: 5 },
      queuePreview: {
        customers: [{ id: "queued-1" }],
        totalLength: 3,
      },
      servers: [
        { id: 1, status: "busy" },
        { id: 2, status: "idle" },
      ],
    };

    expect(normalizeSnapshot(snapshot)).toMatchObject({
      hasSnapshot: true,
      queueLength: 3,
      serverCount: 2,
      queueCapacity: 3,
      busyServers: 1,
      systemCount: 4,
    });
  });

  it("normalizes infinite-server snapshots as direct service", () => {
    const snapshot: VisualizerSnapshot = {
      modelKind: "mminf",
      queueLength: 12,
      busyServers: 4,
      servers: [{ status: "busy" }, { status: "busy" }],
    };

    expect(normalizeSnapshot(snapshot)).toMatchObject({
      serverCapacity: "infinite",
      queueLength: 0,
      serverCount: 4,
      busyServers: 4,
    });
  });
});
