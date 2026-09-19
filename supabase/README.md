# Swachhata Hasan — database

Six migrations, applied in filename order. Everything the apps are allowed to do to
tracking data goes through the RPCs in `20260918000200_functions.sql`; no client can write
a GPS position directly.

## Applying it to your project

**Option A — Supabase CLI (recommended, keeps migration history):**

```bash
npx supabase login
npx supabase link --project-ref ceriyojkzhiwcedzgbtn
npx supabase db push
```

**Option B — dashboard:** SQL Editor → paste each file from `migrations/` **in filename
order** → Run. Then `seed.sql`.

## After applying

1. **Authentication → Providers → Phone**: enable it and connect your SMS provider
   (MSG91 or Twilio). India needs DLT registration on the template before real OTPs send.
2. **Authentication → Providers → Email**: enable for staff sign-in.
3. Create your own staff user, then make yourself an administrator:
   ```sql
   insert into admins (id, name, email, role)
   values ('<user id from Authentication → Users>', 'Your Name', 'you@example.gov.in', 'SUPER_ADMIN');
   ```
4. Add the real wards and routes (see `seed.sql`).
5. **Database → Extensions → pg_cron** (optional): schedule retention,
   `select cron.schedule('prune-gps', '0 3 * * *', 'select prune_vehicle_locations()');`

## Running the tests

They apply every migration to a scratch database and assert the security rules hold — that
a worker cannot post GPS as another vehicle, that a resident cannot see another ward's
position or any raw history, that an absent vehicle is never live, and that a stale fix
stops being live on its own.

```bash
# needs a local PostgreSQL; set PGHOST/PGPORT/PGUSER if yours differ
bash supabase/tests/run.sh
```

`tests/00_local_stubs.sql` fakes the parts of Supabase's `auth` schema the migrations lean
on. It is for local testing only — never run it against your project.

## What lives where

| File | Holds |
| --- | --- |
| `…000100_schema.sql` | Tables, enums, constraints, indexes, tuning in `app_settings` |
| `…000200_functions.sql` | Identity helpers, status derivation, the worker and read RPCs |
| `…000300_triggers.sql` | Sign-up linking, operational guards, the audit trail |
| `…000400_rls.sql` | Row Level Security, grants, the Realtime publication |
| `…000500_harden_function_grants.sql` | Revokes the default PUBLIC execute on everything not meant to be an API |
| `…000600_policy_performance.sql` | Per-query helper evaluation in policies, covering indexes on foreign keys |

## Run the linter after any schema change

```
Supabase dashboard → Advisors → Security / Performance
```

It catches what the test suite cannot see, and it already caught one real hole here:
Postgres grants EXECUTE on a new function to PUBLIC and PostgREST publishes the whole
`public` schema, so every function is an API endpoint until it is revoked by name. Two
SECURITY DEFINER helpers were reachable by anonymous visitors before migration 000500.
The suite now asserts the whole function surface, so that specific class cannot come back.

## Two decisions worth knowing

**Status is derived, never stored.** `derive_tracking_state()` is the only definition of
whether a vehicle is live, and both apps read it, so residents and staff cannot be shown
different truths. A vehicle is LIVE only while its newest stored fix is younger than
`app_settings.live_window_seconds`.

**Live position is its own small table.** `vehicle_current_location` carries one row per
vehicle and is what Realtime publishes; `vehicle_locations` keeps the history and is not
published. That keeps the live stream to one row per vehicle per update instead of the
whole GPS firehose, and lets history age out without touching what residents read.
