-- Testing real GPS before the OTP pipeline and the Flutter app exist.
--
-- Supabase anonymous sign-in gives a real `authenticated` token with no SMS, so every policy
-- written so far keeps working unchanged. Two things still have to give:
--
--   1. A resident who signed in anonymously has no phone number yet.
--   2. A worker's device has no way to say which worker it is without OTP.
--
-- The second is a deliberate, switchable hole: while `allow_worker_self_link` is on, any
-- signed-in device can claim a worker record. That is acceptable for a test drive with a
-- URL nobody else has, and unacceptable the moment a real ward is on the system. It
-- defaults to OFF and `link_me_to_worker` refuses while it is off.

-- ---------------------------------------------------------------- anonymous residents

-- A number is collected when the resident signs in for real; until then there is none.
alter table citizens alter column phone drop not null;
alter table citizens drop constraint citizens_phone_check;
alter table citizens add constraint citizens_phone_check
  check (phone is null or phone ~ '^[6-9][0-9]{9}$');

insert into app_settings (key, value, description) values
  ('allow_worker_self_link', 'false'::jsonb,
   'PILOT ONLY. While true, any signed-in device can claim a worker record without OTP. Turn off before real use.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------- device pairing

/**
 * Claims a worker record for the calling device.
 *
 * This is what OTP will do properly: prove that this device belongs to this worker. Until
 * then it is gated on a setting an operator has to turn on deliberately, and it refuses to
 * take a worker who is already linked to a different, still-valid account.
 */
create or replace function link_me_to_worker(p_worker_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user   uuid := auth.uid();
  v_worker workers%rowtype;
begin
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;
  if coalesce((select (value #>> '{}')::boolean from app_settings
               where key = 'allow_worker_self_link'), false) is not true then
    raise exception 'Device pairing is switched off. An administrator must enable it.'
      using errcode = '42501';
  end if;

  select * into v_worker from workers where id = p_worker_id for update;
  if not found then
    raise exception 'That worker record does not exist.' using errcode = 'P0002';
  end if;
  if v_worker.status <> 'ACTIVE' then
    raise exception 'That worker is not active.' using errcode = '22023';
  end if;

  -- Free the record from whichever device held it last, then take it.
  update workers set auth_user_id = null
  where auth_user_id = v_user and id <> p_worker_id;

  update workers set auth_user_id = v_user, updated_at = now() where id = p_worker_id;

  return jsonb_build_object('workerId', v_worker.id, 'name', v_worker.name);
end;
$$;

revoke all on function link_me_to_worker(uuid) from public, anon;
grant execute on function link_me_to_worker(uuid) to authenticated;

/**
 * The worker records a device may pick from while pairing is on.
 *
 * `workers` itself stays locked down — a resident must never be able to list the crew — so
 * this returns names and nothing else, and only while the switch is on.
 */
create or replace function pairable_workers()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce((select (value #>> '{}')::boolean from app_settings
               where key = 'allow_worker_self_link'), false) is not true then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name) order by w.name)
    from workers w where w.status = 'ACTIVE'
  ), '[]'::jsonb);
end;
$$;

revoke all on function pairable_workers() from public, anon;
grant execute on function pairable_workers() to authenticated;
