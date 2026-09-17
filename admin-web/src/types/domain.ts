/**
 * Domain model for Swachhata Hasan.
 *
 * These types mirror the planned PostgreSQL schema so the mock data service can be
 * replaced by the Supabase client without touching feature code.
 */

export type ID = string;

export interface Jurisdiction {
  id: ID;
  name: string;
  status: "ACTIVE" | "INACTIVE";
}

export interface Area {
  id: ID;
  jurisdictionId: ID;
  name: string;
  status: "ACTIVE" | "INACTIVE";
}

export interface Ward {
  id: ID;
  areaId: ID;
  wardNumber: number;
  name: string;
  status: "ACTIVE" | "INACTIVE";
}

export interface Route {
  id: ID;
  wardId: ID;
  routeName: string;
  /** Ordered path used to draw the service route. Empty until geometry is configured. */
  routeGeometry: LatLng[];
  status: "ACTIVE" | "INACTIVE";
}

export interface Vehicle {
  id: ID;
  vehicleNumber: string;
  displayName: string;
  vehicleType: "COMPACTOR" | "TIPPER" | "AUTO_TIPPER";
  active: boolean;
}

export interface Worker {
  id: ID;
  name: string;
  phone: string;
  status: "ACTIVE" | "INACTIVE";
}

export interface Citizen {
  id: ID;
  name: string;
  phone: string;
  areaId: ID | null;
  wardId: ID | null;
}

export type AssignmentStatus = "SCHEDULED" | "ACTIVE" | "COMPLETED" | "CANCELLED" | "ABSENT";

export interface Assignment {
  id: ID;
  routeId: ID;
  wardId: ID;
  vehicleId: ID;
  workerId: ID;
  /** ISO date, no time component: an assignment belongs to an operating day. */
  assignmentDate: string;
  status: AssignmentStatus;
  isAbsent: boolean;
  absenceReason: string | null;
}

export type WorkSessionStatus = "SCHEDULED" | "ACTIVE" | "COMPLETED" | "CANCELLED" | "OFFLINE";

export interface WorkSession {
  id: ID;
  assignmentId: ID;
  vehicleId: ID;
  workerId: ID;
  routeId: ID;
  startedAt: string | null;
  endedAt: string | null;
  status: WorkSessionStatus;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface VehicleLocation extends LatLng {
  id: ID;
  vehicleId: ID;
  workSessionId: ID;
  /** Metres per second as reported by the device. */
  speed: number | null;
  /** Degrees clockwise from true north, or null when the fix is too slow to be reliable. */
  heading: number | null;
  /** Horizontal accuracy radius in metres. */
  accuracy: number | null;
  recordedAt: string;
}

/**
 * What the citizen is actually told. Derived from assignment + session + GPS freshness —
 * never set by hand, and never LIVE without a recent backend location.
 */
export type TrackingState =
  | { kind: "NO_ROUTE" }
  | { kind: "ABSENT"; reason: string | null; vehicle: Vehicle }
  | { kind: "NOT_STARTED"; vehicle: Vehicle }
  | { kind: "LIVE"; vehicle: Vehicle; location: VehicleLocation; startedAt: string }
  | { kind: "CONNECTION_LOST"; vehicle: Vehicle; location: VehicleLocation; startedAt: string }
  | { kind: "COMPLETED"; vehicle: Vehicle; location: VehicleLocation | null; endedAt: string };

export type TrackingStateKind = TrackingState["kind"];

/** Live service snapshot for the ward the citizen selected. */
export interface WardTracking {
  ward: Ward;
  area: Area;
  route: Route | null;
  state: TrackingState;
}

export interface SwachhataStats {
  /** ISO date the figures describe. */
  date: string;
  collectedKg: number | null;
  disposedKg: number | null;
  totalVehicles: number;
  activeVehicles: number;
  activeUsers: number;
}

export interface CollectionRecord {
  date: string;
  quantityKg: number;
  collectedAt: string;
}

export type VehicleLogEvent =
  | "VEHICLE_ADDED"
  | "VEHICLE_UPDATED"
  | "VEHICLE_DEACTIVATED"
  | "VEHICLE_REACTIVATED"
  | "VEHICLE_ABSENT"
  | "VEHICLE_ASSIGNED"
  | "VEHICLE_UNASSIGNED"
  | "WORK_STARTED"
  | "WORK_ENDED";

export interface VehicleLog {
  id: ID;
  vehicleId: ID | null;
  actor: string;
  eventType: VehicleLogEvent;
  description: string;
  createdAt: string;
}

export interface Admin {
  id: ID;
  name: string;
  email: string;
  role: "SUPER_ADMIN" | "OPERATIONS";
}

/** What a vehicle row shows in the fleet table — derived, never stored. */
export type FleetStatus =
  | "LIVE"
  | "NOT_STARTED"
  | "CONNECTION_LOST"
  | "COMPLETED"
  | "ABSENT"
  | "UNASSIGNED"
  | "INACTIVE";
