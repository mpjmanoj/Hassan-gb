"use client";

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
} from "@/types/domain";
import { todayIso } from "@/lib/time";
import {
  areas as seedAreas,
  assignments as seedAssignments,
  routes as seedRoutes,
  vehicles as seedVehicles,
  wards as seedWards,
  workSessions as seedSessions,
  workers as seedWorkers,
} from "@/lib/mock/fixtures";
import { latestLocations, subscribeToFleet } from "@/lib/mock/simulator";

/**
 * In-memory operational store for the dashboard.
 *
 * It exists so the admin screens can be built and reviewed before the backend lands, and it
 * keeps the same invariants the database will enforce — most importantly, no two active
 * assignments for the same vehicle, worker or route on the same day.
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
  locations: Record<string, VehicleLocation>;
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

const listeners = new Set<() => void>();
let fleetUnsubscribe: (() => void) | null = null;

let state: StoreState = {
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

function emit() {
  listeners.forEach((listener) => listener());
}

function setState(patch: Partial<StoreState>) {
  state = { ...state, ...patch };
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

export const store = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);

    // Start the live feed with the first subscriber and stop it with the last.
    if (!fleetUnsubscribe) {
      const seeded: Record<string, VehicleLocation> = {};
      latestLocations().forEach((location) => {
        seeded[location.vehicleId] = location;
      });
      state = { ...state, locations: seeded };

      fleetUnsubscribe = subscribeToFleet((location) => {
        setState({ locations: { ...state.locations, [location.vehicleId]: location } });
      });
    }

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && fleetUnsubscribe) {
        fleetUnsubscribe();
        fleetUnsubscribe = null;
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

    if (patch.vehicleNumber) {
      const number = patch.vehicleNumber.trim().toUpperCase();
      if (state.vehicles.some((v) => v.id !== id && v.vehicleNumber.toUpperCase() === number)) {
        throw new ConflictError("This vehicle number is already registered.");
      }
      patch = { ...patch, vehicleNumber: number };
    }

    log("VEHICLE_UPDATED", `Admin updated ${existing.vehicleNumber}.`, id);
    setState({
      vehicles: state.vehicles.map((v) => (v.id === id ? { ...v, ...patch } : v)),
    });
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
      `Admin marked ${vehicle?.vehicleNumber ?? "vehicle"} absent for ${
        route?.routeName ?? "route"
      }${reason ? ` — ${reason}` : ""}.`,
      assignment.vehicleId,
    );

    setState({
      assignments: state.assignments.map((a) =>
        a.id === assignmentId
          ? { ...a, status: "ABSENT", isAbsent: true, absenceReason: reason }
          : a,
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
        a.id === assignmentId
          ? { ...a, status: "SCHEDULED", isAbsent: false, absenceReason: null }
          : a,
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
      (a) => a.assignmentDate === input.assignmentDate && a.status !== "CANCELLED" && a.status !== "COMPLETED",
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

    log("VEHICLE_UNASSIGNED", `Admin cancelled the assignment for ${vehicle?.vehicleNumber ?? "vehicle"}.`, assignment.vehicleId);
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
    if (
      state.wards.some((w) => w.areaId === input.areaId && w.wardNumber === input.wardNumber)
    ) {
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
};

export const today = todayIso;
