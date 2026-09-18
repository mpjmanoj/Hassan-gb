import type {
  Area,
  Assignment,
  Citizen,
  CollectionRecord,
  SwachhataStats,
  TrackingState,
  VehicleLocation,
  Ward,
  WardTracking,
} from "./types";
import type { StoreState } from "./store";
import { store } from "./store";
import { TRACKING } from "./config";
import { todayIso } from "./time";
import { activeCitizenCount, dailySummaries, householdCollections } from "./fixtures";

/**
 * The citizen app's only data surface.
 *
 * It reads the same operational state the admin dashboard writes, so an absence marked by
 * staff reaches residents without anything in between. Replacing this with the Supabase
 * client is the whole backend integration on the citizen side.
 */

export type ServiceErrorCode =
  | "INVALID_OTP"
  | "OTP_EXPIRED"
  | "NOT_FOUND"
  | "NETWORK"
  | "UNKNOWN";

export class ServiceError extends Error {
  readonly code: ServiceErrorCode;

  constructor(message: string, code: ServiceErrorCode = "UNKNOWN") {
    super(message);
    this.name = "ServiceError";
    this.code = code;
  }
}

const CITIZEN_KEY = "swachhata.citizen";
const OTP_KEY = "swachhata.otp";
const LATENCY_MS = 220;

const delay = <T,>(value: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS));

function readCitizen(): Citizen | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CITIZEN_KEY);
    return raw ? (JSON.parse(raw) as Citizen) : null;
  } catch {
    return null;
  }
}

function writeCitizen(citizen: Citizen): Citizen {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(CITIZEN_KEY, JSON.stringify(citizen));
  }
  return citizen;
}

/**
 * Ward → today's assignment → vehicle → session → freshest fix.
 *
 * The two rules that matter: an absent assignment is never LIVE, and LIVE requires a stored
 * fix inside the freshness window. This mirrors what the database will derive.
 */
function deriveState(state: StoreState, assignment: Assignment | undefined, now: number): TrackingState {
  if (!assignment) return { kind: "NO_ROUTE" };

  const vehicle = state.vehicles.find((v) => v.id === assignment.vehicleId);
  if (!vehicle) return { kind: "NO_ROUTE" };

  if (assignment.isAbsent || assignment.status === "ABSENT") {
    return { kind: "ABSENT", reason: assignment.absenceReason, vehicle };
  }
  if (assignment.status === "CANCELLED") return { kind: "NO_ROUTE" };

  const session = state.sessions.find((s) => s.assignmentId === assignment.id);
  if (!session?.startedAt) return { kind: "NOT_STARTED", vehicle };

  if (session.status === "COMPLETED" && session.endedAt) {
    return { kind: "COMPLETED", vehicle, location: null, endedAt: session.endedAt };
  }
  // A cancelled session is not a finished collection: the crew can still start the route.
  if (session.status === "CANCELLED") return { kind: "NOT_STARTED", vehicle };

  const location = state.locations[vehicle.id] ?? null;
  if (!location) return { kind: "NOT_STARTED", vehicle };

  const stale = now - Date.parse(location.recordedAt) > TRACKING.liveWindowMs;
  return stale
    ? { kind: "CONNECTION_LOST", vehicle, location, startedAt: session.startedAt }
    : { kind: "LIVE", vehicle, location, startedAt: session.startedAt };
}

function wardTracking(state: StoreState, wardId: string): WardTracking {
  const ward = state.wards.find((w) => w.id === wardId);
  if (!ward) throw new ServiceError("We could not find that ward.", "NOT_FOUND");
  const area = state.areas.find((a) => a.id === ward.areaId);
  if (!area) throw new ServiceError("We could not find that service area.", "NOT_FOUND");

  const today = todayIso();
  const assignment = state.assignments.find(
    (a) => a.wardId === wardId && a.assignmentDate === today && a.status !== "CANCELLED",
  );
  const route = assignment ? state.routes.find((r) => r.id === assignment.routeId) ?? null : null;

  return { ward, area, route, state: deriveState(state, assignment, Date.now()) };
}

export const dataService = {
  async listAreas(): Promise<Area[]> {
    return delay(store.getSnapshot().areas.filter((a) => a.status === "ACTIVE"));
  },

  async listWards(areaId: string): Promise<Ward[]> {
    return delay(
      store
        .getSnapshot()
        .wards.filter((w) => w.areaId === areaId && w.status === "ACTIVE")
        .sort((a, b) => a.wardNumber - b.wardNumber),
    );
  },

  async getWardTracking(wardId: string): Promise<WardTracking> {
    await delay(null);
    return wardTracking(store.getSnapshot(), wardId);
  },

  /**
   * Pushes a fresh snapshot whenever operations change — an absence, a cancelled assignment,
   * a session ending. This is what Realtime on `assignments` and `work_sessions` will do.
   */
  subscribeToWardTracking(wardId: string, onChange: (tracking: WardTracking) => void): () => void {
    const push = () => {
      try {
        onChange(wardTracking(store.getSnapshot(), wardId));
      } catch {
        // A ward that disappeared mid-session is handled by the next explicit fetch.
      }
    };

    const unsubscribe = store.subscribe(push);
    // Deliver the current state at once: a subscriber should never sit on an empty screen
    // waiting for the next change to happen.
    queueMicrotask(push);
    return unsubscribe;
  },

  /** Live fixes for one vehicle — the citizen only ever receives their own ward's vehicle. */
  subscribeToVehicle(vehicleId: string, onLocation: (location: VehicleLocation) => void): () => void {
    let lastId: string | null = null;

    const push = () => {
      const location = store.getSnapshot().locations[vehicleId];
      if (!location || location.id === lastId) return;
      lastId = location.id;
      onLocation(location);
    };

    const unsubscribe = store.subscribe(push);
    queueMicrotask(push);
    return unsubscribe;
  },

  async getStats(): Promise<SwachhataStats> {
    const state = store.getSnapshot();
    const today = todayIso();
    const summary = dailySummaries.find((s) => s.date === today) ?? null;
    const activeVehicles = new Set(
      state.sessions.filter((s) => s.status === "ACTIVE").map((s) => s.vehicleId),
    );

    return delay({
      date: today,
      collectedKg: summary?.collectedKg ?? null,
      disposedKg: summary?.disposedKg ?? null,
      totalVehicles: state.vehicles.filter((v) => v.active).length,
      activeVehicles: activeVehicles.size,
      activeUsers: activeCitizenCount,
    });
  },

  async getCollectionTrend(): Promise<{ date: string; collectedKg: number }[]> {
    return delay(
      [...dailySummaries]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(({ date, collectedKg }) => ({ date, collectedKg })),
    );
  },

  async getCollectionHistory(_citizenId: string): Promise<CollectionRecord[]> {
    // Household-level collection is Stage 2/3 data. Empty is the honest answer today.
    return delay(householdCollections);
  },

  async requestOtp(phone: string): Promise<{ expiresInSeconds: number }> {
    if (!/^[6-9]\d{9}$/.test(phone)) {
      throw new ServiceError("Enter a valid 10-digit mobile number.", "INVALID_OTP");
    }
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(OTP_KEY, JSON.stringify({ phone, code: "123456", at: Date.now() }));
      // Development affordance only — a real OTP is never known to the browser.
      console.info(`[demo] OTP for +91 ${phone} is 123456`);
    }
    return delay({ expiresInSeconds: 60 });
  },

  async verifyOtp(phone: string, code: string): Promise<Citizen> {
    await delay(null);
    if (!/^\d{6}$/.test(code)) throw new ServiceError("Enter the 6-digit code.", "INVALID_OTP");

    const raw = typeof window !== "undefined" ? window.sessionStorage.getItem(OTP_KEY) : null;
    const issued = raw ? (JSON.parse(raw) as { phone: string; code: string }) : null;
    if (!issued || issued.phone !== phone) {
      throw new ServiceError("Unable to verify your number. Please try again.", "OTP_EXPIRED");
    }
    if (issued.code !== code) {
      throw new ServiceError("That code is not correct. Please check and try again.", "INVALID_OTP");
    }

    const existing = readCitizen();
    if (existing && existing.phone === phone) return existing;
    return writeCitizen({ id: `ctz-${phone}`, name: "", phone, areaId: null, wardId: null });
  },

  async updateCitizen(
    citizenId: string,
    patch: Partial<Pick<Citizen, "name" | "areaId" | "wardId">>,
  ): Promise<Citizen> {
    const existing = readCitizen();
    if (!existing || existing.id !== citizenId) {
      throw new ServiceError("Your session has expired. Please sign in again.", "NOT_FOUND");
    }
    return delay(writeCitizen({ ...existing, ...patch }));
  },

  async getCitizen(citizenId: string): Promise<Citizen | null> {
    const existing = readCitizen();
    return delay(existing && existing.id === citizenId ? existing : null);
  },
};

export type DataService = typeof dataService;

/**
 * Single entry point for citizen data access.
 *
 * When the Supabase client lands, return it from here based on the app's data-source
 * setting — no component in the citizen app needs to change.
 */
export function getDataService(): DataService {
  return dataService;
}
