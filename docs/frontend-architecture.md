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

## Two implementations, one surface

Both apps talk to an interface, never to a backend directly:

- The citizen app calls `getDataService()` from `citizen-web/src/lib/data.ts`.
- The dashboard calls `getOps()` from `admin-web/src/lib/ops.ts`.

Each resolves once, from `NEXT_PUBLIC_DATA_SOURCE`, to either the in-browser demo store or
the Supabase client in `packages/core`. No screen knows which answered, which is why the
whole backend swap is a one-line environment change.

Errors follow the same rule. The demo store raises `ServiceError`/`ConflictError` and the
Supabase layer raises `OperationError`; components ask `messageFor(error, fallback)` for a
sentence instead of testing which class it is. `translateError` maps constraint names to
those sentences, so a unique-violation on `vehicles_number_key` reads "This vehicle number
is already registered." and an unrecognised failure shows the fallback rather than raw
PostgREST text.

## Where the shared code lives

`packages/core` holds the domain types, the geo and time helpers, the demo store and feed,
the status derivation, and both Supabase implementations. Both apps depend on it, so there
is one definition of what a vehicle's status means.

## Maps

Google Maps is the visualisation, never the source of truth. The map, marker and route are
created once and mutated; no routing API is called in the live loop. Without an API key both
apps render a clearly labelled schematic preview map driven by the same coordinates, so the
UI is reviewable before a key exists.

## What is deliberately absent

No household quantities, geofences, notifications, ETA or route optimisation. Collection
figures come from a municipal import; when that import has no data, the UI says so instead
of estimating.
