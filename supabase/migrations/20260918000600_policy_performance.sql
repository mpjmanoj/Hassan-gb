-- Two cheap wins the Supabase linter found. Neither changes who can see what — the policy
-- test suite is what proves that.
--
-- 1. `auth.uid()` and the helper functions were being re-evaluated for every row scanned.
--    Wrapping each in a scalar subquery makes Postgres evaluate it once per query. The
--    helpers matter more than auth.uid() here: each one is a SECURITY DEFINER lookup.
-- 2. Seven foreign keys had no covering index, so a delete or a join on the parent had to
--    scan the child table.

-- ---------------------------------------------------------------- policies, rewritten

drop policy "admins read themselves" on admins;
create policy "admins read themselves" on admins
  for select to authenticated using (id = (select auth.uid()));

drop policy "workers read themselves" on workers;
create policy "workers read themselves" on workers
  for select to authenticated using (auth_user_id = (select auth.uid()) or (select is_admin()));
drop policy "admins manage workers" on workers;
create policy "admins manage workers" on workers
  for all to authenticated using ((select is_admin())) with check ((select is_admin()));

drop policy "citizens read their own profile" on citizens;
create policy "citizens read their own profile" on citizens
  for select to authenticated using (id = (select auth.uid()) or (select is_admin()));
drop policy "citizens create their own profile" on citizens;
create policy "citizens create their own profile" on citizens
  for insert to authenticated with check (id = (select auth.uid()));
drop policy "citizens update their own profile" on citizens;
create policy "citizens update their own profile" on citizens
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy "admins manage settings" on app_settings;
create policy "admins manage settings" on app_settings
  for all to authenticated using ((select is_admin())) with check ((select is_admin()));

drop policy "admins manage jurisdictions" on jurisdictions;
create policy "admins manage jurisdictions" on jurisdictions
  for all to authenticated using ((select is_admin())) with check ((select is_admin()));

drop policy "admins manage areas" on areas;
create policy "admins manage areas" on areas
  for all to authenticated using ((select is_admin())) with check ((select is_admin()));

drop policy "admins manage wards" on wards;
create policy "admins manage wards" on wards
  for all to authenticated using ((select is_admin())) with check ((select is_admin()));

drop policy "admins manage routes" on routes;
create policy "admins manage routes" on routes
  for all to authenticated using ((select is_admin())) with check ((select is_admin()));

drop policy "admins manage vehicles" on vehicles;
create policy "admins manage vehicles" on vehicles
  for all to authenticated using ((select is_admin())) with check ((select is_admin()));

drop policy "admins manage collection summary" on daily_collection_summary;
create policy "admins manage collection summary" on daily_collection_summary
  for all to authenticated using ((select is_admin())) with check ((select is_admin()));

drop policy "read assignments you are entitled to" on assignments;
create policy "read assignments you are entitled to" on assignments
  for select to authenticated using (
    (select is_admin())
    or worker_id = (select current_worker_id())
    or ward_id = (select citizen_ward_id())
  );
drop policy "admins manage assignments" on assignments;
create policy "admins manage assignments" on assignments
  for all to authenticated using ((select is_admin())) with check ((select is_admin()));

drop policy "read work sessions you are entitled to" on work_sessions;
create policy "read work sessions you are entitled to" on work_sessions
  for select to authenticated using (
    (select is_admin())
    or worker_id = (select current_worker_id())
    or exists (
      select 1 from assignments a
      where a.id = work_sessions.assignment_id and a.ward_id = (select citizen_ward_id())
    )
  );
drop policy "admins correct work sessions" on work_sessions;
create policy "admins correct work sessions" on work_sessions
  for update to authenticated using ((select is_admin())) with check ((select is_admin()));

drop policy "read location history you are entitled to" on vehicle_locations;
create policy "read location history you are entitled to" on vehicle_locations
  for select to authenticated using (
    (select is_admin())
    or exists (
      select 1 from work_sessions s
      where s.id = vehicle_locations.work_session_id
        and s.worker_id = (select current_worker_id())
    )
  );

drop policy "read the current position you are entitled to" on vehicle_current_location;
create policy "read the current position you are entitled to" on vehicle_current_location
  for select to authenticated using (
    (select is_admin())
    or exists (
      select 1 from work_sessions s
      where s.id = vehicle_current_location.work_session_id
        and s.worker_id = (select current_worker_id())
    )
    or exists (
      select 1 from assignments a
      where a.vehicle_id = vehicle_current_location.vehicle_id
        and a.assignment_date = current_date
        and a.status <> 'CANCELLED'
        and not a.is_absent
        and a.ward_id = (select citizen_ward_id())
    )
  );

drop policy "admins read vehicle logs" on vehicle_logs;
create policy "admins read vehicle logs" on vehicle_logs
  for select to authenticated using ((select is_admin()));

-- ---------------------------------------------------------------- covering indexes

create index if not exists areas_jurisdiction_idx on areas (jurisdiction_id);
create index if not exists citizens_area_idx on citizens (area_id);
create index if not exists daily_summary_ward_idx on daily_collection_summary (ward_id);
create index if not exists vehicle_current_location_session_idx
  on vehicle_current_location (work_session_id);
create index if not exists vehicle_logs_admin_idx on vehicle_logs (admin_id);
create index if not exists vehicle_logs_worker_idx on vehicle_logs (worker_id);
create index if not exists work_sessions_route_idx on work_sessions (route_id);
