export interface InternalCustomer {
  id: number;
  arrivedAt: number;
  serviceStartedAt: number | null;
  serviceEndsAt: number | null;
  abandonAt: number | null;
  abandonedAt: number | null;
  waitedOnArrival: boolean;
}

export interface InternalServer {
  id: number;
  customer: InternalCustomer | null;
  serviceStartedAt: number | null;
  serviceEndsAt: number | null;
}

export type NextSimulationEvent =
  | { type: "arrival"; time: number }
  | { type: "abandonment"; time: number; customerId: number }
  | NextCompletionEvent;

export type NextCompletionEvent = {
  type: "completion";
  time: number;
} & (
  | {
      modelKind: "finite";
      serverIndex: number;
    }
  | {
      modelKind: "mminf";
    }
);

export type FiniteCompletionEntry = {
  time: number;
  serverIndex: number;
};

export type AbandonmentEntry = {
  time: number;
  customerId: number;
};
