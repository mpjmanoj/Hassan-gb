import type { LatLng, VehicleLocation, WorkSession } from "./types";
import { bearingDegrees, distanceMeters, lerpLatLng, offsetLatLng } from "./geo";
import { routes } from "./fixtures";

/**
 * Stand-in for the worker app's GPS feed, until the Flutter app and Supabase Realtime exist.
 *
 * It is deliberately **deterministic**: a vehicle's position is a pure function of its route
 * and the wall clock. Every browser tab — citizen or admin, on any origin — computes the
 * identical position without talking to each other, so both interfaces show the same truck in
 * the same place. Nothing here survives into production; the shape of what it emits is exactly
 * what `vehicle_locations` will stream.
 */

const TICK_MS = 5_000;
const BASE_SPEED_MPS = 4.0; // ~14 km/h, a realistic collection crawl

/** Distance covered since the session started, in metres. Strictly increasing. */
function distanceAt(seconds: number): number {
  return BASE_SPEED_MPS * seconds + 30 * Math.sin(seconds / 60);
}

/** Derivative of the above: the speed that distance implies at that moment. */
function speedAt(seconds: number): number {
  return BASE_SPEED_MPS + 0.5 * Math.cos(seconds / 60);
}

/** Cheap deterministic hash, so "random-looking" values agree across tabs. */
function hash(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** Total length of one loop of the route. */
function pathLength(path: LatLng[]): number {
  let total = 0;
  for (let i = 0; i < path.length - 1; i += 1) {
    total += distanceMeters(path[i]!, path[i + 1]!);
  }
  return total;
}

/** The coordinate `meters` along the path, wrapping around at the end of the loop. */
function pointAtDistance(path: LatLng[], meters: number): LatLng {
  const loop = pathLength(path);
  if (loop === 0) return path[0]!;

  let remaining = ((meters % loop) + loop) % loop;
  for (let i = 0; i < path.length - 1; i += 1) {
    const from = path[i]!;
    const to = path[i + 1]!;
    const leg = distanceMeters(from, to);
    if (remaining <= leg) return lerpLatLng(from, to, leg === 0 ? 0 : remaining / leg);
    remaining -= leg;
  }
  return path[path.length - 1]!;
}

/**
 * The fix a vehicle would have reported at `at` for this session.
 *
 * Two failure modes are injected on fixed tick numbers so the client-side GPS filter is
 * exercised in normal use: an occasional wide fix, and an occasional impossible jump.
 */
export function locationFor(session: WorkSession, at = Date.now()): VehicleLocation | null {
  if (!session.startedAt || session.status !== "ACTIVE") return null;

  const route = routes.find((r) => r.id === session.routeId);
  if (!route || route.routeGeometry.length < 2) return null;

  const startedAt = Date.parse(session.startedAt);
  // Snap to the tick grid so every tab produces the same fix, with the same timestamp.
  const tick = Math.floor((at - startedAt) / TICK_MS);
  if (tick < 0) return null;

  const recordedAt = startedAt + tick * TICK_MS;
  const seconds = tick * (TICK_MS / 1000);
  const path = route.routeGeometry;

  const position = pointAtDistance(path, distanceAt(seconds));
  const ahead = pointAtDistance(path, distanceAt(seconds + 2));
  const idling = hash(tick * 7.13) < 0.12;

  let lat = position.lat;
  let lng = position.lng;
  let accuracy = 4 + Math.round(hash(tick) * 8);

  if (tick % 17 === 0) {
    accuracy = 95; // A wide fix the filter should reject on accuracy.
  } else if (tick % 23 === 0) {
    const strayed = offsetLatLng(position, 320, hash(tick * 3.7) * 360);
    lat = strayed.lat; // An impossible jump the filter should reject on implied speed.
    lng = strayed.lng;
  }

  return {
    id: `loc-${session.id}-${tick}`,
    vehicleId: session.vehicleId,
    workSessionId: session.id,
    lat,
    lng,
    speed: idling ? 0 : Number(speedAt(seconds).toFixed(1)),
    heading: Math.round(bearingDegrees(position, ahead)),
    accuracy,
    recordedAt: new Date(recordedAt).toISOString(),
  };
}

type Listener = (location: VehicleLocation) => void;

interface Subscription {
  sessionsFor: () => WorkSession[];
  listener: Listener;
  lastTickSent: Map<string, string>;
}

const subscriptions = new Set<Subscription>();
let timer: ReturnType<typeof setInterval> | null = null;

function pump() {
  subscriptions.forEach((subscription) => {
    subscription.sessionsFor().forEach((session) => {
      const location = locationFor(session);
      if (!location) return;
      // Only deliver a fix once, even though it can be recomputed at any time.
      if (subscription.lastTickSent.get(session.id) === location.id) return;
      subscription.lastTickSent.set(session.id, location.id);
      subscription.listener(location);
    });
  });
}

/**
 * Subscribes to fixes for whichever sessions `sessionsFor` returns at the time of each tick,
 * so a session that starts or ends is picked up without re-subscribing.
 */
export function subscribeToSessions(
  sessionsFor: () => WorkSession[],
  listener: Listener,
): () => void {
  const subscription: Subscription = { sessionsFor, listener, lastTickSent: new Map() };
  subscriptions.add(subscription);

  if (timer === null && typeof window !== "undefined") {
    timer = setInterval(pump, 1_000);
  }
  // Deliver the current fix immediately rather than waiting for the next tick.
  if (typeof window !== "undefined") queueMicrotask(pump);

  return () => {
    subscriptions.delete(subscription);
    if (subscriptions.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}
