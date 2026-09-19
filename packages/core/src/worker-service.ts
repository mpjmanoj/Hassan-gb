import type { SupabaseClient } from "@supabase/supabase-js";
import type { LatLng } from "./types";
import { translateError } from "./errors";
import { PILOT_ACCOUNT } from "./pilot-account";

/**
 * What a collection worker's device needs from the backend.
 *
 * This is the contract the Flutter app will implement natively. The interim web tracker
 * uses it as-is, so whatever is proven here — the ingest shape, the session lifecycle, the
 * offline replay — is proven for the real app too.
 */

export interface WorkerAssignment {
  assignmentId: string;
  assignmentDate: string;
  status: string;
  isAbsent: boolean;
  vehicle: { id: string; vehicleNumber: string };
  route: { id: string; routeName: string; routeGeometry: LatLng[] };
  ward: { id: string; wardNumber: number; name: string };
  worker: { id: string; name: string };
  session: { id: string; status: string; startedAt: string } | null;
}

/** One reading from the device, in the shape `record_locations` accepts. */
export interface GpsFix {
  lat: number;
  lng: number;
  speed: number | null;
  heading: number | null;
  accuracy: number | null;
  recordedAt: string;
}

export function createWorkerService(client: SupabaseClient) {
  return {
    /**
     * A real token, no SMS — which is what lets the whole secured pipeline be exercised
     * before the OTP provider is connected.
     *
     * Anonymous sign-in is tried first because it leaves no shared credential behind. When
     * that provider is switched off, the pilot account takes over rather than the drive
     * being blocked on a dashboard toggle.
     */
    async ensureSession(): Promise<string> {
      const { data } = await client.auth.getSession();
      if (data.session?.user.id) return data.session.user.id;

      const anonymous = await client.auth.signInAnonymously();
      if (anonymous.data.user) return anonymous.data.user.id;

      const pilot = await client.auth.signInWithPassword({
        email: PILOT_ACCOUNT.email,
        password: PILOT_ACCOUNT.password,
      });
      if (pilot.data.user) return pilot.data.user.id;

      throw translateError(
        pilot.error ?? anonymous.error,
        "Could not start a session. Both anonymous and pilot sign-in were refused.",
      );
    },

    async listPairableWorkers(): Promise<{ id: string; name: string }[]> {
      const { data, error } = await client.rpc("pairable_workers");
      if (error) throw translateError(error, "Could not load the worker list.");
      return (data ?? []) as { id: string; name: string }[];
    },

    async pairWithWorker(workerId: string): Promise<{ workerId: string; name: string }> {
      const { data, error } = await client.rpc("link_me_to_worker", { p_worker_id: workerId });
      if (error) throw translateError(error, "Could not pair this device.");
      return data as { workerId: string; name: string };
    },

    /** Null means nothing is assigned to this worker today. */
    async getAssignment(): Promise<WorkerAssignment | null> {
      const { data, error } = await client.rpc("my_assignment_today");
      if (error) {
        // "not registered as a collection worker" is a normal state before pairing.
        const message = (error as { message?: string }).message ?? "";
        if (message.includes("not registered")) return null;
        throw translateError(error, "Could not load today's assignment.");
      }
      return (data as WorkerAssignment | null) ?? null;
    },

    async startWork(assignmentId: string): Promise<{ id: string; startedAt: string }> {
      const { data, error } = await client.rpc("start_work_session", {
        p_assignment_id: assignmentId,
      });
      if (error) throw translateError(error, "Could not start work.");
      return data as { id: string; startedAt: string };
    },

    async endWork(sessionId: string, at: LatLng | null): Promise<void> {
      const { error } = await client.rpc("end_work_session", {
        p_session_id: sessionId,
        p_latitude: at?.lat ?? null,
        p_longitude: at?.lng ?? null,
      });
      if (error) throw translateError(error, "Could not end work.");
    },

    /**
     * Uploads a batch. The server decides what to keep — a fix that is too inaccurate, out
     * of order, from the future or a replay of one already stored is counted as rejected
     * rather than failing the batch, so a queue always drains.
     */
    async sendLocations(
      sessionId: string,
      points: GpsFix[],
    ): Promise<{ accepted: number; rejected: number }> {
      if (points.length === 0) return { accepted: 0, rejected: 0 };

      const { data, error } = await client.rpc("record_locations", {
        p_session_id: sessionId,
        p_points: points,
      });
      if (error) throw translateError(error, "Could not upload locations.");
      return data as { accepted: number; rejected: number };
    },
  };
}

export type WorkerService = ReturnType<typeof createWorkerService>;

/**
 * Turns a browser position into a fix.
 *
 * The device reports speed in m/s and heading in degrees, but both are null while stationary
 * on most hardware, and heading is meaningless below walking pace — passing the noise on
 * would make the map's truck spin on the spot.
 */
export function fixFromPosition(position: GeolocationPosition): GpsFix {
  const { coords, timestamp } = position;
  const speed = Number.isFinite(coords.speed) ? coords.speed : null;
  const moving = (speed ?? 0) > 1;

  return {
    lat: coords.latitude,
    lng: coords.longitude,
    speed: speed === null ? null : Math.max(0, speed),
    heading: moving && Number.isFinite(coords.heading) ? coords.heading : null,
    accuracy: Number.isFinite(coords.accuracy) ? coords.accuracy : null,
    recordedAt: new Date(timestamp).toISOString(),
  };
}
