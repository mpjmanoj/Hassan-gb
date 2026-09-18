"use client";

import { createSupabaseDataService, demoDataService } from "@swachhata/core";
import { DATA_SOURCE } from "@/lib/config";
import { getSupabaseClient } from "@/lib/supabase";

type DataService = typeof demoDataService;

let resolved: DataService | null = null;

/**
 * The app's only data surface. Which implementation answers is decided once, here, by
 * NEXT_PUBLIC_DATA_SOURCE — no component knows or cares.
 */
export function getDataService(): DataService {
  if (resolved) return resolved;
  resolved =
    DATA_SOURCE === "supabase"
      ? (createSupabaseDataService(getSupabaseClient()) as unknown as DataService)
      : demoDataService;
  return resolved;
}

export { ServiceError, OperationError, messageFor } from "@swachhata/core";
