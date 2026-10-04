-- ============================================================
-- Migration 007: Analytics engine
--
-- Metric definitions (all durations in hours, all days in UTC):
--   PR throughput        PRs merged in the period
--   Cycle time           median (merged_at - created_at) of PRs merged in the period
--   First review time    median (first_review_at - created_at) of PRs first reviewed in the period
--   Review delay         mean   (first_review_at - created_at) of the same PRs
--   PR size              median (additions + deletions) of PRs merged in the period
--   Code churn           additions + deletions of non-merge commits with known stats
--   Active contributors  distinct contributors who committed, opened a PR or reviewed
--
-- Medians need per-PR values, so period metrics are computed from the fact tables
-- here (not from daily rollups) and never hit PostgREST's row limits.
-- ============================================================

-- ---- daily_metrics: align names with the database specification ----
alter table daily_metrics rename column date to metric_date;
alter table daily_metrics rename column pr_count to prs_opened;
alter table daily_metrics rename column merged_pr_count to pr_throughput;
alter table daily_metrics rename column avg_cycle_time to cycle_time_hours;
alter table daily_metrics rename column avg_first_review_time to first_review_time_hours;
alter table daily_metrics rename column avg_pr_size to pr_size_median;
alter table daily_metrics
  add column review_delay_hours numeric,
  add column code_churn integer not null default 0;
alter table daily_metrics
  add constraint daily_metrics_nonneg check (
    prs_opened >= 0 and pr_throughput >= 0 and commit_count >= 0 and additions >= 0
    and deletions >= 0 and code_churn >= 0 and review_count >= 0 and active_contributors >= 0
  );

-- ---- contributors: activity is computed from facts, not stored counters ----
alter table contributors
  drop column commit_count,
  drop column pull_request_count,
  drop column review_count,
  drop column additions,
  drop column deletions,
  drop column first_contribution_at,
  drop column last_contribution_at;

-- ---- repositories: earliest point covered by synced data ----
alter table repositories add column data_since timestamptz;

-- ============================================================
-- Period metrics for one repository over [p_from, p_to)
-- ============================================================
create or replace function repository_period_metrics(
  p_repository_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  pr_throughput           integer,
  prs_opened              integer,
  cycle_time              numeric,
  first_review_time       numeric,
  review_delay            numeric,
  pr_size                 numeric,
  code_churn              bigint,
  additions               bigint,
  deletions               bigint,
  commit_count            integer,
  commits_missing_stats   integer,
  review_count            integer,
  active_contributors     integer,
  open_prs_without_review integer,
  oldest_unreviewed_wait  numeric,
  commit_stats_coverage   numeric
)
language sql
stable
as $$
  with
  merged as (
    select cycle_time, pr_size from pull_requests
     where repository_id = p_repository_id and merged_at >= p_from and merged_at < p_to
  ),
  first_reviewed as (
    select first_review_time from pull_requests
     where repository_id = p_repository_id and first_review_at >= p_from and first_review_at < p_to
  ),
  period_commits as (
    select * from commits
     where repository_id = p_repository_id and committed_at >= p_from and committed_at < p_to
  ),
  -- Submitted reviews by someone other than the PR author
  period_reviews as (
    select r.contributor_id from reviews r
      join pull_requests p on p.id = r.pull_request_id
     where r.repository_id = p_repository_id
       and r.submitted_at >= p_from and r.submitted_at < p_to
       and r.state <> 'pending'
       and r.reviewer_login <> p.author_login
  ),
  -- PRs open at the end of the period that had not been reviewed by then
  unreviewed as (
    select extract(epoch from (p_to - created_at)) / 3600.0 as waiting from pull_requests
     where repository_id = p_repository_id
       and created_at < p_to
       and (merged_at is null or merged_at >= p_to)
       and (closed_at is null or closed_at >= p_to)
       and (first_review_at is null or first_review_at >= p_to)
  ),
  actors as (
    select contributor_id from period_commits
    union select contributor_id from pull_requests
     where repository_id = p_repository_id and created_at >= p_from and created_at < p_to
    union select contributor_id from period_reviews
  )
  select
    (select count(*) from merged)::integer,
    (select count(*) from pull_requests
      where repository_id = p_repository_id and created_at >= p_from and created_at < p_to)::integer,
    (select percentile_cont(0.5) within group (order by cycle_time) from merged)::numeric,
    (select percentile_cont(0.5) within group (order by first_review_time) from first_reviewed)::numeric,
    (select avg(first_review_time) from first_reviewed)::numeric,
    (select percentile_cont(0.5) within group (order by pr_size) from merged)::numeric,
    (select coalesce(sum(c.additions + c.deletions), 0) from period_commits c
      where not c.is_merge and c.additions is not null)::bigint,
    (select coalesce(sum(c.additions), 0) from period_commits c
      where not c.is_merge and c.additions is not null)::bigint,
    (select coalesce(sum(c.deletions), 0) from period_commits c
      where not c.is_merge and c.deletions is not null)::bigint,
    (select count(*) from period_commits)::integer,
    (select count(*) from period_commits c where not c.is_merge and c.additions is null)::integer,
    (select count(*) from period_reviews)::integer,
    (select count(*) from actors where contributor_id is not null)::integer,
    (select count(*) from unreviewed)::integer,
    (select max(waiting) from unreviewed)::numeric,
    -- share of non-merge commits whose line stats are known; null when there are none
    (select case when count(*) = 0 then null
                 else (count(*) filter (where c.additions is not null))::numeric / count(*) end
       from period_commits c where not c.is_merge);
$$;

-- ============================================================
-- Per-contributor activity over [p_from, p_to). Alphabetical — RepoPulse
-- describes activity; it does not rank people.
-- weekly_activity: commits + PRs opened + reviews per 7-day bucket from p_from.
-- ============================================================
create or replace function contributor_activity(
  p_repository_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  contributor_id  uuid,
  github_id       bigint,
  login           text,
  avatar_url      text,
  commits         integer,
  prs_opened      integer,
  prs_merged      integer,
  reviews         integer,
  additions       bigint,
  deletions       bigint,
  last_active_at  timestamptz,
  weekly_activity integer[]
)
language sql
stable
as $$
  with
  events as (
    select c.contributor_id, c.committed_at as at, 'commit' as kind,
           case when c.is_merge then 0 else coalesce(c.additions, 0) end as additions,
           case when c.is_merge then 0 else coalesce(c.deletions, 0) end as deletions
      from commits c
     where c.repository_id = p_repository_id and c.committed_at >= p_from and c.committed_at < p_to
    union all
    select p.contributor_id, p.created_at, 'pr_opened', 0, 0 from pull_requests p
     where p.repository_id = p_repository_id and p.created_at >= p_from and p.created_at < p_to
    union all
    select p.contributor_id, p.merged_at, 'pr_merged', 0, 0 from pull_requests p
     where p.repository_id = p_repository_id and p.merged_at >= p_from and p.merged_at < p_to
    union all
    select r.contributor_id, r.submitted_at, 'review', 0, 0 from reviews r
      join pull_requests p on p.id = r.pull_request_id
     where r.repository_id = p_repository_id
       and r.submitted_at >= p_from and r.submitted_at < p_to
       and r.state <> 'pending'
       and r.reviewer_login <> p.author_login
  ),
  weeks as (
    select generate_series(
      0, greatest(ceil(extract(epoch from (p_to - p_from)) / 604800.0)::integer - 1, 0)
    ) as w
  ),
  per_week as (
    select e.contributor_id, floor(extract(epoch from (e.at - p_from)) / 604800.0)::integer as w,
           count(*) as n
      from events e
     where e.kind <> 'pr_merged'
     group by 1, 2
  )
  select
    k.id, k.github_id, k.login, k.avatar_url,
    count(*) filter (where e.kind = 'commit')::integer,
    count(*) filter (where e.kind = 'pr_opened')::integer,
    count(*) filter (where e.kind = 'pr_merged')::integer,
    count(*) filter (where e.kind = 'review')::integer,
    coalesce(sum(e.additions), 0)::bigint,
    coalesce(sum(e.deletions), 0)::bigint,
    max(e.at),
    (select array_agg(coalesce(pw.n, 0)::integer order by weeks.w)
       from weeks left join per_week pw on pw.w = weeks.w and pw.contributor_id = k.id)
  from events e
  join contributors k on k.id = e.contributor_id
  group by k.id, k.github_id, k.login, k.avatar_url
  order by lower(k.login);
$$;

-- ============================================================
-- Recompute daily rollups for [p_from, p_to] (inclusive UTC dates).
-- Writes a row for every day, zeros included, so trend series are continuous.
-- Returns the number of days written.
-- ============================================================
create or replace function refresh_daily_metrics(p_repository_id uuid, p_from date, p_to date)
returns integer
language sql
as $$
  with
  days as (
    select d::date as day,
           (d::date)::timestamp at time zone 'UTC'     as day_start,
           (d::date + 1)::timestamp at time zone 'UTC' as day_end
      from generate_series(p_from, p_to, interval '1 day') d
  ),
  computed as (
    select p_repository_id as repository_id, d.day as metric_date, m.*
      from days d
     cross join lateral repository_period_metrics(p_repository_id, d.day_start, d.day_end) m
  ),
  written as (
    insert into daily_metrics (
      repository_id, metric_date, prs_opened, pr_throughput, commit_count, additions, deletions,
      code_churn, cycle_time_hours, first_review_time_hours, review_delay_hours, pr_size_median,
      review_count, active_contributors
    )
    select repository_id, metric_date, prs_opened, pr_throughput, commit_count, additions, deletions,
           code_churn, cycle_time, first_review_time, review_delay, pr_size,
           review_count, active_contributors
      from computed
    on conflict (repository_id, metric_date) do update set
      prs_opened              = excluded.prs_opened,
      pr_throughput           = excluded.pr_throughput,
      commit_count            = excluded.commit_count,
      additions               = excluded.additions,
      deletions               = excluded.deletions,
      code_churn              = excluded.code_churn,
      cycle_time_hours        = excluded.cycle_time_hours,
      first_review_time_hours = excluded.first_review_time_hours,
      review_delay_hours      = excluded.review_delay_hours,
      pr_size_median          = excluded.pr_size_median,
      review_count            = excluded.review_count,
      active_contributors     = excluded.active_contributors
    returning 1
  )
  select count(*)::integer from written;
$$;

-- Only the backend (service role) may call these
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'repository_period_metrics(uuid, timestamptz, timestamptz)',
    'contributor_activity(uuid, timestamptz, timestamptz)',
    'refresh_daily_metrics(uuid, date, date)'
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
