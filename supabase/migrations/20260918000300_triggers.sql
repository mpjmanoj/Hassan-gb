-- Rules that must hold no matter which client wrote the row, plus the audit trail.

-- ---------------------------------------------------------------- sign-up wiring

/**
 * Supabase stores a verified phone as '919008800101'. Workers are registered by the
 * municipality before they ever sign in, so first sign-in links the auth user to that row;
 * anyone else who signs in becomes a citizen.
 */
create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_local text := right(regexp_replace(coalesce(new.phone, ''), '\D', '', 'g'), 10);
begin
  if v_local = '' then
    return new;  -- email sign-in (staff) is handled by inserting into admins directly
  end if;

  update workers set auth_user_id = new.id, updated_at = now()
  where phone = v_local and auth_user_id is null;

  if not found then
    insert into citizens (id, phone) values (new.id, v_local)
    on conflict (id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

/**
 * The other order: a worker who tried the app before the ward office registered them already
 * has an auth user, so registering them must adopt it. Without this they would sign in
 * forever with no assignment and no way to start work.
 */
create or replace function link_worker_to_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.auth_user_id is null then
    select u.id into new.auth_user_id
    from auth.users u
    where right(regexp_replace(coalesce(u.phone, ''), '\D', '', 'g'), 10) = new.phone
    limit 1;
  end if;
  return new;
end;
$$;

create trigger workers_link_auth_user
  before insert or update of phone on workers
  for each row execute function link_worker_to_auth_user();

-- ---------------------------------------------------------------- operational guards

/** A truck cannot be taken out of service while it is driving a route. */
-- SECURITY DEFINER on purpose: the guard must see every active assignment, not just the
-- ones the caller's policies would reveal, or a hidden row would let the check pass.
create or replace function guard_vehicle_deactivation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.active and not new.active
     and exists (select 1 from assignments
                 where vehicle_id = new.id and status = 'ACTIVE') then
    raise exception
      'This vehicle is on an active route. End the work session before removing it from service.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger vehicles_guard_deactivation
  before update on vehicles
  for each row execute function guard_vehicle_deactivation();

/** Marking an assignment absent must not leave a session running behind it. */
-- SECURITY DEFINER on purpose: closing the session and clearing the live position are
-- internal consequences of the absence. Staff are not granted write access to either table.
create or replace function handle_assignment_absence()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.is_absent and not old.is_absent then
    update work_sessions
    set status = 'CANCELLED', ended_at = now()
    where assignment_id = new.id and status = 'ACTIVE';

    delete from vehicle_current_location
    where vehicle_id = new.vehicle_id
      and work_session_id in (select id from work_sessions where assignment_id = new.id);
  end if;
  return new;
end;
$$;

create trigger assignments_handle_absence
  after update of is_absent on assignments
  for each row execute function handle_assignment_absence();

-- ---------------------------------------------------------------- audit trail

create or replace function log_vehicle_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid := (select id from admins where id = auth.uid());
begin
  if tg_op = 'INSERT' then
    insert into vehicle_logs (vehicle_id, admin_id, event_type, description)
    values (new.id, v_admin, 'VEHICLE_ADDED', format('%s was added.', new.vehicle_number));
  elsif old.active and not new.active then
    insert into vehicle_logs (vehicle_id, admin_id, event_type, description)
    values (new.id, v_admin, 'VEHICLE_DEACTIVATED',
            format('%s was removed from service.', new.vehicle_number));
  elsif not old.active and new.active then
    insert into vehicle_logs (vehicle_id, admin_id, event_type, description)
    values (new.id, v_admin, 'VEHICLE_REACTIVATED',
            format('%s was returned to service.', new.vehicle_number));
  elsif old.vehicle_number is distinct from new.vehicle_number
     or old.display_name is distinct from new.display_name
     or old.vehicle_type is distinct from new.vehicle_type then
    insert into vehicle_logs (vehicle_id, admin_id, event_type, description)
    values (new.id, v_admin, 'VEHICLE_UPDATED', format('%s was updated.', new.vehicle_number));
  end if;
  return new;
end;
$$;

create trigger vehicles_log_change
  after insert or update on vehicles
  for each row execute function log_vehicle_change();

create or replace function log_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin   uuid := (select id from admins where id = auth.uid());
  v_vehicle text := (select vehicle_number from vehicles where id = new.vehicle_id);
  v_route   text := (select route_name from routes where id = new.route_id);
begin
  if tg_op = 'INSERT' then
    insert into vehicle_logs (vehicle_id, admin_id, event_type, description)
    values (new.vehicle_id, v_admin, 'VEHICLE_ASSIGNED',
            format('%s assigned to %s for %s.', v_vehicle, v_route, new.assignment_date));
  elsif new.is_absent and not old.is_absent then
    insert into vehicle_logs (vehicle_id, admin_id, event_type, description)
    values (new.vehicle_id, v_admin, 'VEHICLE_ABSENT',
            format('%s marked absent for %s%s.', v_vehicle, v_route,
                   coalesce(' — ' || new.absence_reason, '')));
  elsif old.is_absent and not new.is_absent then
    insert into vehicle_logs (vehicle_id, admin_id, event_type, description)
    values (new.vehicle_id, v_admin, 'VEHICLE_RESTORED',
            format('%s restored to %s.', v_vehicle, v_route));
  elsif new.status = 'CANCELLED' and old.status <> 'CANCELLED' then
    insert into vehicle_logs (vehicle_id, admin_id, event_type, description)
    values (new.vehicle_id, v_admin, 'VEHICLE_UNASSIGNED',
            format('Assignment for %s on %s was cancelled.', v_vehicle, v_route));
  end if;
  return new;
end;
$$;

create trigger assignments_log_change
  after insert or update on assignments
  for each row execute function log_assignment_change();
