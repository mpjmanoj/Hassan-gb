"use client";

import { useSyncExternalStore } from "react";
import type { StoreState } from "@swachhata/core";
import { getOps } from "@/lib/ops";

export function useStore(): StoreState {
  const ops = getOps();
  return useSyncExternalStore(ops.subscribe, ops.getSnapshot, ops.getServerSnapshot);
}
