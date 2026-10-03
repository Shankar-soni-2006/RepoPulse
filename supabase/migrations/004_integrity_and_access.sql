-- ============================================================
-- Migration 004: Data integrity, access control, sessions
--
-- * pull_requests.created_at / updated_at hold GitHub's timestamps
--   (previously defaulted to sync time, corrupting cycle time)
-- * Per-PR derived values become generated columns so they can
--   never drift from their inputs
-- * Unknown commit stats are NULL, not 0
-- * Pending reviews (no submitted_at) are representable
-- * user ↔ installation and user ↔ repository access tables
-- * Server-side sessions with encrypted GitHub user tokens
-- * Sync / webhook processing status columns
-- * Remove misleading views and redundant indexes
-- ============================================================

-- ============================================================
-- Views: v_repository_summary averaged over a PR×commit×contributor
-- fan-out (wrong); v_pull_request_metrics is superseded by the
-- generated columns above. Neither is used.
-- ============================================================
drop view if exists v_repository_summary;
drop view if exists v_pull_request_metrics;

-- ============================================================
-- pull_requests: GitHub timestamps + generated metrics
-- ============================================================

-- created_at / updated_at are GitHub's values and must be supplied by the sync.
alter table pull_requests alter column created_at drop default;
alter table pull_requests alter column updated_at drop default;

-- The generic updated_at trigger would overwrite GitHub's updated_at with now().
drop trigger if exists trg_pull_requests_updated_at on pull_requests;

-- Row bookkeeping: when RepoPulse last wrote this row.
alter table pull_requests add column synced_at timestamptz not null default now();

create or replace function set_synced_at()
returns trigger language plpgsql as $$
begin
  new.synced_at = now();
  return new;
end;
$$;

create trigger trg_pull_requests_synced_at
  before update on pull_requests
  for each row execute function set_synced_at();

-- Derived per-PR values: computed by Postgres from stored facts, never written by the app.
alter table pull_requests
  drop column cycle_time,
  drop column first_review_time,
  drop column pr_size;

alter table pull_requests
  add column cycle_time numeric generated always as (
    case when merged_at is not null
      then extract(epoch from (merged_at - created_at)) / 3600.0
    end
  ) stored,                                     -- hours
  add column first_review_time numeric generated always as (
    case when first_review_at is not null
      then extract(epoch from (first_review_at - created_at)) / 3600.0
    end
  ) stored,                                     -- hours
  add column pr_size integer generated always as (additions + deletions) stored;

alter table pull_requests
  add constraint pull_requests_additions_nonneg check (additions >= 0),
  add constraint pull_requests_deletions_nonneg check (deletions >= 0);

-- ============================================================
-- commits: unknown stats are NULL (list endpoint has no stats)
-- ============================================================
alter table commits alter column additions drop not null;
alter table commits alter column additions drop default;
alter table commits alter column deletions drop not null;
alter table commits alter column deletions drop default;

-- ============================================================
-- reviews: pending reviews have no submitted_at
-- ============================================================
alter table reviews alter column submitted_at drop not null;

-- ============================================================
-- repositories: sync bookkeeping; full_name is not an identity
-- ============================================================

-- Repos can be renamed/transferred; github_id is the stable key.
alter table repositories drop constraint if exists repositories_full_name_key;

alter table repositories
  add column sync_error      text,
  add column sync_started_at timestamptz;

-- ============================================================
-- github_installations: installations are shared, tokens aren't stored here
-- ============================================================

-- Installation tokens are minted on demand; user OAuth tokens live in sessions.
alter table github_installations
  drop column access_token,
  drop column token_expires_at;

-- An org installation is visible to many users.
create table user_installations (
  user_id         uuid not null references users (id) on delete cascade,
  installation_id uuid not null references github_installations (id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (user_id, installation_id)
);

create index idx_user_installations_installation_id on user_installations (installation_id);

insert into user_installations (user_id, installation_id)
select user_id, id from github_installations where user_id is not null
on conflict do nothing;

alter table github_installations drop column user_id;

-- Repositories a user may access (from GitHub's per-user installation repo list).
create table user_repositories (
  user_id       uuid not null references users (id) on delete cascade,
  repository_id uuid not null references repositories (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (user_id, repository_id)
);

create index idx_user_repositories_repository_id on user_repositories (repository_id);

-- ============================================================
-- sessions: server-side sessions; only a hash of the session token is stored
-- ============================================================
create table sessions (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references users (id) on delete cascade,
  token_hash                  text not null unique,      -- SHA-256 of the cookie value
  encrypted_access_token      text not null,             -- AES-GCM, key from env
  access_token_expires_at     timestamptz,
  encrypted_refresh_token     text,
  refresh_token_expires_at    timestamptz,
  expires_at                  timestamptz not null,
  last_seen_at                timestamptz not null default now(),
  created_at                  timestamptz not null default now()
);

create index idx_sessions_user_id    on sessions (user_id);
create index idx_sessions_expires_at on sessions (expires_at);

-- ============================================================
-- webhook_events: processing status
-- ============================================================
alter table webhook_events
  add column status text not null default 'received'
    check (status in ('received', 'processed', 'ignored', 'failed')),
  add column processing_error text;

create index idx_webhook_events_status on webhook_events (status);

-- ============================================================
-- daily_metrics: review activity and PR size
--   pr_count             PRs opened that day
--   merged_pr_count      PRs merged that day
--   avg_cycle_time       over PRs merged that day (hours)
--   avg_first_review_time over PRs first reviewed that day (hours)
-- ============================================================
alter table daily_metrics
  add column review_count integer not null default 0,
  add column avg_pr_size  numeric;

-- ============================================================
-- Range-query indexes (repository + time)
-- ============================================================
create index idx_pull_requests_repo_created on pull_requests (repository_id, created_at);
create index idx_pull_requests_repo_merged  on pull_requests (repository_id, merged_at);
create index idx_commits_repo_committed     on commits (repository_id, committed_at);
create index idx_reviews_repo_submitted     on reviews (repository_id, submitted_at);

-- ============================================================
-- Redundant indexes (covered by unique constraints or composite indexes)
-- ============================================================
drop index if exists idx_users_github_id;                        -- users_github_id_key
drop index if exists idx_github_installations_installation_id;   -- github_installations_installation_id_key
drop index if exists idx_github_installations_user_id;           -- column dropped
drop index if exists idx_repositories_github_id;                 -- repositories_github_id_key
drop index if exists idx_webhook_events_github_delivery_id;      -- webhook_events_github_delivery_id_key
drop index if exists idx_daily_metrics_repository_id;            -- (repository_id, date) unique
drop index if exists idx_pull_requests_repository_id;            -- idx_pull_requests_repo_created
drop index if exists idx_commits_repository_id;                  -- idx_commits_repo_committed
drop index if exists idx_reviews_repository_id;                  -- idx_reviews_repo_submitted

-- ============================================================
-- RLS for new tables (backend uses the service-role key, which bypasses RLS)
-- ============================================================
alter table user_installations enable row level security;
alter table user_repositories  enable row level security;
alter table sessions           enable row level security;

create policy "deny_all_user_installations" on user_installations for all using (false);
create policy "deny_all_user_repositories"  on user_repositories  for all using (false);
create policy "deny_all_sessions"           on sessions           for all using (false);
