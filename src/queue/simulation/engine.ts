import { QueueStatsCollector, type QueueStatsConfig } from "../stats";
import {
  AbandonmentHeap,
  ActiveServiceHeap,
  CustomerQueue,
  createIdleServerIndexes,
  createServers,
  FiniteCompletionHeap,
} from "./event-queues";
import type {
  InternalCustomer,
  InternalServer,
  NextCompletionEvent,
  NextSimulationEvent,
} from "./internal-types";
import { isErlangAValidatedParams, isMmInfinityValidatedParams } from "./model";
import {
  createSeededRandom,
  createUnseededRandom,
  sampleDurationWithScv,
  sampleExponential,
  sampleServiceDuration,
} from "./random";
import {
  buildAccessibleSnapshot,
  requiredTime,
  toCustomerSnapshot,
} from "./snapshots";
import type {
  NormalizedSimulationOptions,
  QueueSimulationOptions,
  QueueSimulationResetOptions,
  ServerState,
  SimulationAdvanceInfo,
  SimulationModelParams,
  SimulationParams,
  SimulationSnapshot,
  SimulationVisualSnapshot,
  ValidatedFiniteSimulationParams,
  ValidatedSimulationParams,
} from "./types";
import { SimulationParameterError } from "./types";
import {
  normalizeSimulationOptions,
  validateSimulationParams,
} from "./validation";

export class QueueSimulation {
  readonly stats: QueueStatsCollector | null;

  private params!: ValidatedSimulationParams;
  private readonly options: NormalizedSimulationOptions;
  private random: () => number = Math.random;
  private now = 0;
  private nextArrivalAt = 0;
  private servers: InternalServer[] = [];
  private idleServerIndexes: number[] = [];
  private completionSchedule = new FiniteCompletionHeap();
  private activeServices = new ActiveServiceHeap();
  private queue = new CustomerQueue();
  private abandonmentSchedule = new AbandonmentHeap();
  private nextCustomerId = 1;
  private busyServerCount = 0;
  private arrivals = 0;
  private acceptedArrivals = 0;
  private blockedArrivals = 0;
  private completions = 0;
  private abandonments = 0;
  private lastAdvance: SimulationAdvanceInfo = {
    requestedDeltaTime: 0,
    targetTime: 0,
    advancedDeltaTime: 0,
    remainingDeltaTime: 0,
    processedEvents: 0,
    eventCapReached: false,
  };

  constructor(params: SimulationParams, options: QueueSimulationOptions = {}) {
    this.options = normalizeSimulationOptions(options);
    this.stats = this.options.collectStats ? new QueueStatsCollector() : null;
    this.reset(params, this.initialResetOptions());
  }

  reset(
    params: SimulationParams = this.params,
    options: QueueSimulationResetOptions = {},
  ): SimulationSnapshot {
    const validation = validateSimulationParams(params);

    if (validation.status !== "ok") {
      throw new SimulationParameterError(validation.errors);
    }

    this.params = validation.params;
    this.random =
      validation.params.seed === undefined
        ? createUnseededRandom()
        : createSeededRandom(validation.params.seed);
    this.now = 0;
    this.nextArrivalAt = this.sampleInterarrivalDuration();
    if (isMmInfinityValidatedParams(this.params)) {
      this.servers = [];
      this.idleServerIndexes = [];
    } else {
      this.servers = createServers(this.params.s);
      this.idleServerIndexes = createIdleServerIndexes(this.params.s);
    }

    this.completionSchedule = new FiniteCompletionHeap();
    this.activeServices = new ActiveServiceHeap();
    this.queue = new CustomerQueue();
    this.abandonmentSchedule = new AbandonmentHeap();
    this.nextCustomerId = 1;
    this.busyServerCount = 0;
    this.arrivals = 0;
    this.acceptedArrivals = 0;
    this.blockedArrivals = 0;
    this.completions = 0;
    this.abandonments = 0;
    this.lastAdvance = {
      requestedDeltaTime: 0,
      targetTime: 0,
      advancedDeltaTime: 0,
      remainingDeltaTime: 0,
      processedEvents: 0,
      eventCapReached: false,
    };

    const shouldCollectStats =
      options.collectStats ?? this.options.collectStats;

    if (this.stats) {
      if (shouldCollectStats) {
        this.stats.reset(this.statsConfig(options));
      } else {
        this.stats.deactivate();
      }
    }

    return this.snapshot();
  }

  advance(deltaTime: number): SimulationSnapshot {
    this.advanceTime(deltaTime);

    return this.snapshot();
  }

  advanceTime(deltaTime: number): Readonly<SimulationAdvanceInfo> {
    const startTime = this.now;
    const requestedDeltaTime =
      Number.isFinite(deltaTime) && deltaTime > 0 ? deltaTime : 0;
    const targetTime = startTime + requestedDeltaTime;
    let processedEvents = 0;
    let eventCapReached = false;

    while (true) {
      const nextEvent = this.nextEvent();

      if (nextEvent.time > targetTime) {
        break;
      }

      if (processedEvents >= this.options.maxEventsPerAdvance) {
        eventCapReached = true;
        break;
      }

      this.processEvent(nextEvent);
      processedEvents += 1;
    }

    if (!eventCapReached) {
      this.now = targetTime;
      this.stats?.observeStateUntilCounts(
        this.now,
        this.currentSystemCount(),
        this.currentQueueLength(),
        this.currentBusyServers(),
      );
    }

    const advancedDeltaTime = eventCapReached
      ? Math.max(0, this.now - startTime)
      : requestedDeltaTime;
    const remainingDeltaTime = eventCapReached
      ? Math.max(0, targetTime - this.now)
      : 0;

    this.lastAdvance = {
      requestedDeltaTime,
      targetTime,
      advancedDeltaTime,
      remainingDeltaTime,
      processedEvents,
      eventCapReached,
    };

    return this.lastAdvance;
  }

  snapshot(): SimulationSnapshot {
    const visual = this.visualSnapshot();
    const stats = this.stats?.snapshot() ?? null;

    return {
      ...visual,
      stats,
      accessible: buildAccessibleSnapshot({
        now: visual.now,
        queueLength: visual.queueLength,
        visibleQueueLength: visual.queue.length,
        queueOverflow: visual.queueOverflow,
        busyServers: visual.busyServers,
        totalServers: visual.serverCount,
        serverCapacity: visual.serverCapacity,
        arrivals: visual.arrivals,
        acceptedArrivals: visual.acceptedArrivals,
        blockedArrivals: visual.blockedArrivals,
        completions: visual.completions,
        abandonments: visual.abandonments,
        eventCapReached: visual.lastAdvance.eventCapReached,
        remainingDeltaTime: visual.lastAdvance.remainingDeltaTime,
      }),
    };
  }

  visualSnapshot(): SimulationVisualSnapshot {
    const isMmInfinity = isMmInfinityValidatedParams(this.params);
    const queue = isMmInfinity
      ? []
      : this.queue
          .snapshot(this.options.maxSnapshotQueueItems)
          .map((customer, index) => toCustomerSnapshot(customer, index + 1));
    const queueLength = isMmInfinity ? 0 : this.queue.length;
    const queueOverflow = Math.max(0, queueLength - queue.length);
    const servers = isMmInfinity
      ? this.activeServices
          .snapshot(this.options.maxSnapshotServers)
          .map((customer, index) => this.activeServiceSnapshot(customer, index))
      : this.servers
          .slice(0, this.options.maxSnapshotServers)
          .map((server) => this.serverSnapshot(server));
    const busyServers = isMmInfinity
      ? this.activeServices.length
      : this.busyServerCount;
    const idleServers = isMmInfinity
      ? null
      : (this.params as ValidatedFiniteSimulationParams).s - busyServers;
    const serverCount = isMmInfinity
      ? null
      : (this.params as ValidatedFiniteSimulationParams).s;

    return {
      modelKind: this.params.modelKind,
      now: this.now,
      params: this.modelParams(),
      queue,
      queuePreview: {
        customers: queue,
        totalLength: queueLength,
        overflow: queueOverflow,
        maxVisible: this.options.maxSnapshotQueueItems,
      },
      queueLength,
      queueOverflow,
      maxVisibleQueue: this.options.maxSnapshotQueueItems,
      servers,
      busyServers,
      idleServers,
      serverCount,
      serverCapacity: isMmInfinity ? "infinite" : "finite",
      nextArrivalAt: this.nextArrivalAt,
      arrivals: this.arrivals,
      acceptedArrivals: this.acceptedArrivals,
      blockedArrivals: this.blockedArrivals,
      completions: this.completions,
      abandonments: this.abandonments,
      departures: this.completions + this.abandonments,
      nextCustomerId: this.nextCustomerId,
      lastAdvance: { ...this.lastAdvance },
    };
  }

  private sampleInterarrivalDuration(): number {
    if (
      !isMmInfinityValidatedParams(this.params) &&
      this.params.modelKind === "ggs"
    ) {
      return sampleDurationWithScv(
        this.params.lambda,
        this.params.ca2 ?? 1,
        this.random,
      );
    }

    return sampleExponential(this.params.lambda, this.random);
  }

  private processEvent(event: NextSimulationEvent): void {
    if (event.type === "arrival") {
      this.processArrival(event.time);
    } else if (event.type === "abandonment") {
      this.processAbandonment(event.time, event.customerId);
    } else if (event.modelKind === "mminf") {
      this.processMmInfinityCompletion(event.time);
    } else {
      this.processCompletion(event.time, event.serverIndex);
    }
  }

  private processArrival(time: number): void {
    this.now = time;

    if (isMmInfinityValidatedParams(this.params)) {
      this.processMmInfinityArrival();
      return;
    }

    const queueLengthBeforeArrival = this.queue.length;
    const busyServersBeforeArrival = this.busyServerCount;
    const systemCountBeforeArrival =
      busyServersBeforeArrival + queueLengthBeforeArrival;
    this.arrivals += 1;

    if (
      this.params.K !== undefined &&
      systemCountBeforeArrival >= this.params.K
    ) {
      this.stats?.recordBlockedArrival(
        this.now,
        systemCountBeforeArrival,
        queueLengthBeforeArrival,
        busyServersBeforeArrival,
      );
      this.blockedArrivals += 1;
      this.nextArrivalAt = this.now + this.sampleInterarrivalDuration();
      return;
    }

    const idleServerIndex = this.findIdleServerIndex();
    const waitedOnArrival = idleServerIndex === -1;
    const customer: InternalCustomer = {
      id: this.nextCustomerId,
      arrivedAt: this.now,
      serviceStartedAt: null,
      serviceEndsAt: null,
      abandonAt:
        waitedOnArrival && isErlangAValidatedParams(this.params)
          ? this.now + sampleExponential(this.params.theta, this.random)
          : null,
      abandonedAt: null,
      waitedOnArrival,
    };
    this.stats?.recordAcceptedArrival(
      this.now,
      systemCountBeforeArrival,
      queueLengthBeforeArrival,
      busyServersBeforeArrival,
      waitedOnArrival,
    );
    this.acceptedArrivals += 1;
    this.nextCustomerId += 1;

    if (waitedOnArrival) {
      this.queue.enqueue(customer);

      if (typeof customer.abandonAt === "number") {
        this.abandonmentSchedule.push({
          customerId: customer.id,
          time: customer.abandonAt,
        });
      }
    } else {
      this.startService(customer, idleServerIndex);
    }

    this.nextArrivalAt = this.now + this.sampleInterarrivalDuration();
  }

  private processMmInfinityArrival(): void {
    const activeServiceCountBeforeArrival = this.activeServices.length;
    const serviceStartedAt = this.now;
    const serviceDuration = sampleServiceDuration(
      this.params.mu,
      { kind: "exponential" },
      this.random,
    );
    const serviceEndsAt = serviceStartedAt + serviceDuration;
    const customer: InternalCustomer = {
      id: this.nextCustomerId,
      arrivedAt: this.now,
      serviceStartedAt,
      serviceEndsAt,
      abandonAt: null,
      abandonedAt: null,
      waitedOnArrival: false,
    };

    this.arrivals += 1;
    this.stats?.recordAcceptedArrival(
      this.now,
      activeServiceCountBeforeArrival,
      0,
      activeServiceCountBeforeArrival,
      false,
    );
    this.acceptedArrivals += 1;
    this.nextCustomerId += 1;
    this.activeServices.push(customer);
    this.stats?.recordServiceStart(
      this.now,
      this.activeServices.length,
      0,
      this.activeServices.length,
    );
    this.nextArrivalAt = this.now + this.sampleInterarrivalDuration();
  }

  private processMmInfinityCompletion(time: number): void {
    this.now = time;

    const customer = this.activeServices.peek();

    if (!customer || customer.serviceEndsAt === null) {
      return;
    }

    const serviceStartedAt = requiredTime(customer.serviceStartedAt);
    const serviceEndsAt = requiredTime(customer.serviceEndsAt);

    this.stats?.recordServiceCompletion(
      this.now,
      this.activeServices.length,
      0,
      this.activeServices.length,
      customer.arrivedAt,
      serviceStartedAt,
      serviceEndsAt,
      serviceEndsAt - serviceStartedAt,
    );
    this.activeServices.pop();
    this.completions += 1;
  }

  private processCompletion(time: number, serverIndex: number): void {
    this.now = time;
    this.completionSchedule.discard(serverIndex, time);

    const server = this.servers[serverIndex];

    if (!server?.customer || server.serviceEndsAt === null) {
      return;
    }

    const customer = server.customer;
    const serviceStartedAt = requiredTime(customer.serviceStartedAt);
    const serviceEndsAt = requiredTime(customer.serviceEndsAt);

    this.stats?.recordServiceCompletion(
      this.now,
      this.busyServerCount + this.queue.length,
      this.queue.length,
      this.busyServerCount,
      customer.arrivedAt,
      serviceStartedAt,
      serviceEndsAt,
      serviceEndsAt - serviceStartedAt,
    );
    this.completions += 1;
    server.customer = null;
    server.serviceStartedAt = null;
    server.serviceEndsAt = null;
    this.busyServerCount = Math.max(0, this.busyServerCount - 1);

    const nextCustomer = this.queue.dequeue();

    if (nextCustomer) {
      this.startService(nextCustomer, serverIndex);
    } else {
      this.idleServerIndexes.push(serverIndex);
    }
  }

  private processAbandonment(time: number, customerId: number): void {
    this.now = time;
    this.abandonmentSchedule.discard(customerId, time);

    if (isMmInfinityValidatedParams(this.params)) {
      return;
    }

    const queueLengthBeforeAbandonment = this.queue.length;
    const busyServersBeforeAbandonment = this.busyServerCount;
    const systemCountBeforeAbandonment =
      busyServersBeforeAbandonment + queueLengthBeforeAbandonment;
    const customer = this.queue.removeById(customerId);

    if (!customer || customer.abandonAt === null) {
      return;
    }

    customer.abandonedAt = this.now;
    customer.abandonAt = null;
    this.stats?.recordAbandonment(
      this.now,
      systemCountBeforeAbandonment,
      queueLengthBeforeAbandonment,
      busyServersBeforeAbandonment,
      customer.arrivedAt,
      this.now,
    );
    this.abandonments += 1;
  }

  private startService(customer: InternalCustomer, serverIndex: number): void {
    const server = this.servers[serverIndex];

    if (!server) {
      return;
    }

    const params = this.params as ValidatedFiniteSimulationParams;
    const serviceStartedAt = this.now;
    const serviceDuration = sampleServiceDuration(
      params.mu,
      params.serviceTime,
      this.random,
    );
    const serviceEndsAt = serviceStartedAt + serviceDuration;
    const wasIdle = server.customer === null;

    customer.serviceStartedAt = serviceStartedAt;
    customer.serviceEndsAt = serviceEndsAt;
    customer.abandonAt = null;
    server.customer = customer;
    server.serviceStartedAt = serviceStartedAt;
    server.serviceEndsAt = serviceEndsAt;

    if (wasIdle) {
      this.busyServerCount += 1;
    }

    this.completionSchedule.push({
      serverIndex,
      time: serviceEndsAt,
    });

    this.stats?.recordServiceStart(
      this.now,
      this.busyServerCount + this.queue.length,
      this.queue.length,
      this.busyServerCount,
    );
  }

  private nextEvent(): NextSimulationEvent {
    const nextCompletion = this.nextCompletion();
    const nextAbandonment = this.nextAbandonment();

    if (
      nextCompletion &&
      nextCompletion.time <= this.nextArrivalAt &&
      (nextAbandonment === null || nextCompletion.time <= nextAbandonment.time)
    ) {
      return nextCompletion;
    }

    if (nextAbandonment && nextAbandonment.time <= this.nextArrivalAt) {
      return nextAbandonment;
    }

    return { type: "arrival", time: this.nextArrivalAt };
  }

  private nextAbandonment(): NextSimulationEvent | null {
    if (!isErlangAValidatedParams(this.params)) {
      return null;
    }

    const nextAbandonment = this.abandonmentSchedule.peek(this.queue);

    return nextAbandonment
      ? {
          type: "abandonment",
          time: nextAbandonment.time,
          customerId: nextAbandonment.customerId,
        }
      : null;
  }

  private nextCompletion(): NextCompletionEvent | null {
    if (isMmInfinityValidatedParams(this.params)) {
      const customer = this.activeServices.peek();
      const serviceEndsAt = customer?.serviceEndsAt;

      return typeof serviceEndsAt === "number"
        ? { type: "completion", modelKind: "mminf", time: serviceEndsAt }
        : null;
    }

    const next = this.completionSchedule.peek(this.servers);

    return next
      ? {
          type: "completion",
          modelKind: "finite",
          time: next.time,
          serverIndex: next.serverIndex,
        }
      : null;
  }

  private findIdleServerIndex(): number {
    while (this.idleServerIndexes.length > 0) {
      const serverIndex = this.idleServerIndexes.pop();

      if (
        serverIndex !== undefined &&
        this.servers[serverIndex]?.customer === null
      ) {
        return serverIndex;
      }
    }

    return -1;
  }

  private currentSystemCount(): number {
    if (isMmInfinityValidatedParams(this.params)) {
      return this.activeServices.length;
    }

    return this.busyServerCount + this.queue.length;
  }

  private currentQueueLength(): number {
    return isMmInfinityValidatedParams(this.params) ? 0 : this.queue.length;
  }

  private currentBusyServers(): number {
    return isMmInfinityValidatedParams(this.params)
      ? this.activeServices.length
      : this.busyServerCount;
  }

  private serverSnapshot(server: InternalServer): ServerState {
    return {
      id: server.id,
      status: server.customer ? "busy" : "idle",
      customerId: server.customer?.id ?? null,
      customer: server.customer
        ? toCustomerSnapshot(server.customer, null)
        : null,
      serviceStartedAt: server.serviceStartedAt,
      serviceEndsAt: server.serviceEndsAt,
      timeRemaining:
        server.serviceEndsAt === null
          ? null
          : Math.max(0, server.serviceEndsAt - this.now),
    };
  }

  private activeServiceSnapshot(
    customer: InternalCustomer,
    index: number,
  ): ServerState {
    return {
      id: index + 1,
      status: "busy",
      customerId: customer.id,
      customer: toCustomerSnapshot(customer, null),
      serviceStartedAt: customer.serviceStartedAt,
      serviceEndsAt: customer.serviceEndsAt,
      timeRemaining:
        customer.serviceEndsAt === null
          ? null
          : Math.max(0, customer.serviceEndsAt - this.now),
    };
  }

  private modelParams(): SimulationModelParams {
    if (isMmInfinityValidatedParams(this.params)) {
      return {
        modelKind: "mminf",
        lambda: this.params.lambda,
        mu: this.params.mu,
      };
    }

    const params: SimulationModelParams = {
      modelKind: this.params.modelKind,
      lambda: this.params.lambda,
      mu: this.params.mu,
      s: this.params.s,
    };

    if (this.params.K !== undefined) {
      params.K = this.params.K;
    }

    if (this.params.modelKind === "erlang-a") {
      params.theta = this.params.theta;
    }

    if (this.params.serviceScv !== undefined) {
      params.serviceScv = this.params.serviceScv;
    }

    if (this.params.modelKind === "ggs") {
      params.ca2 = this.params.ca2 ?? 1;
      params.cs2 = this.params.cs2 ?? 1;
    }

    return params;
  }

  private statsConfig(options: QueueSimulationResetOptions): QueueStatsConfig {
    const config: QueueStatsConfig = {
      params: this.modelParams(),
    };
    const theoreticalMetrics =
      options.theoreticalMetrics ?? this.options.theoreticalMetrics;
    const statsThresholds =
      options.statsThresholds ?? this.options.statsThresholds;

    if (theoreticalMetrics) {
      config.theoretical = theoreticalMetrics;
    }

    if (statsThresholds) {
      config.thresholds = statsThresholds;
    }

    return config;
  }

  private initialResetOptions(): QueueSimulationResetOptions {
    const options: QueueSimulationResetOptions = {};

    if (this.options.theoreticalMetrics) {
      options.theoreticalMetrics = this.options.theoreticalMetrics;
    }

    if (this.options.statsThresholds) {
      options.statsThresholds = this.options.statsThresholds;
    }

    return options;
  }
}
