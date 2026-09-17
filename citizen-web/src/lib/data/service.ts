import type {
  Area,
  Citizen,
  CollectionRecord,
  SwachhataStats,
  VehicleLocation,
  Ward,
  WardTracking,
} from "@/types/domain";

/**
 * The only surface feature code is allowed to touch.
 *
 * Swapping the mock implementation for Supabase must not require changing a single
 * component: same methods, same shapes, same error type.
 */
export interface DataService {
  listAreas(): Promise<Area[]>;
  listWards(areaId: string): Promise<Ward[]>;

  /** Resolves ward → today's assignment → vehicle → session → freshest fix. */
  getWardTracking(wardId: string): Promise<WardTracking>;

  /** Live fixes for one vehicle. Returns an unsubscribe function. */
  subscribeToVehicle(vehicleId: string, onLocation: (location: VehicleLocation) => void): () => void;

  getStats(): Promise<SwachhataStats>;
  getCollectionTrend(): Promise<{ date: string; collectedKg: number }[]>;
  getCollectionHistory(citizenId: string): Promise<CollectionRecord[]>;

  requestOtp(phone: string): Promise<{ expiresInSeconds: number }>;
  verifyOtp(phone: string, code: string): Promise<Citizen>;
  updateCitizen(citizenId: string, patch: Partial<Pick<Citizen, "name" | "areaId" | "wardId">>): Promise<Citizen>;
  getCitizen(citizenId: string): Promise<Citizen | null>;
}

/** Errors that are safe to show a citizen. Raw database failures never reach the UI. */
export class ServiceError extends Error {
  constructor(
    message: string,
    readonly code: "INVALID_OTP" | "OTP_EXPIRED" | "NOT_FOUND" | "NETWORK" | "UNKNOWN" = "UNKNOWN",
  ) {
    super(message);
    this.name = "ServiceError";
  }
}
