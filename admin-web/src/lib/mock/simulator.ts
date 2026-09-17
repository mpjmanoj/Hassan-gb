import type { LatLng, VehicleLocation } from "@/types/domain";
import { bearingDegrees, distanceMeters, lerpLatLng, offsetLatLng } from "@/lib/geo";
import { routes, workSessions } from "@/lib/mock/fixtures";

/**
 * Stand-in for Supabase Realtime.
 *
 * It drives each active vehicle around its route and pushes a fix every few seconds, so the
 * map, the staleness logic and the jump filter can all be exercised before the worker app
 * exists. The shape of what it emits is exactly what `vehicle_locations` will stream.
 */

type Listener = (location: VehicleLocation) => void;

interface VehicleWalker {
  vehicleId: string;
  workSessionId: string;
  path: LatLng[];
  /** Index of the leg currently being driven. */
  leg: number;
  /** Progress along that leg, 0 to 1. */
  t: number;
  speedMps: number;
  last: VehicleLocation;
}

const TICK_MS = 5_000;
const BASE_SPEED_MPS = 4.2; // ~15 km/h, a realistic collection crawl

let walkers: Map<string, VehicleWalker> | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let ticks = 0;
const listeners = new Map<string, Set<Listener>>();

function pointAt(path: LatLng[], leg: number, t: number): LatLng {
  const from = path[leg % path.length];
  const to = path[(leg + 1) % path.length];
  if (!from || !to) return path[0] ?? { lat: 0, lng: 0 };
  return lerpLatLng(from, to, t);
}

function makeFix(walker: VehicleWalker, position: LatLng, heading: number, accuracy: number): VehicleLocation {
  return {
    id: `loc-${walker.vehicleId}-${Date.now()}`,
    vehicleId: walker.vehicleId,
    workSessionId: walker.workSessionId,
    lat: position.lat,
    lng: position.lng,
    speed: Number(walker.speedMps.toFixed(1)),
    heading: Math.round(heading),
    accuracy,
    recordedAt: new Date().toISOString(),
  };
}

function buildWalkers(): Map<string, VehicleWalker> {
  const built = new Map<string, VehicleWalker>();

  for (const session of workSessions) {
    if (session.status !== "ACTIVE") continue;
    const route = routes.find((r) => r.id === session.routeId);
    if (!route || route.routeGeometry.length < 2) continue;

    // Spread the fleet out along their routes so they do not all start at the same corner.
    const offset = built.size * 0.37;
    const leg = Math.floor(offset) % (route.routeGeometry.length - 1);
    const t = offset % 1;
    const path = route.routeGeometry;
    const position = pointAt(path, leg, t);
    const heading = bearingDegrees(
      path[leg] ?? position,
      path[(leg + 1) % path.length] ?? position,
    );

    const walker: VehicleWalker = {
      vehicleId: session.vehicleId,
      workSessionId: session.id,
      path,
      leg,
      t,
      speedMps: BASE_SPEED_MPS,
      last: {
        id: `loc-${session.vehicleId}-seed`,
        vehicleId: session.vehicleId,
        workSessionId: session.id,
        lat: position.lat,
        lng: position.lng,
        speed: BASE_SPEED_MPS,
        heading: Math.round(heading),
        accuracy: 6,
        recordedAt: new Date().toISOString(),
      },
    };
    // One vehicle per route; a vehicle serving several wards keeps a single live position.
    if (!built.has(session.vehicleId)) built.set(session.vehicleId, walker);
  }

  return built;
}

function advance(walker: VehicleWalker, elapsedMs: number): VehicleLocation {
  // Vary the speed a little, and let a vehicle idle now and then as it would at a collection point.
  const idling = Math.random() < 0.12;
  walker.speedMps = idling ? 0 : BASE_SPEED_MPS * (0.7 + Math.random() * 0.6);

  let remaining = walker.speedMps * (elapsedMs / 1000);
  while (remaining > 0) {
    const from = pointAt(walker.path, walker.leg, walker.t);
    const to = walker.path[(walker.leg + 1) % walker.path.length];
    if (!to) break;
    const legRemaining = distanceMeters(from, to);
    if (legRemaining <= remaining || legRemaining === 0) {
      remaining -= legRemaining;
      walker.leg = (walker.leg + 1) % walker.path.length;
      walker.t = 0;
    } else {
      const legTotal = distanceMeters(
        walker.path[walker.leg] ?? from,
        walker.path[(walker.leg + 1) % walker.path.length] ?? to,
      );
      walker.t += legTotal === 0 ? 0 : remaining / legTotal;
      remaining = 0;
    }
  }

  const position = pointAt(walker.path, walker.leg, walker.t);
  const heading = bearingDegrees(walker.last, position);
  return makeFix(walker, position, heading, 4 + Math.round(Math.random() * 8));
}

function tick() {
  if (!walkers) return;
  ticks += 1;

  for (const walker of walkers.values()) {
    let fix = advance(walker, TICK_MS);

    // Inject the two failure modes the UI has to survive: a wide fix, and a wild outlier.
    if (ticks % 17 === 0) {
      fix = { ...fix, accuracy: 95 };
    } else if (ticks % 23 === 0) {
      const strayed = offsetLatLng(fix, 320, Math.random() * 360);
      fix = { ...fix, lat: strayed.lat, lng: strayed.lng };
    } else {
      walker.last = fix;
    }

    listeners.get(walker.vehicleId)?.forEach((listener) => listener(fix));
  }
}

function ensureRunning() {
  if (!walkers) walkers = buildWalkers();
  if (timer === null && typeof window !== "undefined") {
    timer = setInterval(tick, TICK_MS);
  }
}

function stopIfIdle() {
  const anyListeners = [...listeners.values()].some((set) => set.size > 0);
  if (!anyListeners && timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

export function latestLocation(vehicleId: string): VehicleLocation | null {
  ensureRunning();
  return walkers?.get(vehicleId)?.last ?? null;
}

/** Every active vehicle's freshest fix — what the fleet map opens with. */
export function latestLocations(): VehicleLocation[] {
  ensureRunning();
  return walkers ? [...walkers.values()].map((walker) => walker.last) : [];
}

/** Fleet-wide feed for the admin map and dashboard. */
export function subscribeToFleet(listener: Listener): () => void {
  ensureRunning();
  const ids = walkers ? [...walkers.keys()] : [];
  const unsubscribes = ids.map((id) => subscribeToVehicle(id, listener));
  return () => unsubscribes.forEach((off) => off());
}

export function subscribeToVehicle(vehicleId: string, listener: Listener): () => void {
  ensureRunning();
  const set = listeners.get(vehicleId) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(vehicleId, set);

  const seed = walkers?.get(vehicleId)?.last;
  if (seed) queueMicrotask(() => listener(seed));

  return () => {
    set.delete(listener);
    stopIfIdle();
  };
}
