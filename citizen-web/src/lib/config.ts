/** Tuning values that the backend will eventually own. Kept in one place on purpose. */
export const TRACKING = {
  /** A vehicle is only LIVE while the newest stored fix is younger than this. */
  liveWindowMs: 45_000,
  /** Expected gap between fixes while moving — drives the marker animation duration. */
  expectedUpdateIntervalMs: 6_000,
  /** Animation is clamped so a late fix never leaves the truck crawling or teleporting. */
  minAnimationMs: 600,
  maxAnimationMs: 9_000,
} as const;

export const MAPS = {
  apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
  /** Hassan city centre — the default camera before any vehicle fix arrives. */
  defaultCenter: { lat: 13.0068, lng: 76.0996 },
  defaultZoom: 15,
} as const;

export const DATA_SOURCE = (process.env.NEXT_PUBLIC_DATA_SOURCE ?? "mock") as "mock" | "supabase";

export const isMockData = DATA_SOURCE === "mock";
