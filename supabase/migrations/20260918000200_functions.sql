-- Identity helpers, derived status, and every write a worker is allowed to make.
--
-- The frontend is never the authority for who a worker is or which vehicle they drive.
-- Each RPC re-derives that from the session token and refuses anything else.

-- ---------------------------------------------------------------- identity

create or replace function current_worker_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id from workers where auth_user_id = auth.uid() and status = 'ACTIVE';
$$;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from admins where id = auth.uid());
$$;

create or replace function citizen_ward_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select ward_id from citizens where id = auth.uid();
$$;

-- ---------------------------------------------------------------- derived status

/**
 * The single definition of a vehicle's state, used by citizens and staff alike so the two
 * can never be shown different truths about the same truck.
 */
create or replace function derive_tracking_state(p_assignment_id uuid)
returns tracking_state
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_assignment assignments%rowtype;
  v_session    work_sessions%rowtype;
  v_recorded   timestamptz;
  v_window     int := app_setting_int('live_window_seconds', 45);
begin
  if p_assignment_id is null then return 'NO_ROUTE'; end if;

  select * into v_assignment from assignments where id = p_assignment_id;
  if not found or v_assignment.status = 'CANCELLED' then return 'NO_ROUTE'; end if;

  -- An absence outranks everything the device might be reporting.
  if v_assignment.is_absent or v_assignment.status = 'ABSENT' then return 'ABSENT'; end if;

  select * into v_session from work_sessions where assignment_id = p_assignment_id;
  if not found then return 'NOT_STARTED'; end if;
  if v_session.status = 'COMPLETED' then return 'COMPLETED'; end if;
  -- A cancelled session is not a finished collection: the crew can still start.
  if v_session.status = 'CANCELLED' then return 'NOT_STARTED'; end if;

  select recorded_at into v_recorded
  from vehicle_current_location where vehicle_id = v_assignment.vehicle_id;

  if v_recorded is null then return 'NOT_STARTED'; end if;
  if now() - v_recorded > make_interval(secs => v_window) then return 'CONNECTION_LOST'; end if;
  return 'LIVE';
end;
$$;

/** Today's assignment for a ward, or null. */
create or replace function ward_assignment_today(p_ward_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id
  from assignments
  where ward_id = p_ward_id
    and assignment_date = current_date
    and status <> 'CANCELLED'
  order by case status when 'ACTIVE' then 0 when 'ABSENT' then 1 when 'SCHEDULED' then 2 else 3 end
  limit 1;
$$;

-- ---------------------------------------------------------------- citizen read

/**
 * Everything the citizen home screen needs, in one call.
 *
 * Deliberately returns no worker identity: a resident needs to know the vehicle and when it
 * will reach them, not who is driving.
 */
create or replace function ward_tracking(p_ward_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_assignment_id uuid := ward_assignment_today(p_ward_id);
  v_state         tracking_state := derive_tracking_state(v_assignment_id);
  v_result        jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in to see collection details.' using errcode = '28000';
  end if;

  select jsonb_build_object(
    'ward', jsonb_build_object('id', w.id, 'wardNumber', w.ward_number, 'name', w.name),
    'area', jsonb_build_object('id', ar.id, 'name', ar.name),
    'state', v_state,
    'route', case when r.id is null then null else
      jsonb_build_object('id', r.id, 'routeName', r.route_name, 'routeGeometry', r.route_geometry) end,
    'vehicle', case when v.id is null then null else
      jsonb_build_object('id', v.id, 'vehicleNumber', v.vehicle_number, 'vehicleType', v.vehicle_type) end,
    'absenceReason', a.absence_reason,
    'startedAt', s.started_at,
    'endedAt', s.ended_at,
    'location', case when loc.vehicle_id is null then null else
      jsonb_build_object(
        'lat', loc.latitude, 'lng', loc.longitude, 'speed', loc.speed,
        'heading', loc.heading, 'accuracy', loc.accuracy, 'recordedAt', loc.recorded_at) end
  )
  into v_result
  from wards w
  join areas ar on ar.id = w.area_id
  left join assignments a on a.id = v_assignment_id
  left join routes r on r.id = a.route_id
  left join vehicles v on v.id = a.vehicle_id
  left join work_sessions s on s.assignment_id = a.id
  -- A vehicle marked absent must not leak a position, even if one is stored.
  left join vehicle_current_location loc
    on loc.vehicle_id = v.id and v_state in ('LIVE', 'CONNECTION_LOST')
  where w.id = p_ward_id;

  if v_result is null then
    raise exception 'We could not find that ward.' using errcode = 'P0002';
  end if;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------- worker writes

/** The worker's assignment for today, whatever screen they are on. */
create or replace function my_assignment_today()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker uuid := current_worker_id();
  v_result jsonb;
begin
  if v_worker is null then
    raise exception 'This number is not registered as a collection worker.' using errcode = '28000';
  end if;

  select jsonb_build_object(
    'assignmentId', a.id,
    'assignmentDate', a.assignment_date,
    'status', a.status,
    'isAbsent', a.is_absent,
    'vehicle', jsonb_build_object('id', v.id, 'vehicleNumber', v.vehicle_number),
    'route', jsonb_build_object('id', r.id, 'routeName', r.route_name, 'routeGeometry', r.route_geometry),
    'ward', jsonb_build_object('id', w.id, 'wardNumber', w.ward_number, 'name', w.name),
    'worker', jsonb_build_object('id', wk.id, 'name', wk.name),
    'session', case when s.id is null then null else
      jsonb_build_object('id', s.id, 'status', s.status, 'startedAt', s.started_at) end
  )
  into v_result
  from assignments a
  join vehicles v on v.id = a.vehicle_id
  join routes r on r.id = a.route_id
  join wards w on w.id = a.ward_id
  join workers wk on wk.id = a.worker_id
  left join work_sessions s on s.assignment_id = a.id
  where a.worker_id = v_worker
    and a.assignment_date = current_date
    and a.status <> 'CANCELLED'
  order by case a.status when 'ACTIVE' then 0 when 'SCHEDULED' then 1 else 2 end
  limit 1;

  return v_result;  -- null means: nothing assigned today
end;
$$;

/**
 * Start Work. Everything is re-checked here because the phone cannot be trusted:
 * the worker must own the assignment, it must be today's, it must not be absent,
 * and the vehicle must still be in service.
 */
create or replace function start_work_session(p_assignment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker     uuid := current_worker_id();
  v_assignment assignments%rowtype;
  v_session    work_sessions%rowtype;
begin
  if v_worker is null then
    raise exception 'This number is not registered as a collection worker.' using errcode = '28000';
  end if;

  select * into v_assignment from assignments where id = p_assignment_id for update;
  if not found then
    raise exception 'That assignment no longer exists.' using errcode = 'P0002';
  end if;
  if v_assignment.worker_id <> v_worker then
    raise exception 'This route is assigned to another worker.' using errcode = '42501';
  end if;
  if v_assignment.assignment_date <> current_date then
    raise exception 'This assignment is not for today.' using errcode = '22007';
  end if;
  if v_assignment.is_absent then
    raise exception 'This vehicle is marked unavailable today. Contact the ward office.'
      using errcode = '22023';
  end if;
  if v_assignment.status = 'COMPLETED' then
    raise exception 'This route has already been completed today.' using errcode = '22023';
  end if;
  if not exists (select 1 from vehicles where id = v_assignment.vehicle_id and active) then
    raise exception 'This vehicle is not in service.' using errcode = '22023';
  end if;

  insert into work_sessions (assignment_id, vehicle_id, worker_id, route_id, status)
  values (v_assignment.id, v_assignment.vehicle_id, v_assignment.worker_id,
          v_assignment.route_id, 'ACTIVE')
  on conflict (assignment_id) do update
    set status = 'ACTIVE', started_at = now(), ended_at = null
  returning * into v_session;

  update assignments set status = 'ACTIVE' where id = v_assignment.id;

  insert into vehicle_logs (vehicle_id, worker_id, event_type, description)
  select v_assignment.vehicle_id, v_worker, 'WORK_STARTED',
         format('%s started %s on %s.', wk.name, v.vehicle_number, r.route_name)
  from workers wk, vehicles v, routes r
  where wk.id = v_worker and v.id = v_assignment.vehicle_id and r.id = v_assignment.route_id;

  return jsonb_build_object('id', v_session.id, 'status', v_session.status,
                            'startedAt', v_session.started_at);
end;
$$;

create or replace function end_work_session(
  p_session_id uuid,
  p_latitude   double precision default null,
  p_longitude  double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker  uuid := current_worker_id();
  v_session work_sessions%rowtype;
begin
  select * into v_session from work_sessions where id = p_session_id for update;
  if not found then
    raise exception 'That work session no longer exists.' using errcode = 'P0002';
  end if;
  if v_session.worker_id <> v_worker and not is_admin() then
    raise exception 'This session belongs to another worker.' using errcode = '42501';
  end if;
  if v_session.status <> 'ACTIVE' then
    return jsonb_build_object('id', v_session.id, 'status', v_session.status);
  end if;

  update work_sessions
  set status = 'COMPLETED', ended_at = now(),
      end_latitude = p_latitude, end_longitude = p_longitude
  where id = p_session_id
  returning * into v_session;

  update assignments set status = 'COMPLETED' where id = v_session.assignment_id;
  -- Tracking stops: the vehicle should not keep showing a position once the shift ends.
  delete from vehicle_current_location where vehicle_id = v_session.vehicle_id;

  insert into vehicle_logs (vehicle_id, worker_id, event_type, description)
  select v_session.vehicle_id, v_session.worker_id, 'WORK_ENDED',
         format('%s ended %s on %s.', wk.name, v.vehicle_number, r.route_name)
  from workers wk, vehicles v, routes r
  where wk.id = v_session.worker_id and v.id = v_session.vehicle_id and r.id = v_session.route_id;

  return jsonb_build_object('id', v_session.id, 'status', v_session.status,
                            'endedAt', v_session.ended_at);
end;
$$;

/**
 * GPS ingest, including replay of an offline buffer.
 *
 * Points arrive as [{"lat":..,"lng":..,"speed":..,"heading":..,"accuracy":..,"recordedAt":".."}].
 * The vehicle and worker are taken from the session, never from the payload, so a malicious
 * client cannot post a position as somebody else's truck. Bad points are counted and dropped
 * rather than failing the batch, so one poor fix never blocks a queue from draining.
 */
create or replace function record_locations(p_session_id uuid, p_points jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker       uuid := current_worker_id();
  v_session      work_sessions%rowtype;
  v_point        jsonb;
  v_recorded     timestamptz;
  v_lat          double precision;
  v_lng          double precision;
  v_accuracy     double precision;
  v_max_accuracy int := app_setting_int('max_accuracy_meters', 100);
  v_min_gap      int := app_setting_int('min_location_interval_seconds', 4);
  v_last         timestamptz;
  v_accepted     int := 0;
  v_rejected     int := 0;
begin
  if jsonb_typeof(p_points) <> 'array' then
    raise exception 'Location payload must be an array.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_points) > 500 then
    raise exception 'Too many points in one batch.' using errcode = '22023';
  end if;

  select * into v_session from work_sessions where id = p_session_id;
  if not found then
    raise exception 'That work session no longer exists.' using errcode = 'P0002';
  end if;
  if v_session.worker_id <> v_worker then
    raise exception 'This session belongs to another worker.' using errcode = '42501';
  end if;
  if v_session.status <> 'ACTIVE' then
    raise exception 'This work session has ended.' using errcode = '22023';
  end if;

  select max(recorded_at) into v_last from vehicle_locations where work_session_id = p_session_id;

  for v_point in select * from jsonb_array_elements(p_points) loop
    begin
      v_lat      := (v_point ->> 'lat')::double precision;
      v_lng      := (v_point ->> 'lng')::double precision;
      v_accuracy := nullif(v_point ->> 'accuracy', '')::double precision;
      v_recorded := (v_point ->> 'recordedAt')::timestamptz;
    exception when others then
      v_rejected := v_rejected + 1;
      continue;
    end;

    if v_lat is null or v_lng is null or v_recorded is null
       or v_lat not between -90 and 90 or v_lng not between -180 and 180
       -- A fix from the future, or from before the shift, is not a real fix.
       or v_recorded > now() + interval '2 minutes'
       or v_recorded < v_session.started_at - interval '5 minutes'
       or (v_accuracy is not null and v_accuracy > v_max_accuracy)
       -- Throttle: bound write volume regardless of what the device chooses to send.
       or (v_last is not null and v_recorded <= v_last + make_interval(secs => v_min_gap))
    then
      v_rejected := v_rejected + 1;
      continue;
    end if;

    insert into vehicle_locations (
      vehicle_id, work_session_id, latitude, longitude, speed, heading, accuracy, recorded_at)
    values (
      v_session.vehicle_id, v_session.id, v_lat, v_lng,
      nullif(v_point ->> 'speed', '')::double precision,
      nullif(v_point ->> 'heading', '')::double precision,
      v_accuracy, v_recorded)
    on conflict (work_session_id, recorded_at) do nothing;

    if found then
      v_accepted := v_accepted + 1;
      v_last := v_recorded;
    else
      v_rejected := v_rejected + 1;   -- a replayed duplicate
    end if;
  end loop;

  -- Keep the read-side row on the newest fix only.
  insert into vehicle_current_location as c (
    vehicle_id, work_session_id, latitude, longitude, speed, heading, accuracy, recorded_at)
  select l.vehicle_id, l.work_session_id, l.latitude, l.longitude, l.speed, l.heading,
         l.accuracy, l.recorded_at
  from vehicle_locations l
  where l.work_session_id = p_session_id
  order by l.recorded_at desc
  limit 1
  on conflict (vehicle_id) do update
    set work_session_id = excluded.work_session_id,
        latitude = excluded.latitude, longitude = excluded.longitude,
        speed = excluded.speed, heading = excluded.heading, accuracy = excluded.accuracy,
        recorded_at = excluded.recorded_at, updated_at = now()
    where excluded.recorded_at > c.recorded_at;

  return jsonb_build_object('accepted', v_accepted, 'rejected', v_rejected);
end;
$$;

-- ---------------------------------------------------------------- admin read

create or replace function fleet_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not is_admin() then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(row_to_json(t) order by t.vehicle_number)
    from (
      select
        v.id as vehicle_id, v.vehicle_number, v.display_name, v.vehicle_type, v.active,
        a.id as assignment_id, a.status as assignment_status, a.is_absent, a.absence_reason,
        r.route_name, w.ward_number, w.name as ward_name,
        wk.name as worker_name,
        s.id as session_id, s.started_at, s.status as session_status,
        loc.latitude, loc.longitude, loc.speed, loc.heading, loc.accuracy, loc.recorded_at,
        case
          when not v.active then 'INACTIVE'
          when a.id is null then 'UNASSIGNED'
          else derive_tracking_state(a.id)::text
        end as status
      from vehicles v
      left join lateral (
        select * from assignments a2
        where a2.vehicle_id = v.id
          and a2.assignment_date = current_date
          and a2.status <> 'CANCELLED'
        order by case a2.status
                   when 'ACTIVE' then 0 when 'ABSENT' then 1 when 'SCHEDULED' then 2 else 3 end
        limit 1
      ) a on true
      left join routes r on r.id = a.route_id
      left join wards w on w.id = a.ward_id
      left join workers wk on wk.id = a.worker_id
      left join work_sessions s on s.assignment_id = a.id
      left join vehicle_current_location loc on loc.vehicle_id = v.id
    ) t
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------- retention

/** Raw high-frequency GPS ages out; sessions and summaries are kept. */
create or replace function prune_vehicle_locations()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_days    int := app_setting_int('location_retention_days', 90);
  v_deleted int;
begin
  delete from vehicle_locations
  where recorded_at < now() - make_interval(days => v_days);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
