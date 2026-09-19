import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Area,
  Citizen,
  CollectionRecord,
  LatLng,
  SwachhataStats,
  TrackingState,
  VehicleLocation,
  Ward,
  WardTracking,
} from "./types";
import { OperationError, translateError } from "./errors";
import { PILOT_ACCOUNT } from "./pilot-account";
import { todayIso } from "./time";

/**
 * The citizen app against the real database.
 *
 * Reads that need to join several tables go through RPCs, so the shape the screen wants is
 * assembled once in Postgres rather than in four round trips. Live updates come from
 * Realtime on `vehicle_current_location` (one row per vehicle) and on the two tables that
 * change what the day looks like.
 */

/** What `ward_tracking()` returns. Mirrors the jsonb the function builds. */
interface WardTrackingPayload {
  ward: { id: string; wardNumber: number; name: string };
  area: { id: string; name: string };
  state: TrackingState["kind"];
  route: { id: string; routeName: string; routeGeometry: LatLng[] } | null;
  vehicle: { id: string; vehicleNumber: string; vehicleType: string } | null;
  absenceReason: string | null;
  startedAt: string | null;
  endedAt: string | null;
  location: {
    lat: number;
    lng: number;
    speed: number | null;
    heading: number | null;
    accuracy: number | null;
    recordedAt: string;
  } | null;
}

function toWardTracking(payload: WardTrackingPayload): WardTracking {
  const { ward, area, vehicle, location } = payload;

  const asVehicle = vehicle
    ? {
        id: vehicle.id,
        vehicleNumber: vehicle.vehicleNumber,
        displayName: vehicle.vehicleNumber,
        vehicleType: vehicle.vehicleType as "COMPACTOR" | "TIPPER" | "AUTO_TIPPER",
        active: true,
      }
    : null;

  const asLocation: VehicleLocation | null =
    location && vehicle
      ? {
          id: `${vehicle.id}-${location.recordedAt}`,
          vehicleId: vehicle.id,
          workSessionId: "",
          lat: location.lat,
          lng: location.lng,
          speed: location.speed,
          heading: location.heading,
          accuracy: location.accuracy,
          recordedAt: location.recordedAt,
        }
      : null;

  let state: TrackingState;
  switch (payload.state) {
    case "ABSENT":
      state = asVehicle
        ? { kind: "ABSENT", reason: payload.absenceReason, vehicle: asVehicle }
        : { kind: "NO_ROUTE" };
      break;
    case "NOT_STARTED":
      state = asVehicle ? { kind: "NOT_STARTED", vehicle: asVehicle } : { kind: "NO_ROUTE" };
      break;
    case "LIVE":
    case "CONNECTION_LOST":
      state =
        asVehicle && asLocation && payload.startedAt
          ? { kind: payload.state, vehicle: asVehicle, location: asLocation, startedAt: payload.startedAt }
          : { kind: "NO_ROUTE" };
      break;
    case "COMPLETED":
      state =
        asVehicle && payload.endedAt
          ? { kind: "COMPLETED", vehicle: asVehicle, location: asLocation, endedAt: payload.endedAt }
          : { kind: "NO_ROUTE" };
      break;
    default:
      state = { kind: "NO_ROUTE" };
  }

  return {
    ward: {
      id: ward.id,
      areaId: area.id,
      wardNumber: ward.wardNumber,
      name: ward.name,
      status: "ACTIVE",
    },
    area: { id: area.id, jurisdictionId: "", name: area.name, status: "ACTIVE" },
    route: payload.route
      ? {
          id: payload.route.id,
          wardId: ward.id,
          routeName: payload.route.routeName,
          routeGeometry: payload.route.routeGeometry ?? [],
          status: "ACTIVE",
        }
      : null,
    state,
  };
}

export function createSupabaseDataService(client: SupabaseClient) {
  /** Every subscriber to a ward shares one channel; the callback re-fetches the snapshot. */
  const subscribeToOperationalChanges = (onChange: () => void): (() => void) => {
    const channel = client
      .channel(`ops-${Math.random().toString(36).slice(2, 9)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "assignments" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "work_sessions" }, onChange)
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  };

  return {
    async listAreas(): Promise<Area[]> {
      const { data, error } = await client
        .from("areas")
        .select("id, jurisdiction_id, name, status")
        .eq("status", "ACTIVE")
        .order("name");
      if (error) throw translateError(error, "We could not load service areas.");

      return (data ?? []).map((row) => ({
        id: row.id as string,
        jurisdictionId: row.jurisdiction_id as string,
        name: row.name as string,
        status: "ACTIVE" as const,
      }));
    },

    async listWards(areaId: string): Promise<Ward[]> {
      const { data, error } = await client
        .from("wards")
        .select("id, area_id, ward_number, name, status")
        .eq("area_id", areaId)
        .eq("status", "ACTIVE")
        .order("ward_number");
      if (error) throw translateError(error, "We could not load wards for that area.");

      return (data ?? []).map((row) => ({
        id: row.id as string,
        areaId: row.area_id as string,
        wardNumber: row.ward_number as number,
        name: row.name as string,
        status: "ACTIVE" as const,
      }));
    },

    async getWardTracking(wardId: string): Promise<WardTracking> {
      const { data, error } = await client.rpc("ward_tracking", { p_ward_id: wardId });
      if (error) throw translateError(error, "We could not load collection details.");
      if (!data) throw new OperationError("We could not find that ward.", "NOT_FOUND");
      return toWardTracking(data as WardTrackingPayload);
    },

    subscribeToWardTracking(wardId: string, onChange: (tracking: WardTracking) => void): () => void {
      let cancelled = false;

      const refresh = async () => {
        const { data, error } = await client.rpc("ward_tracking", { p_ward_id: wardId });
        if (cancelled || error || !data) return;
        onChange(toWardTracking(data as WardTrackingPayload));
      };

      void refresh();
      const unsubscribe = subscribeToOperationalChanges(() => void refresh());

      return () => {
        cancelled = true;
        unsubscribe();
      };
    },

    /**
     * Live position for one vehicle. RLS decides what arrives: a resident is only sent rows
     * for the vehicle serving their ward today, and nothing at all once it is marked absent.
     */
    subscribeToVehicle(
      vehicleId: string,
      onLocation: (location: VehicleLocation) => void,
    ): () => void {
      let cancelled = false;

      const emit = (row: Record<string, unknown>) => {
        if (cancelled || !row || row.vehicle_id !== vehicleId) return;
        onLocation({
          id: `${vehicleId}-${row.recorded_at as string}`,
          vehicleId,
          workSessionId: (row.work_session_id as string) ?? "",
          lat: row.latitude as number,
          lng: row.longitude as number,
          speed: (row.speed as number | null) ?? null,
          heading: (row.heading as number | null) ?? null,
          accuracy: (row.accuracy as number | null) ?? null,
          recordedAt: row.recorded_at as string,
        });
      };

      // The current position first, so the map has something to draw before the next update.
      void client
        .from("vehicle_current_location")
        .select("*")
        .eq("vehicle_id", vehicleId)
        .maybeSingle()
        .then(({ data }) => {
          if (data) emit(data as Record<string, unknown>);
        });

      const channel = client
        .channel(`vehicle-${vehicleId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "vehicle_current_location",
            filter: `vehicle_id=eq.${vehicleId}`,
          },
          (payload) => emit(payload.new as Record<string, unknown>),
        )
        .subscribe();

      return () => {
        cancelled = true;
        void client.removeChannel(channel);
      };
    },

    async getStats(): Promise<SwachhataStats> {
      const today = todayIso();

      const [summary, vehicles, sessions] = await Promise.all([
        client
          .from("daily_collection_summary")
          .select("collected_kg, disposed_kg")
          .eq("summary_date", today)
          .is("ward_id", null)
          .maybeSingle(),
        client.from("vehicles").select("id", { count: "exact", head: true }).eq("active", true),
        client
          .from("work_sessions")
          .select("vehicle_id", { count: "exact", head: true })
          .eq("status", "ACTIVE"),
      ]);

      return {
        date: today,
        // Null, not zero: nothing published is not the same as nothing collected.
        collectedKg: summary.data ? Number(summary.data.collected_kg) : null,
        disposedKg: summary.data ? Number(summary.data.disposed_kg) : null,
        totalVehicles: vehicles.count ?? 0,
        activeVehicles: sessions.count ?? 0,
        activeUsers: 0,
      };
    },

    async getCollectionTrend(): Promise<{ date: string; collectedKg: number }[]> {
      const { data, error } = await client
        .from("daily_collection_summary")
        .select("summary_date, collected_kg")
        .is("ward_id", null)
        .order("summary_date", { ascending: false })
        .limit(7);
      if (error) throw translateError(error, "We could not load collection figures.");

      return (data ?? [])
        .map((row) => ({
          date: row.summary_date as string,
          collectedKg: Number(row.collected_kg),
        }))
        .reverse();
    },

    async getCollectionHistory(_citizenId: string): Promise<CollectionRecord[]> {
      // Household-level collection is Stage 3. Empty is the honest answer until the
      // municipal import exists; the screen already says so.
      return [];
    },

    async requestOtp(phone: string): Promise<{ expiresInSeconds: number }> {
      if (!/^[6-9]\d{9}$/.test(phone)) {
        throw new OperationError("Enter a valid 10-digit mobile number.", "INVALID");
      }
      const { error } = await client.auth.signInWithOtp({ phone: `+91${phone}` });
      if (error) {
        throw translateError(error, "We could not send the code right now. Please try again.");
      }
      return { expiresInSeconds: 60 };
    },

    async verifyOtp(phone: string, code: string): Promise<Citizen> {
      const { data, error } = await client.auth.verifyOtp({
        phone: `+91${phone}`,
        token: code,
        type: "sms",
      });
      if (error || !data.user) {
        throw new OperationError(
          "That code is not correct, or it has expired. Please try again.",
          "AUTH",
          error,
        );
      }

      const citizen = await this.getCitizen(data.user.id);
      if (citizen) return citizen;

      // The sign-up trigger creates the row; this covers the case where it has not
      // committed yet, or where the person is a worker signing in to the citizen app.
      return { id: data.user.id, name: "", phone, areaId: null, wardId: null };
    },

    async updateCitizen(
      citizenId: string,
      patch: Partial<Pick<Citizen, "name" | "areaId" | "wardId">>,
    ): Promise<Citizen> {
      const { data, error } = await client
        .from("citizens")
        .update({
          ...(patch.name === undefined ? {} : { name: patch.name }),
          ...(patch.areaId === undefined ? {} : { area_id: patch.areaId }),
          ...(patch.wardId === undefined ? {} : { ward_id: patch.wardId }),
        })
        .eq("id", citizenId)
        .select("id, name, phone, area_id, ward_id")
        .single();
      if (error) throw translateError(error, "We could not save your details.");

      return {
        id: data.id as string,
        name: (data.name as string) ?? "",
        phone: (data.phone as string | null) ?? "",
        areaId: (data.area_id as string | null) ?? null,
        wardId: (data.ward_id as string | null) ?? null,
      };
    },

    /**
     * Anonymous sign-in: a real token, no SMS. The resident picks a ward and is tracked
     * like any other; a phone number is collected later, when OTP is live.
     */
    async signInAnonymously(): Promise<Citizen> {
      const { data } = await client.auth.getSession();
      let userId = data.session?.user.id ?? null;

      if (!userId) {
        const anonymous = await client.auth.signInAnonymously();

        // Falls back to the pilot account when the anonymous provider is switched off,
        // so the map is not blocked on a dashboard setting during the test drive.
        const signedIn =
          anonymous.data.user ??
          (
            await client.auth.signInWithPassword({
              email: PILOT_ACCOUNT.email,
              password: PILOT_ACCOUNT.password,
            })
          ).data.user;

        if (!signedIn) {
          throw translateError(
            anonymous.error,
            "Could not start a session. Both anonymous and pilot sign-in were refused.",
          );
        }
        userId = signedIn.id;
      }

      const existing = await this.getCitizen(userId);
      if (existing) return existing;

      // The sign-up trigger only creates a row for a phone sign-in, so make one here.
      const { data: inserted, error: insertError } = await client
        .from("citizens")
        .insert({ id: userId })
        .select("id, name, phone, area_id, ward_id")
        .single();
      if (insertError) throw translateError(insertError, "Could not start your profile.");

      return {
        id: inserted.id as string,
        name: (inserted.name as string) ?? "",
        phone: (inserted.phone as string | null) ?? "",
        areaId: null,
        wardId: null,
      };
    },

    async getCitizen(citizenId: string): Promise<Citizen | null> {
      const { data, error } = await client
        .from("citizens")
        .select("id, name, phone, area_id, ward_id")
        .eq("id", citizenId)
        .maybeSingle();
      if (error) throw translateError(error, "We could not load your profile.");
      if (!data) return null;

      return {
        id: data.id as string,
        name: (data.name as string) ?? "",
        phone: (data.phone as string | null) ?? "",
        areaId: (data.area_id as string | null) ?? null,
        wardId: (data.ward_id as string | null) ?? null,
      };
    },
  };
}

export type SupabaseDataService = ReturnType<typeof createSupabaseDataService>;
