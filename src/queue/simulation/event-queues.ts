import {
  QUEUE_COMPACTION_MAX_SKIPPED_HEAD,
  QUEUE_COMPACTION_MIN_LIVE_RATIO,
  QUEUE_COMPACTION_SMALL_BACKING_LENGTH,
} from "./constants";
import type {
  AbandonmentEntry,
  FiniteCompletionEntry,
  InternalCustomer,
  InternalServer,
} from "./internal-types";

export function createServers(serverCount: number): InternalServer[] {
  return Array.from({ length: serverCount }, (_, index) => ({
    id: index + 1,
    customer: null,
    serviceStartedAt: null,
    serviceEndsAt: null,
  }));
}

export function createIdleServerIndexes(serverCount: number): number[] {
  // Idle indexes are a stack: descending initialization makes the first pop()
  // assign server 0, and completed servers are pushed back to preserve LIFO reuse.
  return Array.from(
    { length: serverCount },
    (_, index) => serverCount - index - 1,
  );
}

function compareCompletionEntries(
  left: FiniteCompletionEntry,
  right: FiniteCompletionEntry,
): number {
  return left.time - right.time || left.serverIndex - right.serverIndex;
}

function compareAbandonmentEntries(
  left: AbandonmentEntry,
  right: AbandonmentEntry,
): number {
  return left.time - right.time || left.customerId - right.customerId;
}

function compareActiveServiceCustomers(
  left: InternalCustomer,
  right: InternalCustomer,
): number {
  return serviceEndTime(left) - serviceEndTime(right) || left.id - right.id;
}

function completionEntryIsCurrent(
  entry: FiniteCompletionEntry,
  servers: readonly InternalServer[],
): boolean {
  return servers[entry.serverIndex]?.serviceEndsAt === entry.time;
}

function serviceEndTime(customer: InternalCustomer | undefined): number {
  return customer?.serviceEndsAt ?? Infinity;
}

export class CustomerQueue {
  private items: Array<InternalCustomer | undefined> = [];
  private byId = new Map<number, number>();
  private head = 0;
  private count = 0;

  get length(): number {
    return this.count;
  }

  enqueue(customer: InternalCustomer): void {
    this.byId.set(customer.id, this.items.length);
    this.items.push(customer);
    this.count += 1;
  }

  dequeue(): InternalCustomer | null {
    if (this.count === 0) {
      return null;
    }

    while (this.head < this.items.length) {
      const customer = this.items[this.head] ?? null;
      this.items[this.head] = undefined;
      this.head += 1;

      if (!customer) {
        continue;
      }

      this.byId.delete(customer.id);
      this.count -= 1;
      this.compactIfSparse();
      return customer;
    }

    this.clear();
    return null;
  }

  removeById(customerId: number): InternalCustomer | null {
    const index = this.byId.get(customerId);

    if (index === undefined) {
      return null;
    }

    const customer = this.items[index] ?? null;

    if (!customer) {
      this.byId.delete(customerId);
      return null;
    }

    this.items[index] = undefined;
    this.byId.delete(customerId);
    this.count -= 1;
    this.compactIfSparse();

    return customer;
  }

  hasAbandonment(customerId: number, time: number): boolean {
    const index = this.byId.get(customerId);
    const customer = index === undefined ? undefined : this.items[index];

    return (
      customer !== undefined &&
      customer.abandonAt === time &&
      customer.abandonedAt === null
    );
  }

  private compactIfSparse(): void {
    if (this.count === 0) {
      this.clear();
      return;
    }

    if (
      this.head <= QUEUE_COMPACTION_MAX_SKIPPED_HEAD &&
      (this.items.length <= QUEUE_COMPACTION_SMALL_BACKING_LENGTH ||
        this.count / this.items.length >= QUEUE_COMPACTION_MIN_LIVE_RATIO)
    ) {
      return;
    }

    const compacted: InternalCustomer[] = [];
    this.byId.clear();

    for (let index = this.head; index < this.items.length; index += 1) {
      const customer = this.items[index];

      if (!customer) {
        continue;
      }

      this.byId.set(customer.id, compacted.length);
      compacted.push(customer);
    }

    this.items = compacted;
    this.head = 0;
    this.count = compacted.length;
  }

  private clear(): void {
    this.items = [];
    this.byId.clear();
    this.head = 0;
    this.count = 0;
  }

  snapshot(limit: number): InternalCustomer[] {
    const visibleCount = Math.min(this.count, Math.max(0, limit));
    const customers: InternalCustomer[] = [];

    for (
      let index = this.head;
      index < this.items.length && customers.length < visibleCount;
      index += 1
    ) {
      const customer = this.items[index];

      if (customer) {
        customers.push(customer);
      }
    }

    return customers;
  }
}

export class FiniteCompletionHeap {
  private readonly heap = new MinHeap<FiniteCompletionEntry>(
    compareCompletionEntries,
  );

  push(entry: FiniteCompletionEntry): void {
    this.heap.push(entry);
  }

  peek(servers: readonly InternalServer[]): FiniteCompletionEntry | null {
    while (true) {
      const entry = this.heap.peek();

      if (!entry) {
        return null;
      }

      if (completionEntryIsCurrent(entry, servers)) {
        return entry;
      }

      this.heap.pop();
    }
  }

  discard(serverIndex: number, time: number): void {
    const entry = this.heap.peek();

    if (entry?.serverIndex === serverIndex && entry.time === time) {
      this.heap.pop();
    }
  }
}

export class AbandonmentHeap {
  private readonly heap = new MinHeap<AbandonmentEntry>(
    compareAbandonmentEntries,
  );

  push(entry: AbandonmentEntry): void {
    this.heap.push(entry);
  }

  peek(queue: CustomerQueue): AbandonmentEntry | null {
    while (true) {
      const entry = this.heap.peek();

      if (!entry) {
        return null;
      }

      if (queue.hasAbandonment(entry.customerId, entry.time)) {
        return entry;
      }

      this.heap.pop();
    }
  }

  discard(customerId: number, time: number): void {
    const entry = this.heap.peek();

    if (entry?.customerId === customerId && entry.time === time) {
      this.heap.pop();
    }
  }
}

class MinHeap<T> {
  private items: T[] = [];

  constructor(private readonly compare: (left: T, right: T) => number) {}

  get length(): number {
    return this.items.length;
  }

  push(item: T): void {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  peek(): T | null {
    return this.items[0] ?? null;
  }

  pop(): T | null {
    if (this.items.length === 0) {
      return null;
    }

    const first = this.items[0] ?? null;
    const last = this.items.pop();

    if (this.items.length > 0 && last !== undefined) {
      this.items[0] = last;
      this.bubbleDown(0);
    }

    return first;
  }

  snapshot(limit: number): T[] {
    return this.items.slice(0, Math.max(0, limit));
  }

  sortedSnapshot(limit: number): T[] {
    const visibleCount = Math.min(this.items.length, Math.max(0, limit));

    if (visibleCount === 0) {
      return [];
    }

    const copy = new MinHeap<T>(this.compare);

    for (const item of this.items) {
      copy.push(item);
    }

    const snapshot: T[] = [];

    while (snapshot.length < visibleCount) {
      const item = copy.pop();

      if (item === null) {
        break;
      }

      snapshot.push(item);
    }

    return snapshot;
  }

  private bubbleUp(index: number): void {
    let current = index;

    while (current > 0) {
      const parent = Math.floor((current - 1) / 2);

      if (this.compareAt(current, parent) >= 0) {
        return;
      }

      this.swap(current, parent);
      current = parent;
    }
  }

  private bubbleDown(index: number): void {
    let current = index;

    while (true) {
      const left = current * 2 + 1;
      const right = left + 1;
      let smallest = current;

      if (left < this.items.length && this.compareAt(left, smallest) < 0) {
        smallest = left;
      }

      if (right < this.items.length && this.compareAt(right, smallest) < 0) {
        smallest = right;
      }

      if (smallest === current) {
        return;
      }

      this.swap(current, smallest);
      current = smallest;
    }
  }

  private compareAt(left: number, right: number): number {
    const leftValue = this.items[left];
    const rightValue = this.items[right];

    if (leftValue === undefined || rightValue === undefined) {
      return 0;
    }

    return this.compare(leftValue, rightValue);
  }

  private swap(left: number, right: number): void {
    const leftValue = this.items[left];
    const rightValue = this.items[right];

    if (leftValue === undefined || rightValue === undefined) {
      return;
    }

    this.items[left] = rightValue;
    this.items[right] = leftValue;
  }
}

export class ActiveServiceHeap {
  private readonly heap = new MinHeap<InternalCustomer>(
    compareActiveServiceCustomers,
  );

  get length(): number {
    return this.heap.length;
  }

  push(customer: InternalCustomer): void {
    this.heap.push(customer);
  }

  peek(): InternalCustomer | null {
    return this.heap.peek();
  }

  pop(): InternalCustomer | null {
    return this.heap.pop();
  }

  snapshot(limit: number): InternalCustomer[] {
    return this.heap.sortedSnapshot(limit);
  }
}
