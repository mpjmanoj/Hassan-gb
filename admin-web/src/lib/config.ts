export { TRACKING, DEFAULT_CENTER, DEFAULT_ZOOM } from "@swachhata/core";
import { DEFAULT_CENTER, DEFAULT_ZOOM } from "@swachhata/core";

export const MAPS = {
  apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
  mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID",
  defaultCenter: DEFAULT_CENTER,
  defaultZoom: DEFAULT_ZOOM,
} as const;

/** "demo" runs on the shared in-browser store; "supabase" once the backend exists. */
export const DATA_SOURCE = (process.env.NEXT_PUBLIC_DATA_SOURCE ?? "demo") as "demo" | "supabase";
export const isDemoData = DATA_SOURCE === "demo";
