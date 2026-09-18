# Swachhata Hasan

Smart waste collection live tracking for Hassan — see your garbage collection vehicle,
know when it is coming.

> **Current stage: front end only.** The Supabase backend and the Flutter worker app are
> not built yet. The citizen web app runs against a mock data layer that emits simulated
> GPS exactly as the real vehicle feed will.

## Repository

| Path | What it is | Status |
| --- | --- | --- |
| `packages/core/` | Shared domain, operational store, live feed, citizen data service | Built |
| `citizen-web/` | Citizen PWA — Next.js, TypeScript, Tailwind | Built |
| `admin-web/` | Admin fleet dashboard — Next.js, TypeScript, Tailwind | Built |
| `worker-app/` | Worker GPS app — Flutter | Not started |
| `supabase/` | Database, RLS, realtime, edge functions | Not started |

## Running both apps

```bash
npm install          # one install for the whole workspace
npm run dev:admin    # operations dashboard on :3001
npm run dev:citizen  # citizen app on :3000
```

- Citizen app: http://localhost:3000 — sign in with any valid Indian mobile number, demo OTP `123456`.
- Operations dashboard: http://localhost:3000/ops — any valid email and a six-character password.

Open both in two tabs and try it: mark a vehicle absent in the dashboard and the resident
tracking that ward sees "Today's collection vehicle is unavailable" without reloading.

### Switching to the real database

Once the migrations in `supabase/` are applied and phone auth is configured:

1. Put your project URL and **anon** key in `citizen-web/.env.local` and `admin-web/.env.local`
   (copy each `.env.example`). The service role key goes nowhere near these apps.
2. Set `NEXT_PUBLIC_DATA_SOURCE=supabase` in both.
3. Restart both dev servers.

Nothing else changes: `citizen-web/src/lib/data.ts` and `admin-web/src/lib/ops.ts` pick the
implementation, and no screen knows which one answered.

**First run checklist** — these are the things that bite, in the order they bite:

- Sign-in fails with no SMS → phone provider not connected in Supabase, or the DLT template
  is not approved yet.
- The dashboard says the account is not registered for operations → you signed in
  successfully but there is no row for you in `admins`. Add it (see `supabase/README.md`).
- Ward list is empty → no wards seeded yet.
- A ward shows "no collection route assigned" → correct, until you create an assignment
  for today in the dashboard.
- The map never goes live → no worker has started a session yet. Until the Flutter app
  exists, nothing writes GPS, so every ward reads NOT STARTED. That is the system being
  honest, not a bug.

### How they are connected in demo mode

Both apps import `@swachhata/core`, which holds one operational store. The dashboard writes
to it, the citizen app reads from it, and changes reach every open tab through
`BroadcastChannel` and `localStorage`. The dashboard is served under `/ops` on the citizen
app's origin in development precisely so they share that origin.

The vehicle feed standing in for the worker app is deterministic — a vehicle's position is a
pure function of its route and the clock — so every tab computes the identical position
without anything coordinating them. All of this is replaced by Supabase and the Flutter
worker app; nothing here is meant to ship.

### Google Maps

Set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in `.env.local` to render the real Google map. Without
a key the app falls back to a clearly-labelled schematic preview map that uses the same live
coordinates and the same animation, so the tracking experience stays reviewable.

Restrict the browser key by HTTP referrer and to the Maps JavaScript API. It is a public key
by design; nothing secret belongs in the front end.

## Switching to the real backend

Every data access goes through `getDataService()` in `citizen-web/src/lib/data`. Adding the
Supabase implementation there and setting `NEXT_PUBLIC_DATA_SOURCE=supabase` switches the
whole app over — no component changes.

See [`docs/frontend-architecture.md`](docs/frontend-architecture.md) for the decisions
behind both apps and what the backend needs to take over.
