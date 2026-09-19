import type {
  Area,
  Assignment,
  Route,
  Vehicle,
  VehicleLocation,
  VehicleLog,
  VehicleLogEvent,
  Ward,
  WorkSession,
  Worker,
} from "./types";
import { todayIso } from "./time";
import {
  areas as seedAreas,
  assignments as seedAssignments,
  routes as seedRoutes,
  vehicles as seedVehicles,
  wards as seedWards,
  workSessions as seedSessions,
  workers as seedWorkers,
} from "./fixtures";
import { locationFor, subscribeToSessions } from "./simulator";

/**
 * The single operational state both web apps read from.
 *
 * It stands in for Postgres + Realtime: the admin dashboard writes to it, the citizen app
 * reads from it, and changes propagate to every open tab on the same origin. It keeps the
 * invariants the database will own, so the errors staff see here are the errors they will
 * see once the server enforces them.
 */

export interface StoreState {
  vehicles: Vehicle[];
  workers: Worker[];
  areas: Area[];
  wards: Ward[];
  routes: Route[];
  assignments: Assignment[];
  sessions: WorkSession[];
  logs: VehicleLog[];
  /** Freshest fix per vehicle. Derived from the live feed, never persisted. */
  locations: Record<string, VehicleLocation>;
}

/** The slice that is written by staff, and therefore worth persisting and sharing. */
type PersistedState = Omit<StoreState, "locations">;

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

const STORAGE_KEY = "swachhata.operational-state.v1";
const CHANNEL = "swachhata.operational-state";

const listeners = new Set<() => void>();
let channel: BroadcastChannel | null = null;
let feedUnsubscribe: (() => void) | null = null;
let hydrated = false;

function seedState(): StoreState {
  return {
    vehicles: seedVehicles,
    workers: seedWorkers,
    areas: seedAreas,
    wards: seedWards,
    routes: seedRoutes,
    assignments: seedAssignments,
    sessions: seedSessions,
    logs: seedLogs(),
    locations: {},
  };
}

function seedLogs(): VehicleLog[] {
  const now = Date.now();
  const entries: [number, VehicleLogEvent, string, string | null][] = [
    [95, "WORK_STARTED", "Ramesh started HSN-001 on Ward 1 Main Route.", "veh-1"],
    [88, "WORK_STARTED", "Suresh started HSN-002 on Ward 2 Main Route.", "veh-2"],
    [70, "WORK_ENDED", "Ravi ended HSN-003 on Vidyanagar Circuit.", "veh-3"],
    [42, "WORK_STARTED", "Ravi started HSN-003 on Kuvempunagar Main Route.", "veh-3"],
    [30, "VEHICLE_ABSENT", "HSN-004 marked absent for Bengaluru Road Route — vehicle maintenance.", "veh-4"],
  ];

  return entries.map(([minutesAgo, eventType, description, vehicleId], index) => ({
    id: `log-seed-${index}`,
    vehicleId,
    actor: "System",
    eventType,
    description,
    createdAt: new Date(now - minutesAgo * 60_000).toISOString(),
  }));
}

let state: StoreState = seedState();

function emit() {
  listeners.forEach((listener) => listener());
}

function persistedSlice(source: StoreState): PersistedState {
  const { locations: _locations, ...rest } = source;
  return rest;
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    const payload = JSON.stringify({ date: todayIso(), data: persistedSlice(state) });
    window.localStorage.setItem(STORAGE_KEY, payload);
    channel?.postMessage(payload);
  } catch {
    // A full or blocked storage quota must not break the running app.
  }
}

function applyPayload(raw: string) {
  try {
    const parsed = JSON.parse(raw) as { date: string; data: PersistedState };
    // Yesterday's assignments are not today's operations; start the day clean.
    if (parsed.date !== todayIso()) return;
    state = { ...state, ...parsed.data };
    emit();
  } catch {
    // Ignore anything that is not a state payload we wrote.
  }
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) applyPayload(raw);
  } catch {
    // Private mode and blocked storage both fall back to the seeded state.
  }

  // Another tab changed something: adopt it. This is what makes the admin dashboard and
  // the citizen app agree without a server between them.
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (event: MessageEvent<string>) => applyPayload(event.data);
  } catch {
    channel = null;
  }
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY && event.newValue) applyPayload(event.newValue);
  });
}

function setState(patch: Partial<StoreState>, options: { persist?: boolean } = {}) {
  state = { ...state, ...patch };
  if (options.persist !== false) persist();
  emit();
}

function log(eventType: VehicleLogEvent, description: string, vehicleId: string | null) {
  state = {
    ...state,
    logs: [
      {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        vehicleId,
        actor: "Admin",
        eventType,
        description,
        createdAt: new Date().toISOString(),
      },
      ...state.logs,
    ],
  };
}

function activeSessions(): WorkSession[] {
  return state.sessions.filter((session) => session.status === "ACTIVE");
}

export const store = {
  subscribe(listener: () => void): () => void {
    hydrate();
    listeners.add(listener);

    if (!feedUnsubscribe) {
      // Seed positions immediately so the first paint has a vehicle to draw.
      const seeded: Record<string, VehicleLocation> = {};
      activeSessions().forEach((session) => {
        const location = locationFor(session);
        if (location) seeded[session.vehicleId] = location;
      });
      state = { ...state, locations: seeded };
      // Tell anyone already listening about the seeded positions, rather than leaving them
      // to wait for the next tick.
      queueMicrotask(emit);

      feedUnsubscribe = subscribeToSessions(activeSessions, (location) => {
        // Positions are ephemeral: never persisted, never broadcast.
        setState({ locations: { ...state.locations, [location.vehicleId]: location } }, { persist: false });
      });
    }

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && feedUnsubscribe) {
        feedUnsubscribe();
        feedUnsubscribe = null;
      }
    };
  },

  getSnapshot(): StoreState {
    return state;
  },

  getServerSnapshot(): StoreState {
    return state;
  },

  addVehicle(input: Omit<Vehicle, "id">): Vehicle {
    const number = input.vehicleNumber.trim().toUpperCase();
    if (state.vehicles.some((v) => v.vehicleNumber.toUpperCase() === number)) {
      throw new ConflictError("This vehicle number is already registered.");
    }

    const vehicle: Vehicle = { ...input, vehicleNumber: number, id: `veh-${Date.now()}` };
    log("VEHICLE_ADDED", `Admin added ${vehicle.vehicleNumber}.`, vehicle.id);
    setState({ vehicles: [...state.vehicles, vehicle] });
    return vehicle;
  },

  updateVehicle(id: string, patch: Partial<Omit<Vehicle, "id">>): void {
    const existing = state.vehicles.find((v) => v.id === id);
    if (!existing) throw new ConflictError("That vehicle no longer exists.");

    let next = patch;
    if (patch.vehicleNumber) {
      const number = patch.vehicleNumber.trim().toUpperCase();
      if (state.vehicles.some((v) => v.id !== id && v.vehicleNumber.toUpperCase() === number)) {
        throw new ConflictError("This vehicle number is already registered.");
      }
      next = { ...patch, vehicleNumber: number };
    }

    log("VEHICLE_UPDATED", `Admin updated ${existing.vehicleNumber}.`, id);
    setState({ vehicles: state.vehicles.map((v) => (v.id === id ? { ...v, ...next } : v)) });
  },

  setVehicleActive(id: string, active: boolean, reason?: string): void {
    const vehicle = state.vehicles.find((v) => v.id === id);
    if (!vehicle) return;

    if (!active && state.assignments.some((a) => a.vehicleId === id && a.status === "ACTIVE")) {
      throw new ConflictError(
        "This vehicle is on an active route. End the work session before removing it from service.",
      );
    }

    log(
      active ? "VEHICLE_REACTIVATED" : "VEHICLE_DEACTIVATED",
      active
        ? `Admin returned ${vehicle.vehicleNumber} to service.`
        : `Admin removed ${vehicle.vehicleNumber} from service${reason ? ` — ${reason}` : ""}.`,
      id,
    );
    setState({ vehicles: state.vehicles.map((v) => (v.id === id ? { ...v, active } : v)) });
  },

  markAssignmentAbsent(assignmentId: string, reason: string | null): void {
    const assignment = state.assignments.find((a) => a.id === assignmentId);
    if (!assignment) return;
    const vehicle = state.vehicles.find((v) => v.id === assignment.vehicleId);
    const route = state.routes.find((r) => r.id === assignment.routeId);

    log(
      "VEHICLE_ABSENT",
      `Admin marked ${vehicle?.vehicleNumber ?? "vehicle"} absent for ${route?.routeName ?? "route"}${
        reason ? ` — ${reason}` : ""
      }.`,
      assignment.vehicleId,
    );

    setState({
      assignments: state.assignments.map((a) =>
        a.id === assignmentId ? { ...a, status: "ABSENT", isAbsent: true, absenceReason: reason } : a,
      ),
      // An absent assignment must not leave a session running behind it.
      sessions: state.sessions.map((s) =>
        s.assignmentId === assignmentId && s.status === "ACTIVE"
          ? { ...s, status: "CANCELLED", endedAt: new Date().toISOString() }
          : s,
      ),
    });
  },

  clearAbsence(assignmentId: string): void {
    const assignment = state.assignments.find((a) => a.id === assignmentId);
    if (!assignment) return;
    const vehicle = state.vehicles.find((v) => v.id === assignment.vehicleId);

    log("VEHICLE_ASSIGNED", `Admin restored ${vehicle?.vehicleNumber ?? "vehicle"} to its route.`, assignment.vehicleId);
    setState({
      assignments: state.assignments.map((a) =>
        a.id === assignmentId ? { ...a, status: "SCHEDULED", isAbsent: false, absenceReason: null } : a,
      ),
    });
  },

  createAssignment(input: {
    routeId: string;
    wardId: string;
    vehicleId: string;
    workerId: string;
    assignmentDate: string;
  }): Assignment {
    const sameDay = state.assignments.filter(
      (a) =>
        a.assignmentDate === input.assignmentDate &&
        a.status !== "CANCELLED" &&
        a.status !== "COMPLETED",
    );

    const vehicle = state.vehicles.find((v) => v.id === input.vehicleId);
    if (!vehicle?.active) {
      throw new ConflictError("This vehicle is not in service and cannot be assigned.");
    }
    if (sameDay.some((a) => a.routeId === input.routeId)) {
      throw new ConflictError("Assignment conflict: this route already has a vehicle for that day.");
    }
    if (sameDay.some((a) => a.vehicleId === input.vehicleId)) {
      throw new ConflictError("Assignment conflict: this vehicle is already assigned that day.");
    }
    if (sameDay.some((a) => a.workerId === input.workerId)) {
      throw new ConflictError("Assignment conflict: this worker is already assigned that day.");
    }

    const assignment: Assignment = {
      ...input,
      id: `asg-${Date.now()}`,
      status: "SCHEDULED",
      isAbsent: false,
      absenceReason: null,
    };

    const route = state.routes.find((r) => r.id === input.routeId);
    log(
      "VEHICLE_ASSIGNED",
      `Admin assigned ${vehicle.vehicleNumber} to ${route?.routeName ?? "a route"} for ${input.assignmentDate}.`,
      input.vehicleId,
    );
    setState({ assignments: [...state.assignments, assignment] });
    return assignment;
  },

  cancelAssignment(assignmentId: string): void {
    const assignment = state.assignments.find((a) => a.id === assignmentId);
    if (!assignment) return;
    const vehicle = state.vehicles.find((v) => v.id === assignment.vehicleId);

    log(
      "VEHICLE_UNASSIGNED",
      `Admin cancelled the assignment for ${vehicle?.vehicleNumber ?? "vehicle"}.`,
      assignment.vehicleId,
    );
    setState({
      assignments: state.assignments.map((a) =>
        a.id === assignmentId ? { ...a, status: "CANCELLED" } : a,
      ),
    });
  },

  addWorker(input: Omit<Worker, "id">): Worker {
    if (state.workers.some((w) => w.phone === input.phone)) {
      throw new ConflictError("A worker with this mobile number already exists.");
    }
    const worker: Worker = { ...input, id: `wkr-${Date.now()}` };
    setState({ workers: [...state.workers, worker] });
    return worker;
  },

  setWorkerStatus(id: string, status: Worker["status"]): void {
    setState({ workers: state.workers.map((w) => (w.id === id ? { ...w, status } : w)) });
  },

  addWard(input: Omit<Ward, "id">): Ward {
    if (state.wards.some((w) => w.areaId === input.areaId && w.wardNumber === input.wardNumber)) {
      throw new ConflictError("This ward number already exists in that area.");
    }
    const ward: Ward = { ...input, id: `ward-${Date.now()}` };
    setState({ wards: [...state.wards, ward] });
    return ward;
  },

  addArea(input: Omit<Area, "id">): Area {
    const area: Area = { ...input, id: `area-${Date.now()}` };
    setState({ areas: [...state.areas, area] });
    return area;
  },

  addRoute(input: Omit<Route, "id">): Route {
    const route: Route = { ...input, id: `route-${Date.now()}` };
    setState({ routes: [...state.routes, route] });
    return route;
  },

  /** Stands in for the worker pressing Start Work, until the Flutter app exists. */
  startSession(assignmentId: string): void {
    const assignment = state.assignments.find((a) => a.id === assignmentId);
    if (!assignment) return;
    if (assignment.isAbsent) {
      throw new ConflictError("This vehicle is marked absent today. Restore it before starting work.");
    }

    const vehicle = state.vehicles.find((v) => v.id === assignment.vehicleId);
    const existing = state.sessions.find((s) => s.assignmentId === assignmentId);
    const startedAt = new Date().toISOString();

    const session: WorkSession = existing
      ? { ...existing, status: "ACTIVE", startedAt, endedAt: null }
      : {
          id: `ses-${Date.now()}`,
          assignmentId,
          vehicleId: assignment.vehicleId,
          workerId: assignment.workerId,
          routeId: assignment.routeId,
          startedAt,
          endedAt: null,
          status: "ACTIVE",
        };

    log("WORK_STARTED", `${vehicle?.vehicleNumber ?? "Vehicle"} started its route.`, assignment.vehicleId);
    setState({
      sessions: existing
        ? state.sessions.map((s) => (s.id === existing.id ? session : s))
        : [...state.sessions, session],
      assignments: state.assignments.map((a) =>
        a.id === assignmentId ? { ...a, status: "ACTIVE" } : a,
      ),
    });
  },

  endSession(sessionId: string): void {
    const session = state.sessions.find((s) => s.id === sessionId);
    if (!session) return;
    const vehicle = state.vehicles.find((v) => v.id === session.vehicleId);

    log("WORK_ENDED", `Admin ended the session for ${vehicle?.vehicleNumber ?? "vehicle"}.`, session.vehicleId);
    setState({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, status: "COMPLETED", endedAt: new Date().toISOString() } : s,
      ),
      assignments: state.assignments.map((a) =>
        a.id === session.assignmentId ? { ...a, status: "COMPLETED" } : a,
      ),
    });
  },

  /** Returns the dashboard and the citizen app to the seeded operating day. */
  reset(): void {
    state = seedState();
    persist();
    emit();
  },
};
