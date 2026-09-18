import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type {
  Area,
  Assignment,
  Route,
  Vehicle,
  VehicleLocation,
  VehicleLog,
  Ward,
  WorkSession,
  Worker,
} from "./types";
import type { StoreState } from "./store";
import type { OpsStore } from "./ops";
import { translateError } from "./errors";
import { todayIso } from "./time";

/**
 * The operations dashboard against the real database.
 *
 * The fleet is small — dozens of vehicles, not thousands — so the dashboard keeps the whole
 * operating day in memory and refreshes it when Realtime says something changed. That keeps
 * every screen reading one consistent snapshot instead of each one fetching its own.
 */

const EMPTY: StoreState = {
  vehicles: [],
  workers: [],
  areas: [],
  wards: [],
  routes: [],
  assignments: [],
  sessions: [],
  logs: [],
  locations: {},
};

type Row = Record<string, unknown>;

const str = (value: unknown): string => String(value ?? "");
const num = (value: unknown): number => Number(value ?? 0);
const maybeNum = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

function toVehicle(row: Row): Vehicle {
  return {
    id: str(row.id),
    vehicleNumber: str(row.vehicle_number),
    displayName: str(row.display_name),
    vehicleType: (row.vehicle_type as Vehicle["vehicleType"]) ?? "COMPACTOR",
    active: Boolean(row.active),
  };
}

function toAssignment(row: Row): Assignment {
  return {
    id: str(row.id),
    routeId: str(row.route_id),
    wardId: str(row.ward_id),
    vehicleId: str(row.vehicle_id),
    workerId: str(row.worker_id),
    assignmentDate: str(row.assignment_date),
    status: row.status as Assignment["status"],
    isAbsent: Boolean(row.is_absent),
    absenceReason: (row.absence_reason as string | null) ?? null,
  };
}

function toSession(row: Row): WorkSession {
  return {
    id: str(row.id),
    assignmentId: str(row.assignment_id),
    vehicleId: str(row.vehicle_id),
    workerId: str(row.worker_id),
    routeId: str(row.route_id),
    startedAt: (row.started_at as string | null) ?? null,
    endedAt: (row.ended_at as string | null) ?? null,
    status: row.status as WorkSession["status"],
  };
}

function toLocation(row: Row): VehicleLocation {
  return {
    id: `${str(row.vehicle_id)}-${str(row.recorded_at)}`,
    vehicleId: str(row.vehicle_id),
    workSessionId: str(row.work_session_id),
    lat: num(row.latitude),
    lng: num(row.longitude),
    speed: maybeNum(row.speed),
    heading: maybeNum(row.heading),
    accuracy: maybeNum(row.accuracy),
    recordedAt: str(row.recorded_at),
  };
}

export function createSupabaseOps(client: SupabaseClient): OpsStore {
  let state: StoreState = EMPTY;
  const listeners = new Set<() => void>();
  let channel: RealtimeChannel | null = null;
  let refreshing: Promise<void> | null = null;
  let refreshAgain = false;

  const emit = () => listeners.forEach((listener) => listener());

  /** One refresh at a time; a change that arrives mid-flight queues exactly one more. */
  const refresh = (): Promise<void> => {
    if (refreshing) {
      refreshAgain = true;
      return refreshing;
    }

    refreshing = (async () => {
      const today = todayIso();
      const [vehicles, workers, areas, wards, routes, assignments, sessions, logs, locations] =
        await Promise.all([
          client.from("vehicles").select("*").order("vehicle_number"),
          client.from("workers").select("*").order("name"),
          client.from("areas").select("*").order("name"),
          client.from("wards").select("*").order("ward_number"),
          client.from("routes").select("*").order("route_name"),
          client.from("assignments").select("*").eq("assignment_date", today),
          client.from("work_sessions").select("*").order("started_at", { ascending: false }),
          client.from("vehicle_logs").select("*").order("created_at", { ascending: false }).limit(200),
          client.from("vehicle_current_location").select("*"),
        ]);

      const byVehicle: Record<string, VehicleLocation> = {};
      for (const row of locations.data ?? []) {
        const location = toLocation(row as Row);
        byVehicle[location.vehicleId] = location;
      }

      state = {
        vehicles: (vehicles.data ?? []).map((row) => toVehicle(row as Row)),
        workers: (workers.data ?? []).map((row) => ({
          id: str((row as Row).id),
          name: str((row as Row).name),
          phone: str((row as Row).phone),
          status: (row as Row).status as Worker["status"],
        })),
        areas: (areas.data ?? []).map((row) => ({
          id: str((row as Row).id),
          jurisdictionId: str((row as Row).jurisdiction_id),
          name: str((row as Row).name),
          status: (row as Row).status as Area["status"],
        })),
        wards: (wards.data ?? []).map((row) => ({
          id: str((row as Row).id),
          areaId: str((row as Row).area_id),
          wardNumber: num((row as Row).ward_number),
          name: str((row as Row).name),
          status: (row as Row).status as Ward["status"],
        })),
        routes: (routes.data ?? []).map((row) => ({
          id: str((row as Row).id),
          wardId: str((row as Row).ward_id),
          routeName: str((row as Row).route_name),
          routeGeometry: ((row as Row).route_geometry as Route["routeGeometry"]) ?? [],
          status: (row as Row).status as Route["status"],
        })),
        assignments: (assignments.data ?? []).map((row) => toAssignment(row as Row)),
        sessions: (sessions.data ?? []).map((row) => toSession(row as Row)),
        logs: (logs.data ?? []).map((row) => ({
          id: str((row as Row).id),
          vehicleId: ((row as Row).vehicle_id as string | null) ?? null,
          actor: (row as Row).admin_id ? "Admin" : "System",
          eventType: (row as Row).event_type as VehicleLog["eventType"],
          description: str((row as Row).description),
          createdAt: str((row as Row).created_at),
        })),
        locations: byVehicle,
      };
      emit();
    })();

    return refreshing.finally(() => {
      refreshing = null;
      if (refreshAgain) {
        refreshAgain = false;
        void refresh();
      }
    });
  };

  /** A mutation is not done until the screen shows its result, so each one refreshes. */
  // PostgREST builders are thenable rather than real Promises, so the looser type.
  const mutate = async (run: () => PromiseLike<{ error: unknown }>, fallback: string) => {
    const { error } = await run();
    if (error) throw translateError(error, fallback);
    await refresh();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);

      if (!channel) {
        void refresh();
        channel = client
          .channel("ops-dashboard")
          .on("postgres_changes", { event: "*", schema: "public", table: "vehicle_current_location" },
            () => void refresh())
          .on("postgres_changes", { event: "*", schema: "public", table: "assignments" },
            () => void refresh())
          .on("postgres_changes", { event: "*", schema: "public", table: "work_sessions" },
            () => void refresh())
          .subscribe();
      }

      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && channel) {
          void client.removeChannel(channel);
          channel = null;
        }
      };
    },

    getSnapshot: () => state,
    getServerSnapshot: () => EMPTY,

    addVehicle: (input) =>
      mutate(
        () =>
          client.from("vehicles").insert({
            vehicle_number: input.vehicleNumber.trim().toUpperCase(),
            display_name: input.displayName,
            vehicle_type: input.vehicleType,
            active: input.active,
          }),
        "We could not add that vehicle.",
      ),

    updateVehicle: (id, patch) =>
      mutate(
        () =>
          client
            .from("vehicles")
            .update({
              ...(patch.vehicleNumber === undefined
                ? {}
                : { vehicle_number: patch.vehicleNumber.trim().toUpperCase() }),
              ...(patch.displayName === undefined ? {} : { display_name: patch.displayName }),
              ...(patch.vehicleType === undefined ? {} : { vehicle_type: patch.vehicleType }),
            })
            .eq("id", id),
        "We could not save that vehicle.",
      ),

    setVehicleActive: (id, active) =>
      mutate(
        () => client.from("vehicles").update({ active }).eq("id", id),
        active ? "We could not return that vehicle to service." : "We could not remove that vehicle from service.",
      ),

    createAssignment: (input) =>
      mutate(
        () =>
          client.from("assignments").insert({
            route_id: input.routeId,
            ward_id: input.wardId,
            vehicle_id: input.vehicleId,
            worker_id: input.workerId,
            assignment_date: input.assignmentDate,
            status: "SCHEDULED",
          }),
        "We could not create that assignment.",
      ),

    markAssignmentAbsent: (assignmentId, reason) =>
      mutate(
        () =>
          client
            .from("assignments")
            .update({ status: "ABSENT", is_absent: true, absence_reason: reason })
            .eq("id", assignmentId),
        "We could not mark that vehicle absent.",
      ),

    clearAbsence: (assignmentId) =>
      mutate(
        () =>
          client
            .from("assignments")
            .update({ status: "SCHEDULED", is_absent: false, absence_reason: null })
            .eq("id", assignmentId),
        "We could not restore that assignment.",
      ),

    cancelAssignment: (assignmentId) =>
      mutate(
        () => client.from("assignments").update({ status: "CANCELLED" }).eq("id", assignmentId),
        "We could not cancel that assignment.",
      ),

    addWorker: (input) =>
      mutate(
        () => client.from("workers").insert({ name: input.name, phone: input.phone, status: input.status }),
        "We could not add that worker.",
      ),

    setWorkerStatus: (id, status) =>
      mutate(
        () => client.from("workers").update({ status }).eq("id", id),
        "We could not update that worker.",
      ),

    addArea: (input) =>
      mutate(
        () =>
          client.from("areas").insert({
            name: input.name,
            jurisdiction_id: input.jurisdictionId,
            status: input.status,
          }),
        "We could not add that area.",
      ),

    addWard: (input) =>
      mutate(
        () =>
          client.from("wards").insert({
            area_id: input.areaId,
            ward_number: input.wardNumber,
            name: input.name,
            status: input.status,
          }),
        "We could not add that ward.",
      ),

    addRoute: (input) =>
      mutate(
        () =>
          client.from("routes").insert({
            ward_id: input.wardId,
            route_name: input.routeName,
            route_geometry: input.routeGeometry,
            status: input.status,
          }),
        "We could not add that route.",
      ),

    // Ending a session is a state machine, not a row edit: the RPC also closes the
    // assignment and clears the live position.
    endSession: async (sessionId) => {
      const { error } = await client.rpc("end_work_session", { p_session_id: sessionId });
      if (error) throw translateError(error, "We could not end that work session.");
      await refresh();
    },
  };
}
