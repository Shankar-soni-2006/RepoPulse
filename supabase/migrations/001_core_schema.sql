-- ============================================================
-- Migration 001: Core schema
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ============================================================
-- users
-- ============================================================
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  github_id     bigint not null unique,
  login         text not null,
  name          text,
  email         text,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_users_github_id on users (github_id);

-- ============================================================
-- github_installations
-- ============================================================
create table if not exists github_installations (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references users (id) on delete cascade,
  installation_id     bigint not null unique,
  app_id              bigint not null,
  account_login       text not null,
  account_type        text not null check (account_type in ('User', 'Organization')),
  access_token        text,
  token_expires_at    timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_github_installations_user_id        on github_installations (user_id);
create index idx_github_installations_installation_id on github_installations (installation_id);

-- ============================================================
-- repositories
-- ============================================================
create table if not exists repositories (
  id                uuid primary key default gen_random_uuid(),
  github_id         bigint not null unique,
  installation_id   uuid references github_installations (id) on delete set null,
  name              text not null,
  full_name         text not null unique,
  owner             text not null,
  description       text,
  visibility        text not null default 'public' check (visibility in ('public', 'private', 'internal')),
  default_branch    text not null default 'main',
  language          text,
  stargazers_count  integer not null default 0,
  forks_count       integer not null default 0,
  open_issues_count integer not null default 0,
  sync_status       text not null default 'never' check (sync_status in ('idle', 'syncing', 'error', 'never')),
  last_synced_at    timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_repositories_github_id      on repositories (github_id);
create index idx_repositories_full_name      on repositories (full_name);
create index idx_repositories_installation_id on repositories (installation_id);

-- ============================================================
-- contributors
-- ============================================================
create table if not exists contributors (
  id                    uuid primary key default gen_random_uuid(),
  github_id             bigint not null,
  repository_id         uuid not null references repositories (id) on delete cascade,
  login                 text not null,
  avatar_url            text,
  name                  text,
  commit_count          integer not null default 0,
  pull_request_count    integer not null default 0,
  review_count          integer not null default 0,
  additions             integer not null default 0,
  deletions             integer not null default 0,
  first_contribution_at timestamptz,
  last_contribution_at  timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (github_id, repository_id)
);

create index idx_contributors_repository_id on contributors (repository_id);
create index idx_contributors_github_id     on contributors (github_id);
create index idx_contributors_login         on contributors (login);

-- ============================================================
-- pull_requests
-- ============================================================
create table if not exists pull_requests (
  id                  uuid primary key default gen_random_uuid(),
  github_id           bigint not null,
  repository_id       uuid not null references repositories (id) on delete cascade,
  contributor_id      uuid references contributors (id) on delete set null,
  number              integer not null,
  title               text not null,
  body                text,
  author_login        text not null,
  status              text not null default 'open' check (status in ('open', 'closed', 'merged')),
  labels              text[] not null default '{}',
  additions           integer not null default 0,
  deletions           integer not null default 0,
  changed_files       integer not null default 0,
  review_count        integer not null default 0,
  first_review_at     timestamptz,
  cycle_time          numeric,        -- hours
  first_review_time   numeric,        -- hours
  pr_size             integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  merged_at           timestamptz,
  closed_at           timestamptz,
  unique (github_id, repository_id)
);

create index idx_pull_requests_repository_id  on pull_requests (repository_id);
create index idx_pull_requests_github_id      on pull_requests (github_id);
create index idx_pull_requests_contributor_id on pull_requests (contributor_id);
create index idx_pull_requests_status         on pull_requests (status);
create index idx_pull_requests_created_at     on pull_requests (created_at);
create index idx_pull_requests_merged_at      on pull_requests (merged_at);

-- ============================================================
-- reviews
-- ============================================================
create table if not exists reviews (
  id              uuid primary key default gen_random_uuid(),
  github_id       bigint not null,
  pull_request_id uuid not null references pull_requests (id) on delete cascade,
  repository_id   uuid not null references repositories (id) on delete cascade,
  contributor_id  uuid references contributors (id) on delete set null,
  reviewer_login  text not null,
  state           text not null check (state in ('approved', 'changes_requested', 'commented', 'dismissed', 'pending')),
  submitted_at    timestamptz not null,
  created_at      timestamptz not null default now(),
  unique (github_id, pull_request_id)
);

create index idx_reviews_pull_request_id on reviews (pull_request_id);
create index idx_reviews_repository_id   on reviews (repository_id);
create index idx_reviews_contributor_id  on reviews (contributor_id);
create index idx_reviews_submitted_at    on reviews (submitted_at);

-- ============================================================
-- commits
-- ============================================================
create table if not exists commits (
  id              uuid primary key default gen_random_uuid(),
  sha             text not null,
  repository_id   uuid not null references repositories (id) on delete cascade,
  contributor_id  uuid references contributors (id) on delete set null,
  author_login    text,
  message         text not null,
  additions       integer not null default 0,
  deletions       integer not null default 0,
  committed_at    timestamptz not null,
  created_at      timestamptz not null default now(),
  unique (sha, repository_id)
);

create index idx_commits_repository_id  on commits (repository_id);
create index idx_commits_contributor_id on commits (contributor_id);
create index idx_commits_committed_at   on commits (committed_at);

-- ============================================================
-- daily_metrics
-- ============================================================
create table if not exists daily_metrics (
  id                    uuid primary key default gen_random_uuid(),
  repository_id         uuid not null references repositories (id) on delete cascade,
  date                  date not null,
  pr_count              integer not null default 0,
  merged_pr_count       integer not null default 0,
  commit_count          integer not null default 0,
  additions             integer not null default 0,
  deletions             integer not null default 0,
  avg_cycle_time        numeric,   -- hours
  avg_first_review_time numeric,   -- hours
  active_contributors   integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (repository_id, date)
);

create index idx_daily_metrics_repository_id on daily_metrics (repository_id);
create index idx_daily_metrics_date          on daily_metrics (date);

-- ============================================================
-- webhook_events
-- ============================================================
create table if not exists webhook_events (
  id                   uuid primary key default gen_random_uuid(),
  repository_id        uuid references repositories (id) on delete set null,
  event_type           text not null,
  action               text,
  github_delivery_id   text not null unique,
  payload              jsonb not null default '{}',
  processed_at         timestamptz,
  created_at           timestamptz not null default now()
);

create index idx_webhook_events_repository_id      on webhook_events (repository_id);
create index idx_webhook_events_event_type         on webhook_events (event_type);
create index idx_webhook_events_github_delivery_id on webhook_events (github_delivery_id);
create index idx_webhook_events_created_at         on webhook_events (created_at);

-- ============================================================
-- updated_at trigger function
-- ============================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_users_updated_at
  before update on users
  for each row execute function set_updated_at();

create trigger trg_github_installations_updated_at
  before update on github_installations
  for each row execute function set_updated_at();

create trigger trg_repositories_updated_at
  before update on repositories
  for each row execute function set_updated_at();

create trigger trg_contributors_updated_at
  before update on contributors
  for each row execute function set_updated_at();

create trigger trg_pull_requests_updated_at
  before update on pull_requests
  for each row execute function set_updated_at();

create trigger trg_daily_metrics_updated_at
  before update on daily_metrics
  for each row execute function set_updated_at();
