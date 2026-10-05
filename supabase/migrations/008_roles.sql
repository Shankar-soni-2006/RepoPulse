-- ============================================================
-- Migration 008: application roles (admin / member) and account suspension
-- ============================================================
-- Roles control what a user may do in RepoPulse itself (user management, system
-- overview). Repository data stays gated by GitHub access (user_repositories) for
-- everyone, admins included.
--
-- Bootstrap the first admin with `npm run admin:role -- <github-login> admin`.

alter table users
  add column if not exists role text not null default 'member',
  add column if not exists suspended_at timestamptz;

alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check check (role in ('admin', 'member'));

create index if not exists idx_users_role on users (role);

-- ---------- Admin queries ----------

-- Every user with activity summaries, newest first
create or replace function admin_list_users()
returns table (
  id               uuid,
  github_id        bigint,
  login            text,
  name             text,
  avatar_url       text,
  role             text,
  suspended_at     timestamptz,
  created_at       timestamptz,
  last_active_at   timestamptz,
  repository_count bigint,
  active_sessions  bigint
)
language sql
stable
as $$
  select
    u.id, u.github_id, u.login, u.name, u.avatar_url, u.role, u.suspended_at, u.created_at,
    (select max(s.last_seen_at) from sessions s where s.user_id = u.id)                       as last_active_at,
    (select count(*) from user_repositories ur where ur.user_id = u.id)                       as repository_count,
    (select count(*) from sessions s where s.user_id = u.id and s.expires_at > now())         as active_sessions
  from users u
  order by u.created_at desc;
$$;

-- Headline numbers for the admin overview
create or replace function admin_overview()
returns table (
  users                bigint,
  admins               bigint,
  suspended            bigint,
  new_users_7d         bigint,
  active_sessions      bigint,
  repositories         bigint,
  synced_repositories  bigint,
  failed_syncs         bigint,
  webhook_failures_24h bigint
)
language sql
stable
as $$
  select
    (select count(*) from users),
    (select count(*) from users where role = 'admin'),
    (select count(*) from users where suspended_at is not null),
    (select count(*) from users where created_at > now() - interval '7 days'),
    (select count(*) from sessions where expires_at > now()),
    (select count(*) from repositories),
    (select count(*) from repositories where sync_status = 'synced'),
    (select count(*) from repositories where sync_status = 'failed'),
    (select count(*) from webhook_events where status = 'failed' and created_at > now() - interval '24 hours');
$$;

-- ---------- Admin actions (rules enforced here, so concurrent requests can't break them) ----------

-- Changes a role. Refuses to remove the last active admin.
create or replace function admin_set_role(p_user_id uuid, p_role text)
returns setof users
language plpgsql
as $$
begin
  if p_role not in ('admin', 'member') then
    raise exception 'INVALID_ROLE' using errcode = 'P0001';
  end if;
  -- Serialize role changes so two demotions can't both pass the check
  lock table users in share row exclusive mode;
  if p_role = 'member'
     and exists (select 1 from users where id = p_user_id and role = 'admin')
     and (select count(*) from users where role = 'admin' and suspended_at is null and id <> p_user_id) = 0 then
    raise exception 'LAST_ADMIN' using errcode = 'P0001';
  end if;
  return query update users set role = p_role, updated_at = now() where id = p_user_id returning *;
end;
$$;

-- Suspends (signs out everywhere, blocks sign-in) or reinstates a member.
-- Admins must be demoted first, so an admin can never lock out the last admin.
create or replace function admin_set_suspended(p_user_id uuid, p_suspended boolean)
returns setof users
language plpgsql
as $$
begin
  if p_suspended and exists (select 1 from users where id = p_user_id and role = 'admin') then
    raise exception 'TARGET_IS_ADMIN' using errcode = 'P0001';
  end if;
  if p_suspended then
    delete from sessions where user_id = p_user_id;
  end if;
  return query
    update users
       set suspended_at = case when p_suspended then coalesce(suspended_at, now()) else null end,
           updated_at = now()
     where id = p_user_id
    returning *;
end;
$$;

-- Deletes a member's account: user row, sessions and access grants (cascade).
-- Repository activity (shared with other users) is kept.
create or replace function admin_delete_user(p_user_id uuid)
returns boolean
language plpgsql
as $$
begin
  if exists (select 1 from users where id = p_user_id and role = 'admin') then
    raise exception 'TARGET_IS_ADMIN' using errcode = 'P0001';
  end if;
  delete from users where id = p_user_id;
  return found;
end;
$$;

-- Only the backend (service role) may call these
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'admin_list_users()',
    'admin_overview()',
    'admin_set_role(uuid, text)',
    'admin_set_suspended(uuid, boolean)',
    'admin_delete_user(uuid)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', fn);
    end if;
  end loop;
end
$$;
