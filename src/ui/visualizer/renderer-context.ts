import type { Terminology } from "../terminology";
import type { VisualEntityLayer } from "./visual-entities";

export type QueueCanvasRendererContext = {
  entityLayer: VisualEntityLayer;
  activeEntityIds: Set<string>;
  maxVisibleQueueCustomers: number;
  maxDetailedServers: number;
  maxServerCells: number;
  defaultEmptyMessage: (terms: Terminology) => string;
};
