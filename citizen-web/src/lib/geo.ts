import type { LatLng, VehicleLocation } from "@/types/domain";

const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Great-circle distance in metres. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from `a` to `b`, in degrees clockwise from true north. */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Linear interpolation between two coordinates — accurate enough at street scale. */
export function lerpLatLng(a: LatLng, b: LatLng, t: number): LatLng {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/** Shortest signed angular delta, so a 350° → 10° turn rotates 20° and not -340°. */
export function shortestAngleDelta(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

export function lerpAngle(from: number, to: number, t: number): number {
  return (from + shortestAngleDelta(from, to) * t + 360) % 360;
}

export function offsetLatLng(origin: LatLng, meters: number, bearing: number): LatLng {
  const angular = meters / EARTH_RADIUS_M;
  const theta = toRad(bearing);
  const lat1 = toRad(origin.lat);
  const lng1 = toRad(origin.lng);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(theta),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    );

  return { lat: toDeg(lat2), lng: ((toDeg(lng2) + 540) % 360) - 180 };
}

export function formatDistance(meters: number): string {
  if (meters < 950) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export const GPS_FILTER = {
  /** Fixes wider than this are treated as unusable for display. */
  maxAccuracyMeters: 60,
  /** A jump implying more than this ground speed is physically impossible for a truck. */
  maxSpeedMps: 33, // ~120 km/h
  /** Below this, movement is indistinguishable from GPS noise, so the heading is kept. */
  minMovementMeters: 4,
} as const;

export type GpsRejection = "ACCURACY" | "IMPOSSIBLE_JUMP" | "STALE_ORDER";

export interface GpsVerdict {
  accepted: boolean;
  reason?: GpsRejection;
}

/**
 * Decide whether a freshly received fix should move the marker.
 *
 * A rejected point is dropped, not smoothed: the last good position stays on screen
 * until a better fix arrives, which is what stops the marker teleporting down a side street.
 */
export function evaluateFix(
  previous: VehicleLocation | null,
  next: VehicleLocation,
): GpsVerdict {
  if (next.accuracy !== null && next.accuracy > GPS_FILTER.maxAccuracyMeters) {
    return { accepted: false, reason: "ACCURACY" };
  }
  if (!previous) return { accepted: true };

  const elapsedMs = Date.parse(next.recordedAt) - Date.parse(previous.recordedAt);
  if (elapsedMs <= 0) return { accepted: false, reason: "STALE_ORDER" };

  const moved = distanceMeters(previous, next);
  // Allow for the accuracy radius of both fixes before calling a jump impossible.
  const slack = (previous.accuracy ?? 0) + (next.accuracy ?? 0);
  const implied = Math.max(0, moved - slack) / (elapsedMs / 1000);

  if (implied > GPS_FILTER.maxSpeedMps) return { accepted: false, reason: "IMPOSSIBLE_JUMP" };
  return { accepted: true };
}

/**
 * Heading to draw the truck at. Reported heading wins when the vehicle is genuinely
 * moving; otherwise the travel bearing is used, and a stationary vehicle keeps its last angle.
 */
export function resolveHeading(
  previous: VehicleLocation | null,
  next: VehicleLocation,
  fallback: number,
): number {
  const movingFast = (next.speed ?? 0) > 1.4; // ~5 km/h
  if (next.heading !== null && movingFast) return next.heading;
  if (previous && distanceMeters(previous, next) >= GPS_FILTER.minMovementMeters) {
    return bearingDegrees(previous, next);
  }
  return next.heading ?? fallback;
}
