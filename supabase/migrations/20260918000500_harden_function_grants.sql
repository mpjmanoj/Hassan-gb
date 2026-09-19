-- Close the default EXECUTE grant on functions the API should never expose.
--
-- Postgres grants EXECUTE on a new function to PUBLIC, and PostgREST publishes everything in
-- the `public` schema as /rest/v1/rpc/<name>. The first RLS migration revoked the seven RPCs
-- it named, but not these — which left `ward_assignment_today` and `derive_tracking_state`,
-- both SECURITY DEFINER and therefore RLS-bypassing, callable by an anonymous visitor. That
-- is enough to learn whether a ward's collection is running without signing in.
--
-- The rule now: a function is callable only if something actually needs to call it.

-- Internal helpers: used inside other SECURITY DEFINER functions, which run as the owner
-- and do not need the caller to hold EXECUTE.
revoke all on function
  derive_tracking_state(uuid),
  ward_assignment_today(uuid),
  app_setting_int(text, int)
  from public, anon, authenticated;

-- Retention deletes GPS history. It is maintenance, run by a scheduler or an operator with
-- direct database access — never something a signed-in resident can invoke from a browser.
revoke all on function prune_vehicle_locations() from public, anon, authenticated;

-- Trigger functions are not an API. Calling one directly fails anyway, but it should not be
-- reachable in the first place.
revoke all on function
  handle_new_auth_user(),
  link_worker_to_auth_user(),
  guard_vehicle_deactivation(),
  handle_assignment_absence(),
  log_vehicle_change(),
  log_assignment_change(),
  set_updated_at()
  from public, anon, authenticated;

-- These three stay callable by signed-in users because the RLS policies call them, and a
-- policy expression is evaluated with the caller's privileges. They are harmless to an
-- anonymous caller (auth.uid() is null, so they return null or false) but there is no
-- reason to publish them, so anon loses them.
revoke all on function current_worker_id(), is_admin(), citizen_ward_id() from public, anon;
grant execute on function current_worker_id(), is_admin(), citizen_ward_id() to authenticated;

-- A function without a fixed search_path can be steered by whatever the caller sets.
-- Every other function already pins it; these two were missed.
create or replace function set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function app_setting_int(p_key text, p_fallback int)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select (value #>> '{}')::int from app_settings where key = p_key), p_fallback);
$$;

-- `create or replace` restores the default PUBLIC grant, so take it away again.
revoke all on function set_updated_at(), app_setting_int(text, int) from public, anon, authenticated;
