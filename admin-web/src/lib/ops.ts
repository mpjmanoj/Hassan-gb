"use client";

import { createSupabaseOps, demoOps, type OpsStore } from "@swachhata/core";
import { DATA_SOURCE } from "@/lib/config";
import { getSupabaseClient } from "@/lib/supabase";

let resolved: OpsStore | null = null;

/** The dashboard's only write surface. Which one answers is decided once, here. */
export function getOps(): OpsStore {
  if (resolved) return resolved;
  resolved = DATA_SOURCE === "supabase" ? createSupabaseOps(getSupabaseClient()) : demoOps;
  return resolved;
}

export { messageFor } from "@swachhata/core";
