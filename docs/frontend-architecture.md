# Front-end architecture

This documents the decisions behind the two web apps, so the backend work can slot in
without renegotiating them.

## Stage 1 scope, as built

The front end covers the Stage 1 citizen and admin surfaces from the PRD. The Flutter
worker app and the Supabase backend are not started; a mock data layer stands in for both.

## One tracking pipeline

Everything about live tracking follows the same path, and the mock only replaces the first
step:

```
fix arrives  →  GPS filter  →  marker animator  →  map marker
             ↘  status derivation  →  status pill / headline
```

- **Filter** (`lib/geo.ts`, `evaluateFix`) rejects a fix on poor accuracy, out-of-order
  timestamps, or an implied speed a truck cannot reach. A rejected fix is dropped rather
  than smoothed, so the last good position stays on screen.
- **Animator** (`features/map/animator.ts`) tweens between fixes on `requestAnimationFrame`
  and re-targets from the marker's current position, so a late fix never fights a running
  animation. It calls back with a pose and mutates the marker directly — no React state per
  frame, no map reload.
- **Heading** uses the reported bearing while the vehicle is moving, the travel bearing when
  it is not reliable, and holds the last angle when the vehicle is stationary.
- **Status** is derived, never stored. `LIVE` requires a backend fix inside
  `TRACKING.liveWindowMs`; past that it becomes `CONNECTION_LOST`. An absent assignment is
  never live, whatever GPS says.

The citizen app and the admin dashboard derive status with the same rules, so residents and
operations staff can never see two different truths about one vehicle.

## Swapping in Supabase

`citizen-web/src/lib/data/` defines `DataService` and resolves it through
`getDataService()`. Add a Supabase implementation there, set
`NEXT_PUBLIC_DATA_SOURCE=supabase`, and no component changes.

The admin dashboard currently uses an in-memory store (`admin-web/src/lib/store.ts`) because
its screens mutate data. It keeps the invariants the database will own — unique vehicle
numbers, and no two live assignments for the same vehicle, worker or route on one day — so
the same errors surface in the UI once the server enforces them for real.

## Known duplication

`types/domain.ts`, `lib/geo.ts`, `lib/time.ts` and the map primitives exist in both apps.
That is deliberate for now: when the Supabase project is created it will generate shared
types, and those files should move into one workspace package at that point rather than
being kept in sync by hand.

## Maps

Google Maps is the visualisation, never the source of truth. The map, marker and route are
created once and mutated; no routing API is called in the live loop. Without an API key both
apps render a clearly labelled schematic preview map driven by the same coordinates, so the
UI is reviewable before a key exists.

## What is deliberately absent

No household quantities, geofences, notifications, ETA or route optimisation. Collection
figures come from a municipal import; when that import has no data, the UI says so instead
of estimating.
