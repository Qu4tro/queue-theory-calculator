import { clamp } from "../math";
import type {
  NormalizedSnapshot,
  VisualizerCustomer,
  VisualizerServerState,
  VisualizerSnapshot,
} from "./types";

export function normalizeSnapshot(
  snapshot: VisualizerSnapshot | null | undefined,
): NormalizedSnapshot {
  if (!snapshot) {
    return emptySnapshot(false, null);
  }

  const previewCustomers = snapshot.queuePreview?.customers ?? [];
  const queue = Array.isArray(snapshot.queue)
    ? snapshot.queue
    : previewCustomers;
  const servers = Array.isArray(snapshot.servers) ? snapshot.servers : [];
  const serverCapacity =
    snapshot.serverCapacity === "infinite" ||
    snapshot.modelKind === "mminf" ||
    snapshot.params?.modelKind === "mminf"
      ? "infinite"
      : "finite";
  const rawBusyServers =
    nonNegativeInteger(snapshot.busyServers) ??
    countBusyServers(servers, servers.length);
  const serverCount =
    serverCapacity === "infinite"
      ? Math.max(rawBusyServers, servers.length)
      : (nonNegativeInteger(snapshot.serverCount) ??
        nonNegativeInteger(snapshot.s) ??
        nonNegativeInteger(snapshot.params?.s) ??
        servers.length);
  const capacity = nonNegativeInteger(snapshot.params?.K) ?? null;
  const queueCapacity =
    serverCapacity === "infinite"
      ? null
      : capacity === null
        ? null
        : Math.max(0, capacity - serverCount);
  const busyServers = rawBusyServers;
  const queueLength =
    serverCapacity === "infinite"
      ? 0
      : (nonNegativeInteger(snapshot.queueLength) ??
        nonNegativeInteger(snapshot.queuePreview?.totalLength) ??
        Math.max(queue.length, 0));
  const systemCount =
    nonNegativeInteger(snapshot.systemCount) ?? queueLength + busyServers;

  return {
    hasSnapshot: true,
    now: finiteNumber(snapshot.now) ?? 0,
    queue,
    queueLength,
    servers,
    serverCount,
    serverCapacity,
    capacity,
    queueCapacity,
    busyServers: clamp(Math.round(busyServers), 0, serverCount),
    systemCount: Math.max(0, Math.round(systemCount)),
    arrivals: nonNegativeInteger(snapshot.arrivals) ?? 0,
    acceptedArrivals: nonNegativeInteger(snapshot.acceptedArrivals) ?? 0,
    blockedArrivals: nonNegativeInteger(snapshot.blockedArrivals) ?? 0,
    completions: nonNegativeInteger(snapshot.completions) ?? 0,
    abandonments: nonNegativeInteger(snapshot.abandonments) ?? 0,
    status: snapshot.status ?? null,
  };
}

function emptySnapshot(
  hasSnapshot: boolean,
  status: string | null,
): NormalizedSnapshot {
  return {
    hasSnapshot,
    now: 0,
    queue: [],
    queueLength: 0,
    servers: [],
    serverCount: 0,
    serverCapacity: "finite",
    capacity: null,
    queueCapacity: null,
    busyServers: 0,
    systemCount: 0,
    arrivals: 0,
    acceptedArrivals: 0,
    blockedArrivals: 0,
    completions: 0,
    abandonments: 0,
    status,
  };
}

export function queueCustomerEntityId(
  customer: VisualizerCustomer,
  index: number,
): string {
  const id = customer.id ?? customer.customerId;
  return id === null || id === undefined ? `queue-${index}` : `customer-${id}`;
}

export function serverCustomerEntityId(
  server: VisualizerServerState | undefined,
  index: number,
): string {
  const customerId = server?.customerId ?? server?.customer?.id;
  return customerId === null || customerId === undefined
    ? `server-placeholder-${index}`
    : `customer-${customerId}`;
}

export function isServerBusy(
  server: VisualizerServerState | undefined,
  index: number,
  busyServers: number,
): boolean {
  if (server?.status === "busy") {
    return true;
  }

  if (server?.status === "idle") {
    return false;
  }

  if (server) {
    return (
      (server.customerId !== null && server.customerId !== undefined) ||
      server.customer !== null
    );
  }

  return index < busyServers;
}

function countBusyServers(
  servers: readonly VisualizerServerState[],
  serverCount: number,
): number {
  let busy = 0;
  const count = Math.min(servers.length, serverCount);

  for (let index = 0; index < count; index += 1) {
    if (isServerBusy(servers[index], index, 0)) {
      busy += 1;
    }
  }

  return busy;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonNegativeInteger(value: unknown): number | null {
  const numberValue = finiteNumber(value);

  if (numberValue === null || numberValue < 0) {
    return null;
  }

  return Math.round(numberValue);
}

export function positiveNumber(
  value: number | undefined,
  fallback: number,
): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

export function positiveInteger(
  value: number | undefined,
  fallback: number,
): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.max(1, Math.round(value))
    : fallback;
}
