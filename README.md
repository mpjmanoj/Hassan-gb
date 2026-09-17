# Swachhata Hasan

Smart waste collection live tracking for Hassan — see your garbage collection vehicle,
know when it is coming.

> **Current stage: front end only.** The Supabase backend and the Flutter worker app are
> not built yet. The citizen web app runs against a mock data layer that emits simulated
> GPS exactly as the real vehicle feed will.

## Repository

| Path | What it is | Status |
| --- | --- | --- |
| `citizen-web/` | Citizen PWA — Next.js, TypeScript, Tailwind | Built |
| `admin-web/` | Admin fleet dashboard — Next.js, TypeScript, Tailwind | Next |
| `worker-app/` | Worker GPS app — Flutter | Not started |
| `supabase/` | Database, RLS, realtime, edge functions | Not started |

## Running the citizen app

```bash
cd citizen-web
cp .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000. Sign in with any valid Indian mobile number; the demo OTP is
`123456`.

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

See `docs/` for the product decisions that shaped the front end.
