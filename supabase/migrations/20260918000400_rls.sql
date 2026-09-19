-- Row Level Security.
--
-- The shape of it: reference data (areas, wards, routes, vehicles) is readable by anyone
-- signed in, because a vehicle number is painted on the side of the truck. Everything that
-- says who is where — sessions, positions, logs — is readable only by the people entitled
-- to it. No client can write tracking data at all: that goes through the RPCs, which
-- re-derive the worker from the session token.

alter table app_settings             enable row level security;
alter table jurisdictions            enable row level security;
alter table areas                    enable row level security;
alter table wards                    enable row level security;
alter table routes                   enable row level security;
alter table admins                   enable row level security;
alter table workers                  enable row level security;
alter table citizens                 enable row level security;
alter table vehicles                 enable row level security;
alter table assignments              enable row level security;
alter table work_sessions            enable row level security;
alter table vehicle_locations        enable row level security;
alter table vehicle_current_location enable row level security;
alter table vehicle_logs             enable row level security;
alter table daily_collection_summary enable row level security;

-- ---------------------------------------------------------------- reference data

create policy "signed-in users read settings" on app_settings
  for select to authenticated using (true);
create policy "admins manage settings" on app_settings
  for all to authenticated using (is_admin()) with check (is_admin());

create policy "signed-in users read jurisdictions" on jurisdictions
  for select to authenticated using (true);
create policy "admins manage jurisdictions" on jurisdictions
  for all to authenticated using (is_admin()) with check (is_admin());

create policy "signed-in users read areas" on areas
  for select to authenticated using (true);
create policy "admins manage areas" on areas
  for all to authenticated using (is_admin()) with check (is_admin());

create policy "signed-in users read wards" on wards
  for select to authenticated using (true);
create policy "admins manage wards" on wards
  for all to authenticated using (is_admin()) with check (is_admin());

create policy "signed-in users read routes" on routes
  for select to authenticated using (true);
create policy "admins manage routes" on routes
  for all to authenticated using (is_admin()) with check (is_admin());

create policy "signed-in users read vehicles" on vehicles
  for select to authenticated using (true);
create policy "admins manage vehicles" on vehicles
  for all to authenticated using (is_admin()) with check (is_admin());

create policy "signed-in users read collection summary" on daily_collection_summary
  for select to authenticated using (true);
create policy "admins manage collection summary" on daily_collection_summary
  for all to authenticated using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------- people

create policy "admins read themselves" on admins
  for select to authenticated using (id = auth.uid());

-- A worker sees their own record. Residents never see crew names.
create policy "workers read themselves" on workers
  for select to authenticated using (auth_user_id = auth.uid() or is_admin());
create policy "admins manage workers" on workers
  for all to authenticated using (is_admin()) with check (is_admin());

create policy "citizens read their own profile" on citizens
  for select to authenticated using (id = auth.uid() or is_admin());
create policy "citizens create their own profile" on citizens
  for insert to authenticated with check (id = auth.uid());
create policy "citizens update their own profile" on citizens
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------- operations

/**
 * A resident may read the assignment serving their own ward — that is how the app knows
 * which vehicle to track. They cannot see any other ward's, and the worker column is
 * protected separately by the policy on `workers`.
 */
create policy "read assignments you are entitled to" on assignments
  for select to authenticated using (
    is_admin()
    or worker_id = current_worker_id()
    or ward_id = citizen_ward_id()
  );
create policy "admins manage assignments" on assignments
  for all to authenticated using (is_admin()) with check (is_admin());

create policy "read work sessions you are entitled to" on work_sessions
  for select to authenticated using (
    is_admin()
    or worker_id = current_worker_id()
    or exists (
      select 1 from assignments a
      where a.id = work_sessions.assignment_id and a.ward_id = citizen_ward_id()
    )
  );
-- No client-side writes: start_work_session / end_work_session own this table.
create policy "admins correct work sessions" on work_sessions
  for update to authenticated using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------- tracking

/**
 * Raw GPS history is operational data. Staff see all of it, a worker sees their own shift,
 * and residents see none of it — they get the current position only, below.
 */
create policy "read location history you are entitled to" on vehicle_locations
  for select to authenticated using (
    is_admin()
    or exists (
      select 1 from work_sessions s
      where s.id = vehicle_locations.work_session_id and s.worker_id = current_worker_id()
    )
  );

/**
 * The live position. A resident may read it only for the vehicle assigned to their ward
 * today, and only while that assignment is not marked absent — so an absent vehicle cannot
 * leak a position through Realtime either.
 */
create policy "read the current position you are entitled to" on vehicle_current_location
  for select to authenticated using (
    is_admin()
    or exists (
      select 1 from work_sessions s
      where s.id = vehicle_current_location.work_session_id
        and s.worker_id = current_worker_id()
    )
    or exists (
      select 1 from assignments a
      where a.vehicle_id = vehicle_current_location.vehicle_id
        and a.assignment_date = current_date
        and a.status <> 'CANCELLED'
        and not a.is_absent
        and a.ward_id = citizen_ward_id()
    )
  );

create policy "admins read vehicle logs" on vehicle_logs
  for select to authenticated using (is_admin());

-- ---------------------------------------------------------------- grants

grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update on citizens to authenticated;
grant insert, update, delete on
  jurisdictions, areas, wards, routes, vehicles, workers, assignments, app_settings,
  daily_collection_summary
  to authenticated;                       -- gated by the admin policies above
grant update on work_sessions to authenticated;

-- RPCs. Everything a client is allowed to do to tracking data goes through these.
revoke all on function
  start_work_session(uuid),
  end_work_session(uuid, double precision, double precision),
  record_locations(uuid, jsonb),
  ward_tracking(uuid),
  my_assignment_today(),
  fleet_status(),
  prune_vehicle_locations()
  from public, anon;

grant execute on function
  start_work_session(uuid),
  end_work_session(uuid, double precision, double precision),
  record_locations(uuid, jsonb),
  ward_tracking(uuid),
  my_assignment_today(),
  fleet_status()
  to authenticated;

grant execute on function
  current_worker_id(), is_admin(), citizen_ward_id(),
  derive_tracking_state(uuid), ward_assignment_today(uuid), app_setting_int(text, int)
  to authenticated;

-- ---------------------------------------------------------------- realtime

-- Only these three carry live change: where each truck is, and what changed about the day's
-- plan. The raw GPS table is deliberately not published — one row per vehicle is enough.
alter publication supabase_realtime add table vehicle_current_location;
alter publication supabase_realtime add table assignments;
alter publication supabase_realtime add table work_sessions;
