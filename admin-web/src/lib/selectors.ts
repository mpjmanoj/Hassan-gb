import type {
  Assignment,
  FleetStatus,
  Route,
  Vehicle,
  VehicleLocation,
  Ward,
  WorkSession,
  Worker,
} from "@/types/domain";
import type { StoreState } from "@/lib/store";
import { TRACKING } from "@/lib/config";
import { todayIso } from "@/lib/time";

export interface FleetRow {
  vehicle: Vehicle;
  assignment: Assignment | null;
  session: WorkSession | null;
  worker: Worker | null;
  route: Route | null;
  wards: Ward[];
  location: VehicleLocation | null;
  status: FleetStatus;
}

/**
 * One row per vehicle for today, with status derived rather than stored.
 *
 * The rules match what the citizen app shows, so operations and residents can never be
 * looking at two different truths about the same vehicle.
 */
export function fleetRows(state: StoreState, now = Date.now()): FleetRow[] {
  const date = todayIso();

  return state.vehicles.map((vehicle) => {
    const assignments = state.assignments.filter(
      (a) => a.vehicleId === vehicle.id && a.assignmentDate === date && a.status !== "CANCELLED",
    );
    // The assignment being worked now, else the next scheduled one, else whatever is left.
    const assignment =
      assignments.find((a) => a.status === "ACTIVE") ??
      assignments.find((a) => a.status === "SCHEDULED") ??
      assignments.find((a) => a.status === "ABSENT") ??
      assignments[0] ??
      null;

    const session = assignment
      ? state.sessions.find((s) => s.assignmentId === assignment.id) ?? null
      : null;
    const worker = assignment
      ? state.workers.find((w) => w.id === assignment.workerId) ?? null
      : null;
    const route = assignment ? state.routes.find((r) => r.id === assignment.routeId) ?? null : null;

    // A vehicle can serve several wards in a day; the table shows all of them.
    const wards = assignments
      .map((a) => state.wards.find((w) => w.id === a.wardId))
      .filter((w): w is Ward => Boolean(w))
      .sort((a, b) => a.wardNumber - b.wardNumber);

    const location = state.locations[vehicle.id] ?? null;
    const fresh =
      location !== null && now - Date.parse(location.recordedAt) <= TRACKING.liveWindowMs;

    let status: FleetStatus;
    if (!vehicle.active) status = "INACTIVE";
    else if (!assignment) status = "UNASSIGNED";
    else if (assignment.isAbsent || assignment.status === "ABSENT") status = "ABSENT";
    else if (!session?.startedAt) status = "NOT_STARTED";
    else if (session.status === "COMPLETED") status = "COMPLETED";
    else status = fresh ? "LIVE" : "CONNECTION_LOST";

    return { vehicle, assignment, session, worker, route, wards, location, status };
  });
}

export interface DashboardCounts {
  totalVehicles: number;
  liveVehicles: number;
  offlineVehicles: number;
  absentVehicles: number;
  activeWorkers: number;
  wardsServed: number;
}

export function dashboardCounts(rows: FleetRow[], state: StoreState): DashboardCounts {
  const date = todayIso();
  const servedWards = new Set(
    state.assignments
      .filter((a) => a.assignmentDate === date && a.status !== "CANCELLED" && !a.isAbsent)
      .map((a) => a.wardId),
  );

  return {
    totalVehicles: state.vehicles.filter((v) => v.active).length,
    liveVehicles: rows.filter((r) => r.status === "LIVE").length,
    offlineVehicles: rows.filter((r) => r.status === "CONNECTION_LOST").length,
    absentVehicles: rows.filter((r) => r.status === "ABSENT").length,
    activeWorkers: new Set(
      rows.filter((r) => r.status === "LIVE" || r.status === "CONNECTION_LOST").map((r) => r.worker?.id),
    ).size,
    wardsServed: servedWards.size,
  };
}

export const FLEET_STATUS_LABEL: Record<FleetStatus, string> = {
  LIVE: "Live",
  NOT_STARTED: "Not started",
  CONNECTION_LOST: "Connection lost",
  COMPLETED: "Completed",
  ABSENT: "Absent",
  UNASSIGNED: "Unassigned",
  INACTIVE: "Out of service",
};
