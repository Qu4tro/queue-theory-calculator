import type { MmInfinityMetrics, QueueMetricsBase } from "./types";

type AssertFalse<T extends false> = T;
type IsAssignable<T, U> = [T] extends [U] ? true : false;

// @ts-expect-error QueueMetricsBase only contains fields shared by every model.
export type QueueMetricsBaseRejectsS = QueueMetricsBase["s"];

type MmInfinityWithCa2 = {
  modelKind: "mminf";
  lambda: number;
  mu: number;
  a: number;
  P0: number;
  Pwait: 0;
  Lq: 0;
  Wq: 0;
  W: number;
  L: number;
  s: null;
  rho: null;
  Pbusy: null;
  serviceScv: 1;
  serviceVariance: number;
  serviceSecondMoment: number;
  ca2: number;
};

export type MmInfinityRejectsCa2 = AssertFalse<
  IsAssignable<MmInfinityWithCa2, MmInfinityMetrics>
>;
