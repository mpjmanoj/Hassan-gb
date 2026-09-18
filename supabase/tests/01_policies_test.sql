-- Security and invariant tests. Run against a scratch database, never production.
--   psql -f tests/00_local_stubs.sql -f migrations/*.sql -f tests/01_policies_test.sql
-- Any failed assertion aborts the transaction and prints which rule broke.

begin;

-- ---------------------------------------------------------------- fixtures

insert into auth.users (id, phone) values
  ('11111111-1111-1111-1111-111111111111', '919008800101'),  -- Ramesh, worker
  ('22222222-2222-2222-2222-222222222222', '919008800103'),  -- Ravi, worker
  ('33333333-3333-3333-3333-333333333333', '919900000005'),  -- citizen, ward 5
  ('44444444-4444-4444-4444-444444444444', '919900000001');  -- citizen, ward 1
insert into auth.users (id, email) values
  ('55555555-5555-5555-5555-555555555555', 'ops@hassancity.gov.in');

insert into admins (id, name, email) values
  ('55555555-5555-5555-5555-555555555555', 'Ops', 'ops@hassancity.gov.in');

do $$
declare
  v_jur uuid; v_area uuid; v_w1 uuid; v_w5 uuid; v_w6 uuid;
  v_r1 uuid; v_r5 uuid; v_r6 uuid;
  v_v1 uuid; v_v3 uuid;
  v_ramesh uuid; v_ravi uuid;
begin
  insert into jurisdictions (name) values ('Hassan City Municipal Council') returning id into v_jur;
  insert into areas (jurisdiction_id, name) values (v_jur, 'Hassan City') returning id into v_area;

  insert into wards (area_id, ward_number, name) values (v_area, 1, 'Pension Mohalla') returning id into v_w1;
  insert into wards (area_id, ward_number, name) values (v_area, 5, 'Kuvempunagar') returning id into v_w5;
  insert into wards (area_id, ward_number, name) values (v_area, 6, 'Salagame Road') returning id into v_w6;

  insert into routes (ward_id, route_name) values (v_w1, 'Ward 1 Main Route') returning id into v_r1;
  insert into routes (ward_id, route_name) values (v_w5, 'Kuvempunagar Main Route') returning id into v_r5;
  insert into routes (ward_id, route_name) values (v_w6, 'Salagame Road Route') returning id into v_r6;

  insert into vehicles (vehicle_number, display_name) values ('HSN-001', 'Compactor 1') returning id into v_v1;
  insert into vehicles (vehicle_number, display_name, vehicle_type) values ('HSN-003', 'Tipper 3', 'TIPPER') returning id into v_v3;

  -- Ramesh and Ravi both signed in above before this insert — the usual order is the other
  -- way round, so both directions of the link are exercised here.
  insert into workers (name, phone) values ('Ramesh', '9008800101') returning id into v_ramesh;
  insert into workers (name, phone) values ('Ravi', '9008800103') returning id into v_ravi;

  insert into assignments (route_id, ward_id, vehicle_id, worker_id, assignment_date)
  values (v_r1, v_w1, v_v1, v_ramesh, current_date),
         (v_r5, v_w5, v_v3, v_ravi, current_date),
         -- Same truck, same day, a second ward: the wards 3-6 case from the PRD.
         (v_r6, v_w6, v_v3, v_ravi, current_date);

  -- The sign-up trigger already created these rows; the app fills in the ward afterwards.
  update citizens set area_id = v_area, ward_id = v_w5, name = 'Manoj M'
  where id = '33333333-3333-3333-3333-333333333333';
  update citizens set area_id = v_area, ward_id = v_w1, name = 'Asha R'
  where id = '44444444-4444-4444-4444-444444444444';

  assert (select count(*) from citizens) >= 2,
    'the sign-up trigger did not create a citizen row per phone sign-in';
end;
$$;

-- Both linking paths must end in the same place: every worker knows its auth user.
do $$
begin
  assert (select count(*) from workers where auth_user_id is not null) = 2,
    'workers were not linked to their auth users by phone';
  assert (select auth_user_id from workers where phone = '9008800101')
         = '11111111-1111-1111-1111-111111111111',
    'Ramesh linked to the wrong auth user';
end;
$$;

-- Ids captured before any role switch, so the tests can simulate a client that already
-- knows another worker's assignment id rather than one that has to discover it.
create temporary table test_ids as
select
  (select a.id from assignments a join workers w on w.id = a.worker_id where w.name = 'Ramesh') as ramesh_assignment,
  (select a.id from assignments a join workers w on w.id = a.worker_id
    join wards wd on wd.id = a.ward_id where w.name = 'Ravi' and wd.ward_number = 5) as ravi_assignment;
grant select on test_ids to authenticated;

-- ---------------------------------------------------------------- helpers

create or replace function test_sign_in(p_user uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end;
$$;

-- ================================================================ WORKER

set local role authenticated;
select test_sign_in('22222222-2222-2222-2222-222222222222');  -- Ravi

do $$
declare
  v_assignment uuid;
  v_session    uuid;
  v_other      uuid;
  v_result     jsonb;
begin
  -- Ravi sees his own assignment, and only his.
  v_result := my_assignment_today();
  assert v_result is not null, 'worker cannot see their own assignment';
  assert v_result -> 'vehicle' ->> 'vehicleNumber' = 'HSN-003',
    'worker got the wrong vehicle';
  assert (select count(*) from assignments) = 2,
    'a worker can read assignments that are not theirs';
  v_assignment := (select ravi_assignment from test_ids);

  -- Knowing another worker's assignment id must not be enough to start it.
  v_other := (select ramesh_assignment from test_ids);
  begin
    perform start_work_session(v_other);
    assert false, 'a worker was allowed to start another worker''s assignment';
  exception when insufficient_privilege then null;
  end;

  -- Starting his own works.
  v_result := start_work_session(v_assignment);
  v_session := (v_result ->> 'id')::uuid;
  assert v_result ->> 'status' = 'ACTIVE', 'session did not start';
  assert (select status from assignments where id = v_assignment) = 'ACTIVE',
    'assignment was not moved to ACTIVE';

  -- Good fixes are stored; bad ones are dropped without failing the batch.
  v_result := record_locations(v_session, jsonb_build_array(
    jsonb_build_object('lat', 13.0062, 'lng', 76.1023, 'speed', 4.1, 'heading', 87,
                       'accuracy', 6, 'recordedAt', (now() - interval '20 seconds')::text),
    jsonb_build_object('lat', 13.0064, 'lng', 76.1027, 'speed', 4.4, 'heading', 88,
                       'accuracy', 5, 'recordedAt', now()::text),
    jsonb_build_object('lat', 13.0065, 'lng', 76.1028, 'accuracy', 400,
                       'recordedAt', now()::text),                       -- too inaccurate
    jsonb_build_object('lat', 99.0, 'lng', 76.10, 'accuracy', 5,
                       'recordedAt', now()::text),                       -- impossible coords
    jsonb_build_object('lat', 13.0066, 'lng', 76.1029, 'accuracy', 5,
                       'recordedAt', (now() + interval '1 hour')::text)  -- from the future
  ));
  assert (v_result ->> 'accepted')::int = 2,
    format('expected 2 accepted fixes, got %s', v_result ->> 'accepted');
  assert (v_result ->> 'rejected')::int = 3,
    format('expected 3 rejected fixes, got %s', v_result ->> 'rejected');

  -- Replaying the offline buffer must not double-store anything.
  v_result := record_locations(v_session, jsonb_build_array(
    jsonb_build_object('lat', 13.0062, 'lng', 76.1023, 'accuracy', 6,
                       'recordedAt', (now() - interval '20 seconds')::text)));
  assert (v_result ->> 'accepted')::int = 0, 'a replayed fix was stored twice';

  assert (select count(*) from vehicle_locations where work_session_id = v_session) = 2,
    'wrong number of stored fixes';
end;
$$;

-- Ramesh must not be able to post GPS into Ravi's session, even knowing its id.
reset role;
create temporary table test_session as select id from work_sessions limit 1;
grant select on test_session to authenticated;
set local role authenticated;
select test_sign_in('11111111-1111-1111-1111-111111111111');
do $$
declare
  v_session uuid := (select id from test_session);
begin
  assert (select count(*) from work_sessions) = 0,
    'a worker can read another worker''s session';
  begin
    perform record_locations(v_session, jsonb_build_array(
      jsonb_build_object('lat', 13.5, 'lng', 76.5, 'accuracy', 5, 'recordedAt', now()::text)));
    assert false, 'a worker was allowed to post GPS for another worker''s vehicle';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- ================================================================ CITIZEN

select test_sign_in('33333333-3333-3333-3333-333333333333');  -- ward 5
do $$
declare
  v_tracking jsonb := ward_tracking((select id from wards where ward_number = 5));
begin
  assert v_tracking ->> 'state' = 'LIVE',
    format('ward 5 should be LIVE, got %s', v_tracking ->> 'state');
  assert v_tracking -> 'vehicle' ->> 'vehicleNumber' = 'HSN-003', 'wrong vehicle for ward 5';
  assert v_tracking -> 'location' ->> 'lat' is not null, 'no position for a live vehicle';

  -- The live position row is visible to this resident...
  assert (select count(*) from vehicle_current_location) = 1,
    'ward 5 resident cannot see their own vehicle position';
  -- ...but raw GPS history is not.
  assert (select count(*) from vehicle_locations) = 0,
    'a resident can read raw GPS history';
  -- ...and neither are crew names.
  assert (select count(*) from workers) = 0, 'a resident can read worker records';
end;
$$;

select test_sign_in('44444444-4444-4444-4444-444444444444');  -- ward 1, different vehicle
do $$
begin
  assert (select count(*) from vehicle_current_location) = 0,
    'a resident can see the position of a vehicle that does not serve their ward';
  assert (select count(*) from assignments) = 1,
    'a resident can read assignments outside their ward';
end;
$$;

-- ================================================================ ADMIN

select test_sign_in('55555555-5555-5555-5555-555555555555');
do $$
declare
  v_v3      uuid := (select id from vehicles where vehicle_number = 'HSN-003');
  v_ward5   uuid := (select id from wards where ward_number = 5);
  v_asg     uuid := (select id from assignments where ward_id = (select id from wards where ward_number = 5));
  v_fleet   jsonb;
begin
  assert (select count(*) from vehicle_locations) = 2, 'admin cannot read GPS history';
  assert (select count(*) from workers) = 2, 'admin cannot read workers';

  v_fleet := fleet_status();
  assert jsonb_array_length(v_fleet) = 2, 'fleet status should cover every vehicle';

  -- A truck on an active route cannot be taken out of service.
  begin
    update vehicles set active = false where id = v_v3;
    assert false, 'an active vehicle was removed from service';
  exception when others then
    assert sqlerrm like '%active route%', format('unexpected error: %s', sqlerrm);
  end;

  -- Marking absent ends the running session and hides the position.
  update assignments set is_absent = true, status = 'ABSENT', absence_reason = 'Vehicle maintenance'
  where id = v_asg;

  assert (select status from work_sessions where assignment_id = v_asg) = 'CANCELLED',
    'the running session survived an absence';
  assert (select count(*) from vehicle_current_location where vehicle_id = v_v3) = 0,
    'an absent vehicle still exposes a position';

  -- Through the admin's own RPC, not the internal helper: staff have no EXECUTE on that.
  v_fleet := fleet_status();
  assert exists (
    select 1 from jsonb_array_elements(v_fleet) row
    where row ->> 'vehicle_number' = 'HSN-003' and row ->> 'status' = 'ABSENT'
  ), 'the fleet view did not report HSN-003 as absent';

  -- The audit trail recorded it.
  assert exists (select 1 from vehicle_logs where event_type = 'VEHICLE_ABSENT'),
    'the absence was not logged';
  assert exists (select 1 from vehicle_logs where event_type = 'WORK_STARTED'),
    'the work start was not logged';
end;
$$;

-- The resident is told the truth immediately.
select test_sign_in('33333333-3333-3333-3333-333333333333');
do $$
declare
  v_tracking jsonb := ward_tracking((select id from wards where ward_number = 5));
begin
  assert v_tracking ->> 'state' = 'ABSENT',
    format('ward 5 should read ABSENT, got %s', v_tracking ->> 'state');
  assert v_tracking ->> 'absenceReason' = 'Vehicle maintenance', 'the reason was not passed on';
  -- jsonb_build_object turns a SQL null into a JSON null, so check the JSON type.
  assert coalesce(jsonb_typeof(v_tracking -> 'location'), 'null') = 'null',
    format('an absent vehicle leaked a position to a resident: %s', v_tracking -> 'location');
end;
$$;

-- ================================================================ INVARIANTS

reset role;
do $$
declare
  v_r5    uuid := (select id from routes where route_name = 'Kuvempunagar Main Route');
  v_w5    uuid := (select id from wards where ward_number = 5);
  v_v1    uuid := (select id from vehicles where vehicle_number = 'HSN-001');
  v_ramesh uuid := (select id from workers where name = 'Ramesh');
begin
  -- One route, one vehicle, one day.
  begin
    insert into assignments (route_id, ward_id, vehicle_id, worker_id, assignment_date)
    values (v_r5, v_w5, v_v1, v_ramesh, current_date);
    assert false, 'a route was assigned twice on the same day';
  exception when unique_violation then null;
  end;

  -- But one vehicle may hold several assignments in a day, as long as one is driving.
  assert (select count(*) from assignments
          where vehicle_id = (select id from vehicles where vehicle_number = 'HSN-003')) = 2,
    'the multi-ward assignment case was lost';

  -- An absence and a live status cannot coexist.
  begin
    update assignments set status = 'ACTIVE' where is_absent;
    assert false, 'an absent assignment was allowed to go ACTIVE';
  exception when check_violation then null;
  end;
end;
$$;

-- A fix that ages past the window stops being LIVE without anyone touching a row.
do $$
declare
  v_asg uuid := (select id from assignments where ward_id = (select id from wards where ward_number = 1));
  v_ses uuid;
begin
  insert into work_sessions (assignment_id, vehicle_id, worker_id, route_id, status)
  select a.id, a.vehicle_id, a.worker_id, a.route_id, 'ACTIVE' from assignments a where a.id = v_asg
  returning id into v_ses;
  update assignments set status = 'ACTIVE' where id = v_asg;

  insert into vehicle_current_location (vehicle_id, work_session_id, latitude, longitude, recorded_at)
  select vehicle_id, v_ses, 13.01, 76.09, now() from work_sessions where id = v_ses;
  assert derive_tracking_state(v_asg) = 'LIVE', 'a fresh fix did not read LIVE';

  update vehicle_current_location set recorded_at = now() - interval '5 minutes'
  where work_session_id = v_ses;
  assert derive_tracking_state(v_asg) = 'CONNECTION_LOST',
    'a stale fix still reads LIVE — the freshness rule is not working';
end;
$$;

-- ================================================================ API SURFACE
--
-- Postgres grants EXECUTE to PUBLIC by default and PostgREST publishes the public schema,
-- so anything not explicitly revoked is reachable at /rest/v1/rpc/<name>. These two
-- bypass RLS, so an anonymous caller holding EXECUTE could read a ward's status without
-- signing in. This is the regression test for exactly that.

do $$
declare
  v_leaked text;
begin
  select string_agg(p.proname, ', ') into v_leaked
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and has_function_privilege('anon', p.oid, 'EXECUTE')
    and p.proname <> 'test_sign_in'
    -- Extension-owned functions (pgcrypto and friends) are not ours to grant or revoke.
    and not exists (
      select 1 from pg_depend d
      where d.objid = p.oid and d.deptype = 'e'
    );
  assert v_leaked is null,
    format('these functions are callable without signing in: %s', v_leaked);

  -- Signed-in users get the RPCs their app calls, and nothing else.
  select string_agg(p.proname, ', ') into v_leaked
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
    and p.proname not in (
      'ward_tracking', 'my_assignment_today', 'start_work_session', 'end_work_session',
      'record_locations', 'fleet_status',
      -- called by RLS policies, which are evaluated with the caller's privileges
      'current_worker_id', 'is_admin', 'citizen_ward_id',
      'test_sign_in'
    )
    and not exists (
      select 1 from pg_depend d
      where d.objid = p.oid and d.deptype = 'e'
    );
  assert v_leaked is null,
    format('these functions are exposed to signed-in users but should not be: %s', v_leaked);
end;
$$;

select 'ALL POLICY AND INVARIANT TESTS PASSED' as result;

rollback;
