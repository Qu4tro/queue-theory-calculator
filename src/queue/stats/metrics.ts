import type {
  FiniteQueueStatsParams,
  QueueStatsCounters,
  QueueStatsMetrics,
  QueueStatsParams,
} from "./types";
import { isErlangAStatsParams, isMmInfinityStatsParams } from "./types";

export function calculateQueueStatsMetrics(
  params: QueueStatsParams | null,
  counters: QueueStatsCounters,
  sampleElapsed: number,
): QueueStatsMetrics {
  if (params === null) {
    return emptyMetrics();
  }

  const isMmInfinity = isMmInfinityStatsParams(params);
  const finiteParams = isMmInfinity ? null : (params as FiniteQueueStatsParams);
  const isErlangA = finiteParams !== null && isErlangAStatsParams(finiteParams);
  const elapsedMetric = (value: number) =>
    sampleElapsed > 0 ? value / sampleElapsed : null;

  const lambda = elapsedMetric(counters.attemptedArrivalsObserved);
  const lambdaEffective = elapsedMetric(counters.acceptedArrivalsObserved);
  const L = elapsedMetric(counters.areaSystemCount);
  const Lq = elapsedMetric(counters.areaQueueLength);
  const busyServerShare = elapsedMetric(counters.areaBusyServers);
  const Ls = isMmInfinity ? null : busyServerShare;
  const rho =
    busyServerShare === null || finiteParams === null
      ? null
      : busyServerShare / finiteParams.s;
  const P0 = elapsedMetric(counters.emptySystemTime);
  const departedCustomers = isErlangA
    ? counters.departedCustomers
    : counters.completedCustomers;
  const totalSystemTime = isErlangA
    ? counters.totalTimeToExit
    : counters.totalSystemTime;
  const totalQueueWaitTime = isErlangA
    ? counters.totalQueueTimeToExit
    : counters.totalQueueWaitTime;
  const W = departedCustomers > 0 ? totalSystemTime / departedCustomers : null;
  const Wq =
    departedCustomers > 0 ? totalQueueWaitTime / departedCustomers : null;
  const mu =
    counters.totalCompletedServiceTime > 0
      ? counters.completedServices / counters.totalCompletedServiceTime
      : null;
  const serviceScv = scvFromRunningMoments(
    counters.completedServices,
    counters.completedServiceTimeMean,
    counters.completedServiceTimeM2,
  );
  const ca2 = scvFromRunningMoments(
    counters.interarrivalDurationsObserved,
    counters.interarrivalTimeMean,
    counters.interarrivalTimeM2,
  );
  const cs2 = serviceScv;
  const a = lambda !== null && mu !== null && mu > 0 ? lambda / mu : null;
  const Pwait =
    counters.acceptedArrivalsObserved > 0
      ? counters.arrivalsThatWaited / counters.acceptedArrivalsObserved
      : null;
  const Pblock =
    counters.attemptedArrivalsObserved > 0
      ? counters.blockedArrivalsObserved / counters.attemptedArrivalsObserved
      : null;
  const throughput =
    counters.completedCustomers > 0 && sampleElapsed > 0
      ? counters.completedCustomers / sampleElapsed
      : null;
  const abandonRate =
    isErlangA && sampleElapsed > 0
      ? counters.abandonmentsObserved / sampleElapsed
      : null;
  const theta =
    isErlangA && counters.areaQueueLength > 0
      ? counters.abandonmentsObserved / counters.areaQueueLength
      : null;
  const offeredRho =
    finiteParams !== null && a !== null ? a / finiteParams.s : null;
  const Pabandon =
    isErlangA && counters.attemptedArrivalsObserved > 0
      ? counters.abandonmentsObserved / counters.attemptedArrivalsObserved
      : null;
  const Pserved =
    isErlangA && counters.attemptedArrivalsObserved > 0
      ? counters.completedCustomers / counters.attemptedArrivalsObserved
      : null;

  return {
    lambda,
    mu,
    s: finiteParams === null ? null : finiteParams.s,
    K: finiteParams === null ? null : (finiteParams.K ?? null),
    theta,
    serviceScv,
    ca2,
    cs2,
    a,
    offeredRho,
    lambdaEffective: isMmInfinity ? null : lambdaEffective,
    Ls,
    L,
    Lq: isMmInfinity ? 0 : Lq,
    W,
    Wq: isMmInfinity ? 0 : Wq,
    rho,
    P0,
    Pbusy: rho,
    Pwait: isMmInfinity ? 0 : Pwait,
    Pblock: isMmInfinity ? null : Pblock,
    abandonRate,
    throughput,
    Pabandon,
    Pserved,
  };
}

export function createEmptyCounters(): QueueStatsCounters {
  return {
    arrivalsObserved: 0,
    attemptedArrivalsObserved: 0,
    acceptedArrivalsObserved: 0,
    blockedArrivalsObserved: 0,
    arrivalsThatWaited: 0,
    servicesStarted: 0,
    completedCustomers: 0,
    abandonedCustomers: 0,
    abandonmentsObserved: 0,
    departedCustomers: 0,
    completedServices: 0,
    totalSystemTime: 0,
    totalQueueWaitTime: 0,
    totalTimeToExit: 0,
    totalQueueTimeToExit: 0,
    totalCompletedServiceTime: 0,
    totalCompletedServiceTimeSquared: 0,
    completedServiceTimeMean: 0,
    completedServiceTimeM2: 0,
    interarrivalDurationsObserved: 0,
    totalInterarrivalTime: 0,
    totalInterarrivalTimeSquared: 0,
    interarrivalTimeMean: 0,
    interarrivalTimeM2: 0,
    areaSystemCount: 0,
    areaQueueLength: 0,
    areaBusyServers: 0,
    emptySystemTime: 0,
  };
}

function emptyMetrics(): QueueStatsMetrics {
  return {
    lambda: null,
    mu: null,
    s: null,
    K: null,
    theta: null,
    serviceScv: null,
    ca2: null,
    cs2: null,
    a: null,
    offeredRho: null,
    lambdaEffective: null,
    Ls: null,
    L: null,
    Lq: null,
    W: null,
    Wq: null,
    rho: null,
    P0: null,
    Pbusy: null,
    Pwait: null,
    Pblock: null,
    abandonRate: null,
    throughput: null,
    Pabandon: null,
    Pserved: null,
  };
}

export function nextRunningMoments(
  count: number,
  previousMean: number,
  previousM2: number,
  value: number,
): { mean: number; m2: number } {
  const delta = value - previousMean;
  const mean = previousMean + delta / count;
  const deltaFromMean = value - mean;

  return {
    mean,
    m2: previousM2 + delta * deltaFromMean,
  };
}

function scvFromRunningMoments(
  count: number,
  mean: number,
  m2: number,
): number | null {
  if (count < 2 || mean <= 0) {
    return null;
  }

  const variance = Math.max(0, m2 / (count - 1));

  return variance / (mean * mean);
}
