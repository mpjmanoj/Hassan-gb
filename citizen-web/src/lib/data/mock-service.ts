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
} from "@/types/domain";
import type { DataService } from "@/lib/data/service";
import { ServiceError } from "@/lib/data/service";
import { TRACKING } from "@/lib/config";
import { todayIso } from "@/lib/time";
import {
  activeCitizenCount,
  areas,
  assignments,
  dailySummaries,
  householdCollections,
  routes,
  vehicles,
  wards,
  workSessions,
} from "@/lib/mock/fixtures";
import { latestLocation, subscribeToVehicle } from "@/lib/mock/simulator";

const CITIZEN_KEY = "swachhata.citizen";
const OTP_KEY = "swachhata.otp";
const LATENCY_MS = 260;

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
 * Mirrors the status derivation the database will own.
 *
 * The two rules that matter: an absent assignment is never LIVE, and LIVE requires a
 * backend fix inside the live window — a stale fix downgrades to CONNECTION_LOST.
 */
function deriveState(assignment: Assignment | undefined, now: number): TrackingState {
  if (!assignment) return { kind: "NO_ROUTE" };

  const vehicle = vehicles.find((v) => v.id === assignment.vehicleId);
  if (!vehicle) return { kind: "NO_ROUTE" };

  if (assignment.isAbsent || assignment.status === "ABSENT") {
    return { kind: "ABSENT", reason: assignment.absenceReason, vehicle };
  }
  if (assignment.status === "CANCELLED") return { kind: "NO_ROUTE" };

  const session = workSessions.find((s) => s.assignmentId === assignment.id);
  if (!session || !session.startedAt) return { kind: "NOT_STARTED", vehicle };

  if (session.status === "COMPLETED" && session.endedAt) {
    return { kind: "COMPLETED", vehicle, location: null, endedAt: session.endedAt };
  }

  const location = latestLocation(vehicle.id);
  if (!location) return { kind: "NOT_STARTED", vehicle };

  const age = now - Date.parse(location.recordedAt);
  if (age > TRACKING.liveWindowMs) {
    return { kind: "CONNECTION_LOST", vehicle, location, startedAt: session.startedAt };
  }
  return { kind: "LIVE", vehicle, location, startedAt: session.startedAt };
}

export const mockDataService: DataService = {
  async listAreas(): Promise<Area[]> {
    return delay(areas.filter((a) => a.status === "ACTIVE"));
  },

  async listWards(areaId: string): Promise<Ward[]> {
    return delay(
      wards
        .filter((w) => w.areaId === areaId && w.status === "ACTIVE")
        .sort((a, b) => a.wardNumber - b.wardNumber),
    );
  },

  async getWardTracking(wardId: string): Promise<WardTracking> {
    const ward = wards.find((w) => w.id === wardId);
    if (!ward) throw new ServiceError("We could not find that ward.", "NOT_FOUND");
    const area = areas.find((a) => a.id === ward.areaId);
    if (!area) throw new ServiceError("We could not find that service area.", "NOT_FOUND");

    const today = todayIso();
    const assignment = assignments.find(
      (a) => a.wardId === wardId && a.assignmentDate === today && a.status !== "CANCELLED",
    );
    const route = assignment ? routes.find((r) => r.id === assignment.routeId) ?? null : null;

    return delay({ ward, area, route, state: deriveState(assignment, Date.now()) });
  },

  subscribeToVehicle(vehicleId: string, onLocation: (location: VehicleLocation) => void) {
    return subscribeToVehicle(vehicleId, onLocation);
  },

  async getStats(): Promise<SwachhataStats> {
    const today = todayIso();
    const summary = dailySummaries.find((s) => s.date === today) ?? null;
    const activeVehicleIds = new Set(
      workSessions.filter((s) => s.status === "ACTIVE").map((s) => s.vehicleId),
    );

    return delay({
      date: today,
      collectedKg: summary?.collectedKg ?? null,
      disposedKg: summary?.disposedKg ?? null,
      totalVehicles: vehicles.filter((v) => v.active).length,
      activeVehicles: activeVehicleIds.size,
      activeUsers: activeCitizenCount,
    });
  },

  async getCollectionTrend() {
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

  async requestOtp(phone: string) {
    if (!/^[6-9]\d{9}$/.test(phone)) {
      throw new ServiceError("Enter a valid 10-digit mobile number.", "INVALID_OTP");
    }
    const code = "123456";
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(OTP_KEY, JSON.stringify({ phone, code, at: Date.now() }));
      // Development affordance only — a real OTP is never known to the browser.
      console.info(`[mock] OTP for +91 ${phone} is ${code}`);
    }
    return delay({ expiresInSeconds: 60 });
  },

  async verifyOtp(phone: string, code: string): Promise<Citizen> {
    await delay(null);
    if (!/^\d{6}$/.test(code)) throw new ServiceError("Enter the 6-digit code.", "INVALID_OTP");

    const raw = typeof window !== "undefined" ? window.sessionStorage.getItem(OTP_KEY) : null;
    const issued = raw ? (JSON.parse(raw) as { phone: string; code: string; at: number }) : null;
    if (!issued || issued.phone !== phone) {
      throw new ServiceError("Unable to verify your number. Please try again.", "OTP_EXPIRED");
    }
    if (issued.code !== code) {
      throw new ServiceError("That code is not correct. Please check and try again.", "INVALID_OTP");
    }

    const existing = readCitizen();
    if (existing && existing.phone === phone) return existing;

    return writeCitizen({
      id: `ctz-${phone}`,
      name: "",
      phone,
      areaId: null,
      wardId: null,
    });
  },

  async updateCitizen(citizenId, patch): Promise<Citizen> {
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
