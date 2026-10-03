-- ============================================================
-- Migration 005: Sync engine support
-- ============================================================

-- Merge commits repeat the changes of the commits they merge; analytics excludes
-- them from churn. Unknown until the commit's details are fetched.
alter table commits add column is_merge boolean not null default false;

-- Atomically claims a repository for synchronization. Returns the repository row
-- when the claim succeeds, or nothing when another sync is already running.
-- A 'syncing' claim older than p_stale_after is treated as abandoned (e.g. the
-- server restarted mid-sync) and can be reclaimed.
create or replace function claim_repository_sync(p_repository_id uuid, p_stale_after interval)
returns setof repositories
language sql
as $$
  update repositories
     set sync_status     = 'syncing',
         sync_started_at = now(),
         sync_error      = null
   where id = p_repository_id
     and (
       sync_status <> 'syncing'
       or sync_started_at is null
       or sync_started_at < now() - p_stale_after
     )
  returning *;
$$;

-- Only the backend (service role) may call it. Supabase grants function execute to
-- anon/authenticated by default, so revoke from them explicitly when they exist.
revoke all on function claim_repository_sync(uuid, interval) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function claim_repository_sync(uuid, interval) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function claim_repository_sync(uuid, interval) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function claim_repository_sync(uuid, interval) to service_role;
  end if;
end
$$;
