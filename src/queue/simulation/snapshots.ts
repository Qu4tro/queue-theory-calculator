import type { InternalCustomer } from "./internal-types";
import type { SimCustomer, SimulationAccessibleSnapshot } from "./types";

export function toCustomerSnapshot(
  customer: InternalCustomer,
  queuePosition: number | null,
): SimCustomer {
  return {
    id: customer.id,
    arrivedAt: customer.arrivedAt,
    serviceStartedAt: customer.serviceStartedAt,
    serviceEndsAt: customer.serviceEndsAt,
    abandonAt: customer.abandonAt,
    abandonedAt: customer.abandonedAt,
    waitedOnArrival: customer.waitedOnArrival,
    queuePosition,
  };
}

export function buildAccessibleSnapshot(input: {
  now: number;
  queueLength: number;
  visibleQueueLength: number;
  queueOverflow: number;
  busyServers: number;
  totalServers: number | null;
  serverCapacity: "finite" | "infinite";
  arrivals: number;
  acceptedArrivals: number;
  blockedArrivals: number;
  completions: number;
  abandonments: number;
  eventCapReached: boolean;
  remainingDeltaTime: number;
}): SimulationAccessibleSnapshot {
  const queueSummary =
    input.serverCapacity === "infinite"
      ? "No waiting queue."
      : input.queueOverflow > 0
        ? `${input.queueLength} customers waiting; ${input.visibleQueueLength} shown and ${input.queueOverflow} more summarized.`
        : `${input.queueLength} customers waiting.`;
  const serverSummary =
    input.serverCapacity === "infinite"
      ? `${input.busyServers} active services.`
      : `${input.busyServers} of ${input.totalServers ?? 0} servers busy.`;
  const capSummary = input.eventCapReached
    ? ` Event cap reached on the last advance; ${formatSummaryNumber(input.remainingDeltaTime)} seconds of requested simulation time remains queued.`
    : "";

  return {
    label: "Queueing simulation state",
    summary:
      input.blockedArrivals > 0
        ? `Simulation time ${formatSummaryNumber(input.now)} seconds. ${queueSummary} ${serverSummary} ${input.arrivals} attempted arrivals, ${input.acceptedArrivals} accepted, ${input.blockedArrivals} blocked, and ${input.completions} completions.${capSummary}`
        : input.abandonments > 0
          ? `Simulation time ${formatSummaryNumber(input.now)} seconds. ${queueSummary} ${serverSummary} ${input.arrivals} arrivals, ${input.completions} completions, and ${input.abandonments} abandonments.${capSummary}`
          : `Simulation time ${formatSummaryNumber(input.now)} seconds. ${queueSummary} ${serverSummary} ${input.arrivals} arrivals and ${input.completions} completions.${capSummary}`,
    queueSummary,
    serverSummary,
  };
}

export function requiredTime(value: number | null): number {
  if (value === null) {
    throw new Error("Expected customer service timestamp to be set.");
  }

  return value;
}

function formatSummaryNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "unknown";
  }

  if (Math.abs(value) >= 100) {
    return value.toFixed(0);
  }

  if (Math.abs(value) >= 10) {
    return value.toFixed(1);
  }

  return value.toFixed(2);
}
