"use client";

import { useSyncExternalStore } from "react";
import { store, type StoreState } from "@/lib/store";

export function useStore(): StoreState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}
