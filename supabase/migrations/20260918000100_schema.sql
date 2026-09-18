-- Swachhata Hasan — core operational schema.
--
-- Design rules this encodes, from the PRD:
--   * A ward is never permanently tied to a vehicle. Assignment is per operating day.
--   * One vehicle may serve several wards in a day, through several routes, one at a time.
--   * Vehicle status is derived from assignment + session + GPS freshness. It is never stored.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enumerations

create type entity_status as enum ('ACTIVE', 'INACTIVE');
create type vehicle_type as enum ('COMPACTOR', 'TIPPER', 'AUTO_TIPPER');
create type admin_role as enum ('SUPER_ADMIN', 'OPERATIONS');

create type assignment_status as enum ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'ABSENT');
create type work_session_status as enum ('ACTIVE', 'COMPLETED', 'CANCELLED');

create type vehicle_log_event as enum (
  'VEHICLE_ADDED', 'VEHICLE_UPDATED', 'VEHICLE_DEACTIVATED', 'VEHICLE_REACTIVATED',
  'VEHICLE_ABSENT', 'VEHICLE_RESTORED', 'VEHICLE_ASSIGNED', 'VEHICLE_UNASSIGNED',
  'WORK_STARTED', 'WORK_ENDED'
);

/**
 * What a citizen is told about their ward's vehicle. Derived, never stored:
 *   NO_ROUTE        no assignment for today
 *   ABSENT          assignment marked absent — never LIVE, whatever GPS says
 *   NOT_STARTED     assigned, crew has not begun
 *   LIVE            active session with a fix inside the freshness window
 *   CONNECTION_LOST active session, newest fix is older than the window
 *   COMPLETED       session ended
 */
create type tracking_state as enum (
  'NO_ROUTE', 'ABSENT', 'NOT_STARTED', 'LIVE', 'CONNECTION_LOST', 'COMPLETED'
);

-- ---------------------------------------------------------------- settings

-- Operational tuning the municipality can change without a deploy.
create table app_settings (
  key         text primary key,
  value       jsonb       not null,
  description text,
  updated_at  timestamptz not null default now()
);

insert into app_settings (key, value, description) values
  ('live_window_seconds', '45'::jsonb,
   'A vehicle is LIVE only while its newest stored fix is younger than this.'),
  ('min_location_interval_seconds', '4'::jsonb,
   'Fixes closer together than this are dropped server-side to bound write volume.'),
  ('max_accuracy_meters', '100'::jsonb,
   'Fixes wider than this are rejected at ingest.'),
  ('location_retention_days', '90'::jsonb,
   'Raw high-frequency GPS older than this may be pruned. Summaries are kept longer.');

create or replace function app_setting_int(p_key text, p_fallback int)
returns int
language sql
stable
as $$
  select coalesce((select (value #>> '{}')::int from app_settings where key = p_key), p_fallback);
$$;

-- ---------------------------------------------------------------- service area

create table jurisdictions (
  id         uuid primary key default gen_random_uuid(),
  name       text          not null,
  status     entity_status not null default 'ACTIVE',
  created_at timestamptz   not null default now()
);

create table areas (
  id              uuid primary key default gen_random_uuid(),
  jurisdiction_id uuid          not null references jurisdictions (id) on delete restrict,
  name            text          not null,
  status          entity_status not null default 'ACTIVE',
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now()
);

create table wards (
  id          uuid primary key default gen_random_uuid(),
  area_id     uuid          not null references areas (id) on delete restrict,
  ward_number int           not null check (ward_number > 0),
  name        text          not null,
  status      entity_status not null default 'ACTIVE',
  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now(),
  unique (area_id, ward_number)
);

create table routes (
  id         uuid primary key default gen_random_uuid(),
  ward_id    uuid          not null references wards (id) on delete restrict,
  route_name text          not null,
  -- Ordered [{"lat":..,"lng":..}, ...]. PostGIS can replace this for road matching
  -- later without touching anything that reads a route by id.
  route_geometry jsonb     not null default '[]'::jsonb,
  status     entity_status not null default 'ACTIVE',
  created_at timestamptz   not null default now(),
  updated_at timestamptz   not null default now()
);

create index routes_ward_idx on routes (ward_id);

-- ---------------------------------------------------------------- people and fleet

create table admins (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text        not null,
  email      text        not null unique,
  role       admin_role  not null default 'OPERATIONS',
  created_at timestamptz not null default now()
);

create table workers (
  id           uuid primary key default gen_random_uuid(),
  -- Filled in when the worker first signs in with this phone number.
  auth_user_id uuid unique references auth.users (id) on delete set null,
  name         text          not null,
  phone        text          not null unique check (phone ~ '^[6-9][0-9]{9}$'),
  status       entity_status not null default 'ACTIVE',
  created_at   timestamptz   not null default now(),
  updated_at   timestamptz   not null default now()
);

create table citizens (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text        not null default '',
  phone      text        not null unique check (phone ~ '^[6-9][0-9]{9}$'),
  area_id    uuid references areas (id) on delete set null,
  ward_id    uuid references wards (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index citizens_ward_idx on citizens (ward_id);

create table vehicles (
  id             uuid primary key default gen_random_uuid(),
  vehicle_number text         not null,
  display_name   text         not null default '',
  vehicle_type   vehicle_type not null default 'COMPACTOR',
  active         boolean      not null default true,
  created_at     timestamptz  not null default now(),
  updated_at     timestamptz  not null default now()
);

-- "hsn-001" and "HSN-001" are the same truck.
create unique index vehicles_number_key on vehicles (upper(vehicle_number));

-- ---------------------------------------------------------------- operations

create table assignments (
  id              uuid primary key default gen_random_uuid(),
  route_id        uuid              not null references routes (id) on delete restrict,
  ward_id         uuid              not null references wards (id) on delete restrict,
  vehicle_id      uuid              not null references vehicles (id) on delete restrict,
  worker_id       uuid              not null references workers (id) on delete restrict,
  assignment_date date              not null,
  status          assignment_status not null default 'SCHEDULED',
  is_absent       boolean           not null default false,
  absence_reason  text,
  created_at      timestamptz       not null default now(),
  updated_at      timestamptz       not null default now(),

  -- An absence and a live assignment are contradictory states.
  constraint absence_is_consistent check (
    (is_absent and status = 'ABSENT') or (not is_absent and status <> 'ABSENT')
  ),
  constraint reason_needs_absence check (absence_reason is null or is_absent)
);

-- A route is served by one vehicle on a given day.
create unique index assignments_one_per_route_day
  on assignments (route_id, assignment_date)
  where status <> 'CANCELLED';

-- A vehicle may hold several assignments in a day (wards 3-6 on one truck), but it can
-- only be driving one of them at a time. Same for the worker at the wheel.
create unique index assignments_one_active_per_vehicle
  on assignments (vehicle_id) where status = 'ACTIVE';
create unique index assignments_one_active_per_worker
  on assignments (worker_id) where status = 'ACTIVE';

create index assignments_ward_date_idx on assignments (ward_id, assignment_date);
create index assignments_date_idx on assignments (assignment_date);

create table work_sessions (
  id              uuid primary key default gen_random_uuid(),
  assignment_id   uuid                not null unique references assignments (id) on delete cascade,
  vehicle_id      uuid                not null references vehicles (id) on delete restrict,
  worker_id       uuid                not null references workers (id) on delete restrict,
  route_id        uuid                not null references routes (id) on delete restrict,
  started_at      timestamptz         not null default now(),
  ended_at        timestamptz,
  status          work_session_status not null default 'ACTIVE',
  start_latitude  double precision,
  start_longitude double precision,
  end_latitude    double precision,
  end_longitude   double precision,
  created_at      timestamptz         not null default now(),
  updated_at      timestamptz         not null default now(),

  constraint ended_session_has_end_time check (
    (status = 'ACTIVE' and ended_at is null) or (status <> 'ACTIVE' and ended_at is not null)
  ),
  constraint ends_after_it_starts check (ended_at is null or ended_at >= started_at)
);

create unique index work_sessions_one_active_per_vehicle
  on work_sessions (vehicle_id) where status = 'ACTIVE';
create unique index work_sessions_one_active_per_worker
  on work_sessions (worker_id) where status = 'ACTIVE';

-- ---------------------------------------------------------------- tracking

create table vehicle_locations (
  id               bigint generated always as identity primary key,
  vehicle_id       uuid             not null references vehicles (id) on delete cascade,
  work_session_id  uuid             not null references work_sessions (id) on delete cascade,
  latitude         double precision not null check (latitude between -90 and 90),
  longitude        double precision not null check (longitude between -180 and 180),
  speed            double precision check (speed >= 0 and speed < 90),   -- m/s
  heading          double precision check (heading >= 0 and heading < 360),
  accuracy         double precision check (accuracy >= 0),               -- metres
  recorded_at      timestamptz      not null,
  created_at       timestamptz      not null default now()
);

create index vehicle_locations_session_idx on vehicle_locations (work_session_id, recorded_at desc);
create index vehicle_locations_vehicle_idx on vehicle_locations (vehicle_id, recorded_at desc);
-- Offline buffers replay, so the same fix can arrive twice.
create unique index vehicle_locations_no_duplicates
  on vehicle_locations (work_session_id, recorded_at);

/**
 * The newest accepted fix per vehicle, kept as its own row.
 *
 * Citizens and the fleet map read this, not the history table: it stays small, it is cheap
 * to index, and Realtime on it carries one row per vehicle instead of the whole GPS stream.
 */
create table vehicle_current_location (
  vehicle_id      uuid primary key references vehicles (id) on delete cascade,
  work_session_id uuid             not null references work_sessions (id) on delete cascade,
  latitude        double precision not null,
  longitude       double precision not null,
  speed           double precision,
  heading         double precision,
  accuracy        double precision,
  recorded_at     timestamptz      not null,
  updated_at      timestamptz      not null default now()
);

create table vehicle_logs (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid references vehicles (id) on delete set null,
  admin_id    uuid references admins (id) on delete set null,
  worker_id   uuid references workers (id) on delete set null,
  event_type  vehicle_log_event not null,
  description text              not null,
  created_at  timestamptz       not null default now()
);

create index vehicle_logs_vehicle_idx on vehicle_logs (vehicle_id, created_at desc);
create index vehicle_logs_created_idx on vehicle_logs (created_at desc);

-- ---------------------------------------------------------------- municipal data

-- Supplied by the municipality's daily import. Never computed from tracking.
create table daily_collection_summary (
  id             uuid primary key default gen_random_uuid(),
  summary_date   date    not null,
  ward_id        uuid references wards (id) on delete cascade,
  collected_kg   numeric(10, 2) not null check (collected_kg >= 0),
  disposed_kg    numeric(10, 2) not null check (disposed_kg >= 0),
  source         text    not null default 'MANUAL_IMPORT',
  created_at     timestamptz not null default now()
);

-- One row per ward per day, plus one city-wide row where ward_id is null.
create unique index daily_summary_ward_day on daily_collection_summary (summary_date, ward_id)
  where ward_id is not null;
create unique index daily_summary_city_day on daily_collection_summary (summary_date)
  where ward_id is null;

-- ---------------------------------------------------------------- housekeeping

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'areas', 'wards', 'routes', 'workers', 'citizens', 'vehicles', 'assignments', 'work_sessions'
  ] loop
    execute format(
      'create trigger %1$s_set_updated_at before update on %1$s
         for each row execute function set_updated_at()', t);
  end loop;
end;
$$;
