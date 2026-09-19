/**
 * Tuning the backend will eventually own. Kept free of environment access on purpose:
 * anything app-specific (API keys, data source) belongs to the app, not the shared core.
 */
export const TRACKING = {
  /** A vehicle is only LIVE while the newest stored fix is younger than this. */
  liveWindowMs: 45_000,
  /** Expected gap between fixes while moving — drives the marker animation duration. */
  expectedUpdateIntervalMs: 6_000,
  /** Animation is clamped so a late fix never leaves the truck crawling or teleporting. */
  minAnimationMs: 600,
  maxAnimationMs: 9_000,
} as const;

/** Hassan city centre — the default camera before any vehicle fix arrives. */
export const DEFAULT_CENTER = { lat: 13.0068, lng: 76.0996 } as const;
export const DEFAULT_ZOOM = 15;
