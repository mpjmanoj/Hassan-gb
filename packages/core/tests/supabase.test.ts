import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseDataService } from "../src/supabase-service.ts";
import { createSupabaseOps } from "../src/supabase-store.ts";
import { translateError, messageFor, OperationError } from "../src/errors.ts";

/**
 * These do not test Supabase. They test the shapes this app sends it: RPC names, argument
 * names, column names and the mapping back into domain objects. A rename in a migration
 * that is not mirrored here shows up as a failure rather than as an empty screen.
 */

interface Call {
  kind: string;
  name: string;
  args?: unknown;
}

function stubClient(responses: Record<string, unknown> = {}) {
  const calls: Call[] = [];

  const builder = (table: string, kind: string, args?: unknown) => {
    calls.push({ kind, name: table, args });
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "is", "order", "limit", "update", "insert", "not"]) {
      chain[method] = (...params: unknown[]) => {
        if (method === "update" || method === "insert") {
          calls.push({ kind: method, name: table, args: params[0] });
        }
        return chain;
      };
    }
    const result = { data: responses[table] ?? null, error: null, count: 0 };
    chain.maybeSingle = () => Promise.resolve(result);
    chain.single = () => Promise.resolve(result);
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return chain;
  };

  const client = {
    from: (table: string) => builder(table, "from"),
    rpc: (name: string, args: unknown) => {
      calls.push({ kind: "rpc", name, args });
      return Promise.resolve({ data: responses[name] ?? null, error: null });
    },
    channel: () => {
      const channel: Record<string, unknown> = {};
      channel.on = () => channel;
      channel.subscribe = () => channel;
      return channel;
    },
    removeChannel: () => Promise.resolve("ok"),
    auth: {
      signInWithOtp: (args: unknown) => {
        calls.push({ kind: "auth", name: "signInWithOtp", args });
        return Promise.resolve({ data: {}, error: null });
      },
      verifyOtp: (args: unknown) => {
        calls.push({ kind: "auth", name: "verifyOtp", args });
        return Promise.resolve({ data: { user: { id: "user-1" } }, error: null });
      },
    },
  } as unknown as SupabaseClient;

  return { client, calls };
}

const LIVE_PAYLOAD = {
  ward: { id: "ward-5", wardNumber: 5, name: "Kuvempunagar" },
  area: { id: "area-1", name: "Hassan City" },
  state: "LIVE",
  route: { id: "route-5", routeName: "Kuvempunagar Main", routeGeometry: [{ lat: 13, lng: 76 }] },
  vehicle: { id: "veh-3", vehicleNumber: "HSN-003", vehicleType: "TIPPER" },
  absenceReason: null,
  startedAt: "2026-09-18T03:02:00Z",
  endedAt: null,
  location: { lat: 13.006, lng: 76.102, speed: 4.1, heading: 87, accuracy: 6, recordedAt: "2026-09-18T05:10:00Z" },
};

test("ward tracking calls the RPC by the name the migration defines", async () => {
  const { client, calls } = stubClient({ ward_tracking: LIVE_PAYLOAD });
  await createSupabaseDataService(client).getWardTracking("ward-5");

  const rpc = calls.find((call) => call.kind === "rpc");
  assert.equal(rpc?.name, "ward_tracking");
  assert.deepEqual(rpc?.args, { p_ward_id: "ward-5" });
});

test("a live payload maps to a live tracking state with its vehicle and fix", async () => {
  const { client } = stubClient({ ward_tracking: LIVE_PAYLOAD });
  const tracking = await createSupabaseDataService(client).getWardTracking("ward-5");

  assert.equal(tracking.state.kind, "LIVE");
  assert.equal(tracking.ward.wardNumber, 5);
  assert.equal(tracking.route?.routeGeometry.length, 1);
  if (tracking.state.kind !== "LIVE") throw new Error("unreachable");
  assert.equal(tracking.state.vehicle.vehicleNumber, "HSN-003");
  assert.equal(tracking.state.location.lat, 13.006);
  assert.equal(tracking.state.startedAt, "2026-09-18T03:02:00Z");
});

test("an absent payload carries the reason and never a position", async () => {
  const { client } = stubClient({
    ward_tracking: { ...LIVE_PAYLOAD, state: "ABSENT", absenceReason: "Vehicle maintenance", location: null },
  });
  const tracking = await createSupabaseDataService(client).getWardTracking("ward-5");

  assert.equal(tracking.state.kind, "ABSENT");
  if (tracking.state.kind !== "ABSENT") throw new Error("unreachable");
  assert.equal(tracking.state.reason, "Vehicle maintenance");
});

test("a ward with no assignment maps to no route rather than an empty vehicle", async () => {
  const { client } = stubClient({
    ward_tracking: { ...LIVE_PAYLOAD, state: "NO_ROUTE", vehicle: null, route: null, location: null },
  });
  const tracking = await createSupabaseDataService(client).getWardTracking("ward-8");
  assert.equal(tracking.state.kind, "NO_ROUTE");
});

test("collection figures stay null when the municipality has published none", async () => {
  const { client } = stubClient();
  const stats = await createSupabaseDataService(client).getStats();
  assert.equal(stats.collectedKg, null, "no published figure must not read as zero collected");
  assert.equal(stats.disposedKg, null);
});

test("OTP is sent to the number in international form", async () => {
  const { client, calls } = stubClient();
  await createSupabaseDataService(client).requestOtp("9008800101");

  const call = calls.find((entry) => entry.name === "signInWithOtp");
  assert.deepEqual(call?.args, { phone: "+919008800101" });
});

test("a malformed number is refused before any request is made", async () => {
  const { client, calls } = stubClient();
  await assert.rejects(() => createSupabaseDataService(client).requestOtp("12345"), /10-digit/);
  assert.equal(calls.length, 0);
});

test("adding a vehicle writes the columns the schema declares", async () => {
  const { client, calls } = stubClient();
  await createSupabaseOps(client).addVehicle({
    vehicleNumber: " hsn-009 ",
    displayName: "Compactor 9",
    vehicleType: "COMPACTOR",
    active: true,
  });

  const insert = calls.find((call) => call.kind === "insert");
  assert.equal(insert?.name, "vehicles");
  assert.deepEqual(insert?.args, {
    vehicle_number: "HSN-009",   // trimmed and upper-cased to match the unique index
    display_name: "Compactor 9",
    vehicle_type: "COMPACTOR",
    active: true,
  });
});

test("marking absent sets all three columns the check constraint requires together", async () => {
  const { client, calls } = stubClient();
  await createSupabaseOps(client).markAssignmentAbsent("asg-1", "Vehicle maintenance");

  const update = calls.find((call) => call.kind === "update");
  assert.equal(update?.name, "assignments");
  assert.deepEqual(update?.args, {
    status: "ABSENT",
    is_absent: true,
    absence_reason: "Vehicle maintenance",
  });
});

test("ending a session goes through the RPC, not a row edit", async () => {
  const { client, calls } = stubClient();
  await createSupabaseOps(client).endSession("ses-1");

  const rpc = calls.find((call) => call.kind === "rpc");
  assert.equal(rpc?.name, "end_work_session");
  assert.deepEqual(rpc?.args, { p_session_id: "ses-1" });
});

test("a unique violation becomes the sentence staff should read", () => {
  const error = translateError(
    { code: "23505", message: 'duplicate key value violates unique constraint "vehicles_number_key"' },
    "fallback",
  );
  assert.equal(error.message, "This vehicle number is already registered.");
  assert.equal(error.code, "CONFLICT");
});

test("a double-booked route names the conflict, not the index", () => {
  const error = translateError(
    { code: "23505", message: 'duplicate key value violates unique constraint "assignments_one_per_route_day"' },
    "fallback",
  );
  assert.match(error.message, /this route already has a vehicle/);
});

test("a message the database wrote for people is passed through", () => {
  const error = translateError(
    { code: "42501", message: "This route is assigned to another worker." },
    "fallback",
  );
  assert.equal(error.message, "This route is assigned to another worker.");
  assert.equal(error.code, "NOT_ALLOWED");
});

test("an unrecognised error never leaks its raw text to a screen", () => {
  const error = translateError(
    { code: "XX000", message: "PostgREST internal: relation does not exist" },
    "We could not save that change.",
  );
  assert.equal(error.message, "We could not save that change.");
});

test("messageFor reads both implementations' errors and falls back otherwise", () => {
  assert.equal(messageFor(new OperationError("Absent today."), "fallback"), "Absent today.");

  const legacy = new Error("Enter the 6-digit code.");
  legacy.name = "ServiceError";
  assert.equal(messageFor(legacy, "fallback"), "Enter the 6-digit code.");

  assert.equal(messageFor(new Error("TypeError: undefined"), "fallback"), "fallback");
});
