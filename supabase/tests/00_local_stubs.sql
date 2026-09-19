-- LOCAL TESTING ONLY. Never run this on Supabase — it already provides all of this.
-- It fakes just enough of GoTrue for the migrations to apply and the policies to be exercised.

create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  phone text unique,
  email text unique
);

-- The signed-in user id, taken from a session setting the tests set by hand.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end;
$$;

-- Supabase lets signed-in roles call auth.uid() directly; policies and app code both do.
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid(), auth.role() to anon, authenticated;
grant select on auth.users to anon, authenticated;

/**
 * Supabase grants anon and authenticated EXECUTE on every function created in `public`,
 * through default privileges. Without this line the local database is *safer* than the real
 * one, and a missing revoke passes here and fails in production — which is exactly what
 * happened once already.
 */
alter default privileges in schema public grant execute on functions to anon, authenticated;
alter default privileges in schema public grant select on tables to anon, authenticated;

-- Supabase creates this publication for Realtime; the migrations add tables to it.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end;
$$;
