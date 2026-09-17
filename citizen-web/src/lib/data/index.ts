import { DATA_SOURCE } from "@/lib/config";
import type { DataService } from "@/lib/data/service";
import { mockDataService } from "@/lib/data/mock-service";

let cached: DataService | null = null;

/**
 * Single entry point for data access.
 *
 * When the Supabase backend lands, add the client implementation here — nothing else
 * in the app needs to know which one it is talking to.
 */
export function getDataService(): DataService {
  if (cached) return cached;
  if (DATA_SOURCE === "supabase") {
    throw new Error(
      "The Supabase data service is not implemented yet. Set NEXT_PUBLIC_DATA_SOURCE=mock.",
    );
  }
  cached = mockDataService;
  return cached;
}

export { ServiceError } from "@/lib/data/service";
export type { DataService } from "@/lib/data/service";
