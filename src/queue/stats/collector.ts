import { validateQueueStatsConfig } from "./config";
import {
  calculateQueueStatsMetrics,
  createEmptyCounters,
  nextRunningMoments,
} from "./metrics";
import {
  isErlangAStatsParams,
  type QueueStateCounts,
  type QueueStatsComparisonGate,
  type QueueStatsConfig,
  type QueueStatsEvent,
  type QueueStatsMetrics,
  QueueStatsParameterError,
  type QueueStatsParams,
  type QueueStatsSnapshot,
  type QueueStatsStatus,
  type QueueStatsThresholds,
} from "./types";

export class QueueStatsCollector {
  private status: QueueStatsStatus = "inactive";
  private params: QueueStatsParams | null = null;
  private thresholds: QueueStatsThresholds | null = null;
  private warmupEndsAt: number | null = null;
  private sampleStartTime: number | null = null;
  private lastIntegratedTime = 0;
  private lastObservedArrivalTime: number | null = null;
  private counters = createEmptyCounters();

  constructor(config?: QueueStatsConfig) {
    if (config) {
      this.reset(config);
    }
  }

  reset(config: QueueStatsConfig): QueueStatsSnapshot {
    const validation = validateQueueStatsConfig(config);

    if (validation.status !== "ok") {
      throw new QueueStatsParameterError(validation.errors);
    }

    this.params = validation.params;
    this.thresholds = validation.thresholds;
    this.warmupEndsAt = validation.thresholds.warmupDuration;
    this.counters = createEmptyCounters();
    this.lastIntegratedTime = 0;
    this.lastObservedArrivalTime = null;

    if (validation.thresholds.warmupDuration === 0) {
      this.sampleStartTime = 0;
      this.status = "collecting";
    } else {
      this.sampleStartTime = null;
      this.status = "warming-up";
    }

    this.updateStatus();

    return this.snapshot();
  }

  deactivate(): QueueStatsSnapshot {
    this.status = "inactive";
    this.params = null;
    this.thresholds = null;
    this.warmupEndsAt = null;
    this.sampleStartTime = null;
    this.lastIntegratedTime = 0;
    this.lastObservedArrivalTime = null;
    this.counters = createEmptyCounters();

    return this.snapshot();
  }

  observeStateUntil(time: number, state: QueueStateCounts): void {
    this.observeStateUntilCounts(
      time,
      state.systemCount,
      state.queueLength,
      state.busyServers,
    );
  }

  observeStateUntilCounts(
    time: number,
    systemCount: number,
    queueLength: number,
    busyServers: number,
  ): void {
    if (this.status === "inactive" || this.thresholds === null) {
      return;
    }

    const targetTime = normalizeMonotonicTime(time, this.lastIntegratedTime);

    if (this.sampleStartTime === null) {
      if (this.warmupEndsAt === null || targetTime < this.warmupEndsAt) {
        return;
      }

      this.sampleStartTime = this.warmupEndsAt;
      this.lastIntegratedTime = this.warmupEndsAt;
      this.status = "collecting";
    }

    if (targetTime > this.lastIntegratedTime) {
      this.integrateIntervalCounts(
        targetTime,
        systemCount,
        queueLength,
        busyServers,
      );
    }

    this.updateStatus();
  }

  recordEvent(
    event: QueueStatsEvent,
    stateBeforeEvent: QueueStateCounts,
  ): void {
    if (event.type === "arrival") {
      this.recordAcceptedArrival(
        event.time,
        stateBeforeEvent.systemCount,
        stateBeforeEvent.queueLength,
        stateBeforeEvent.busyServers,
        event.waitedOnArrival,
      );
    } else if (event.type === "blocked-arrival") {
      this.recordBlockedArrival(
        event.time,
        stateBeforeEvent.systemCount,
        stateBeforeEvent.queueLength,
        stateBeforeEvent.busyServers,
      );
    } else if (event.type === "service-start") {
      this.recordServiceStart(
        event.time,
        stateBeforeEvent.systemCount,
        stateBeforeEvent.queueLength,
        stateBeforeEvent.busyServers,
      );
    } else if (event.type === "abandonment") {
      this.recordAbandonment(
        event.time,
        stateBeforeEvent.systemCount,
        stateBeforeEvent.queueLength,
        stateBeforeEvent.busyServers,
        event.arrivalTime,
        event.abandonedAt,
      );
    } else {
      this.recordServiceCompletion(
        event.time,
        stateBeforeEvent.systemCount,
        stateBeforeEvent.queueLength,
        stateBeforeEvent.busyServers,
        event.arrivalTime,
        event.serviceStartedAt,
        event.serviceEndsAt,
        event.serviceDuration,
      );
    }
  }

  recordAcceptedArrival(
    time: number,
    systemCount: number,
    queueLength: number,
    busyServers: number,
    waitedOnArrival: boolean,
  ): void {
    this.observeStateUntilCounts(time, systemCount, queueLength, busyServers);

    if (!this.eventIsObservable(time)) {
      return;
    }

    this.recordInterarrival(time);
    this.counters.attemptedArrivalsObserved += 1;
    this.counters.acceptedArrivalsObserved += 1;
    this.counters.arrivalsObserved += 1;

    if (waitedOnArrival) {
      this.counters.arrivalsThatWaited += 1;
    }

    this.updateStatus();
  }

  recordBlockedArrival(
    time: number,
    systemCount: number,
    queueLength: number,
    busyServers: number,
  ): void {
    this.observeStateUntilCounts(time, systemCount, queueLength, busyServers);

    if (!this.eventIsObservable(time)) {
      return;
    }

    this.recordInterarrival(time);
    this.counters.attemptedArrivalsObserved += 1;
    this.counters.blockedArrivalsObserved += 1;
    this.counters.arrivalsObserved += 1;
    this.updateStatus();
  }

  recordServiceStart(
    time: number,
    systemCount: number,
    queueLength: number,
    busyServers: number,
  ): void {
    this.observeStateUntilCounts(time, systemCount, queueLength, busyServers);

    if (!this.eventIsObservable(time)) {
      return;
    }

    this.counters.servicesStarted += 1;
    this.updateStatus();
  }

  recordServiceCompletion(
    time: number,
    systemCount: number,
    queueLength: number,
    busyServers: number,
    arrivalTime: number,
    serviceStartedAt: number,
    serviceEndsAt: number,
    serviceDuration: number,
  ): void {
    this.observeStateUntilCounts(time, systemCount, queueLength, busyServers);

    if (!this.eventIsObservable(time)) {
      return;
    }

    this.recordCompletionValues(
      arrivalTime,
      serviceStartedAt,
      serviceEndsAt,
      serviceDuration,
    );
    this.updateStatus();
  }

  recordAbandonment(
    time: number,
    systemCount: number,
    queueLength: number,
    busyServers: number,
    arrivalTime: number,
    abandonedAt: number,
  ): void {
    this.observeStateUntilCounts(time, systemCount, queueLength, busyServers);

    if (!this.eventIsObservable(time)) {
      return;
    }

    this.recordAbandonmentValues(arrivalTime, abandonedAt);
    this.updateStatus();
  }

  snapshot(): QueueStatsSnapshot {
    const sampleElapsed = this.sampleElapsed();
    const metrics = this.metrics(sampleElapsed);
    const missingComparability = this.missingComparability(sampleElapsed);

    return {
      status: this.status,
      params: this.params ? { ...this.params } : null,
      sampleStartTime: this.sampleStartTime,
      warmupEndsAt: this.warmupEndsAt,
      lastIntegratedTime: this.lastIntegratedTime,
      sampleElapsed,
      thresholds: this.thresholds ? { ...this.thresholds } : null,
      counters: { ...this.counters },
      metrics,
      comparable: this.status === "comparable",
      missingComparability,
    };
  }

  private recordInterarrival(time: number): void {
    if (this.lastObservedArrivalTime !== null) {
      const duration = time - this.lastObservedArrivalTime;

      if (duration >= 0 && Number.isFinite(duration)) {
        const durationCount = this.counters.interarrivalDurationsObserved + 1;
        const durationMoments = nextRunningMoments(
          durationCount,
          this.counters.interarrivalTimeMean,
          this.counters.interarrivalTimeM2,
          duration,
        );

        this.counters.interarrivalDurationsObserved = durationCount;
        this.counters.totalInterarrivalTime += duration;
        this.counters.totalInterarrivalTimeSquared += duration * duration;
        this.counters.interarrivalTimeMean = durationMoments.mean;
        this.counters.interarrivalTimeM2 = durationMoments.m2;
      }
    }

    this.lastObservedArrivalTime = time;
  }

  private recordCompletionValues(
    arrivalTime: number,
    serviceStartedAt: number,
    serviceEndsAt: number,
    serviceDuration: number,
  ): void {
    if (this.sampleStartTime === null) {
      return;
    }

    if (arrivalTime >= this.sampleStartTime) {
      this.counters.completedCustomers += 1;
      this.counters.departedCustomers += 1;
      this.counters.totalSystemTime += serviceEndsAt - arrivalTime;
      this.counters.totalQueueWaitTime += serviceStartedAt - arrivalTime;
      this.counters.totalTimeToExit += serviceEndsAt - arrivalTime;
      this.counters.totalQueueTimeToExit += serviceStartedAt - arrivalTime;
    }

    if (serviceStartedAt >= this.sampleStartTime) {
      const serviceCount = this.counters.completedServices + 1;
      const serviceMoments = nextRunningMoments(
        serviceCount,
        this.counters.completedServiceTimeMean,
        this.counters.completedServiceTimeM2,
        serviceDuration,
      );

      this.counters.completedServices = serviceCount;
      this.counters.totalCompletedServiceTime += serviceDuration;
      this.counters.totalCompletedServiceTimeSquared +=
        serviceDuration * serviceDuration;
      this.counters.completedServiceTimeMean = serviceMoments.mean;
      this.counters.completedServiceTimeM2 = serviceMoments.m2;
    }
  }

  private recordAbandonmentValues(
    arrivalTime: number,
    abandonedAt: number,
  ): void {
    if (this.sampleStartTime === null) {
      return;
    }

    this.counters.abandonmentsObserved += 1;

    if (arrivalTime >= this.sampleStartTime) {
      this.counters.abandonedCustomers += 1;
      this.counters.departedCustomers += 1;
      this.counters.totalTimeToExit += abandonedAt - arrivalTime;
      this.counters.totalQueueTimeToExit += abandonedAt - arrivalTime;
    }
  }

  private eventIsObservable(time: number): boolean {
    return this.sampleStartTime !== null && time >= this.sampleStartTime;
  }

  private integrateIntervalCounts(
    targetTime: number,
    systemCount: number,
    queueLength: number,
    busyServers: number,
  ): void {
    const dt = targetTime - this.lastIntegratedTime;

    this.counters.areaSystemCount += systemCount * dt;
    this.counters.areaQueueLength += queueLength * dt;
    this.counters.areaBusyServers += busyServers * dt;

    if (systemCount === 0) {
      this.counters.emptySystemTime += dt;
    }

    this.lastIntegratedTime = targetTime;
  }

  private updateStatus(): void {
    if (this.status === "inactive" || this.sampleStartTime === null) {
      return;
    }

    this.status = this.hasMissingComparability(this.sampleElapsed())
      ? "collecting"
      : "comparable";
  }

  private hasMissingComparability(sampleElapsed: number): boolean {
    if (this.status === "inactive") {
      return false;
    }

    if (this.sampleStartTime === null) {
      return true;
    }

    if (this.thresholds === null) {
      return false;
    }

    if (sampleElapsed < this.thresholds.minComparisonDuration) {
      return true;
    }

    if (this.counters.arrivalsObserved < this.thresholds.minArrivals) {
      return true;
    }

    const completedGateCount =
      this.params && isErlangAStatsParams(this.params)
        ? this.counters.departedCustomers
        : this.counters.completedCustomers;

    return completedGateCount < this.thresholds.minCompletions;
  }

  private sampleElapsed(): number {
    if (this.sampleStartTime === null) {
      return 0;
    }

    return Math.max(0, this.lastIntegratedTime - this.sampleStartTime);
  }

  private missingComparability(
    sampleElapsed: number,
  ): QueueStatsComparisonGate[] {
    if (this.status === "inactive") {
      return [];
    }

    if (this.sampleStartTime === null) {
      return ["warmup"];
    }

    if (this.thresholds === null) {
      return [];
    }

    const missing: QueueStatsComparisonGate[] = [];

    if (sampleElapsed < this.thresholds.minComparisonDuration) {
      missing.push("sample-duration");
    }

    if (this.counters.arrivalsObserved < this.thresholds.minArrivals) {
      missing.push("arrivals");
    }

    const completedGateCount =
      this.params && isErlangAStatsParams(this.params)
        ? this.counters.departedCustomers
        : this.counters.completedCustomers;

    if (completedGateCount < this.thresholds.minCompletions) {
      missing.push("completions");
    }

    return missing;
  }

  private metrics(sampleElapsed: number): QueueStatsMetrics {
    return calculateQueueStatsMetrics(
      this.params,
      this.counters,
      sampleElapsed,
    );
  }
}

function normalizeMonotonicTime(
  time: number,
  lastIntegratedTime: number,
): number {
  if (!Number.isFinite(time)) {
    return lastIntegratedTime;
  }

  return Math.max(lastIntegratedTime, time);
}
