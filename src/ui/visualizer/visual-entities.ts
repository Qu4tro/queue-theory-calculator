import { clamp } from "../math";
import {
  drawCustomer as drawCustomerPrimitive,
  moveEntityTowardTarget,
} from "./canvas";
import { EXIT_ANIMATION_SECONDS, EXITING_ENTITY_CACHE_BUFFER } from "./style";
import type { Point, VisualEntity } from "./types";

export type VisualEntityLayerOptions = {
  maxVisibleQueueCustomers: number;
  maxDetailedServers: number;
};

export class VisualEntityLayer {
  private readonly entities = new Map<string, VisualEntity>();
  private readonly maxVisibleQueueCustomers: number;
  private readonly maxDetailedServers: number;
  private animationTime = 0;
  private prefersReducedMotion = false;
  private renderLoopActive = false;

  constructor(options: VisualEntityLayerOptions) {
    this.maxVisibleQueueCustomers = options.maxVisibleQueueCustomers;
    this.maxDetailedServers = options.maxDetailedServers;
  }

  setAnimationTime(animationTime: number): void {
    this.animationTime = animationTime;
  }

  setRenderLoopActive(renderLoopActive: boolean): void {
    this.renderLoopActive = renderLoopActive;
  }

  setPrefersReducedMotion(prefersReducedMotion: boolean): void {
    this.prefersReducedMotion = prefersReducedMotion;
  }

  clear(): void {
    this.entities.clear();
  }

  snapToTargets(): void {
    for (const entity of this.entities.values()) {
      entity.x = entity.targetX;
      entity.y = entity.targetY;
    }
  }

  drawCustomer(
    ctx: CanvasRenderingContext2D,
    id: string,
    target: Point,
    radius: number,
    activeEntityIds: Set<string>,
  ): void {
    activeEntityIds.add(id);

    let entity = this.entities.get(id);

    if (!entity) {
      entity = {
        id,
        x: target.x,
        y: target.y,
        targetX: target.x,
        targetY: target.y,
        radius,
        lastSeenAt: this.animationTime,
        exitingUntil: null,
      };
      this.entities.set(id, entity);
    }

    entity.targetX = target.x;
    entity.targetY = target.y;
    entity.radius = radius;
    entity.lastSeenAt = this.animationTime;
    entity.exitingUntil = null;
    moveEntityTowardTarget(
      entity,
      this.prefersReducedMotion || !this.renderLoopActive ? 1 : 0.24,
    );
    drawCustomerPrimitive(ctx, entity, 1);
  }

  drawExiting(
    ctx: CanvasRenderingContext2D,
    activeEntityIds: Set<string>,
    exitPoint: Point,
  ): void {
    for (const [id, entity] of this.entities) {
      if (activeEntityIds.has(id)) {
        continue;
      }

      if (this.prefersReducedMotion) {
        this.entities.delete(id);
        continue;
      }

      if (entity.exitingUntil === null) {
        entity.exitingUntil = this.animationTime + EXIT_ANIMATION_SECONDS;
        entity.targetX = exitPoint.x;
        entity.targetY = exitPoint.y;
      }

      const remaining = entity.exitingUntil - this.animationTime;

      if (remaining <= 0) {
        this.entities.delete(id);
        continue;
      }

      moveEntityTowardTarget(entity, 0.18);
      drawCustomerPrimitive(
        ctx,
        entity,
        clamp(remaining / EXIT_ANIMATION_SECONDS, 0, 1) * 0.7,
      );
    }
  }

  prune(activeEntityIds: Set<string>): void {
    const maxEntities =
      this.maxVisibleQueueCustomers +
      this.maxDetailedServers +
      EXITING_ENTITY_CACHE_BUFFER;

    if (this.entities.size <= maxEntities) {
      return;
    }

    const staleEntities = Array.from(this.entities.values())
      .filter((entity) => !activeEntityIds.has(entity.id))
      .sort((a, b) => a.lastSeenAt - b.lastSeenAt);

    for (const entity of staleEntities) {
      if (this.entities.size <= maxEntities) {
        return;
      }

      this.entities.delete(entity.id);
    }
  }
}
