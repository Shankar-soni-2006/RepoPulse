-- ============================================================
-- Migration 009: team view (metrics across several repositories)
-- ============================================================
-- The team view combines the repositories of one account (organization or user)
-- that a signed-in user can access. Metrics are recomputed over the combined set,
-- never added up: medians are taken over all PRs together, and a person active in
-- several repositories counts once (by GitHub id).
--
-- repository_period_metrics(uuid, …) now delegates to the multi-repository version,
-- so single-repository analytics and the team view share one definition.

-- ---------- Period metrics for a set of repositories over [p_from, p_to) ----------
create or replace function repositories_period_metrics(
  p_repository_ids uuid[],
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
     where repository_id = any(p_repository_ids) and merged_at >= p_from and merged_at < p_to
  ),
  first_reviewed as (
    select first_review_time from pull_requests
     where repository_id = any(p_repository_ids) and first_review_at >= p_from and first_review_at < p_to
  ),
  period_commits as (
    select * from commits
     where repository_id = any(p_repository_ids) and committed_at >= p_from and committed_at < p_to
  ),
  -- Submitted reviews by someone other than the PR author
  period_reviews as (
    select r.contributor_id from reviews r
      join pull_requests p on p.id = r.pull_request_id
     where r.repository_id = any(p_repository_ids)
       and r.submitted_at >= p_from and r.submitted_at < p_to
       and r.state <> 'pending'
       and r.reviewer_login <> p.author_login
  ),
  -- PRs open at the end of the period that had not been reviewed by then
  unreviewed as (
    select extract(epoch from (p_to - created_at)) / 3600.0 as waiting from pull_requests
     where repository_id = any(p_repository_ids)
       and created_at < p_to
       and (merged_at is null or merged_at >= p_to)
       and (closed_at is null or closed_at >= p_to)
       and (first_review_at is null or first_review_at >= p_to)
  ),
  actors as (
    select contributor_id from period_commits
    union select contributor_id from pull_requests
     where repository_id = any(p_repository_ids) and created_at >= p_from and created_at < p_to
    union select contributor_id from period_reviews
  )
  select
    (select count(*) from merged)::integer,
    (select count(*) from pull_requests
      where repository_id = any(p_repository_ids) and created_at >= p_from and created_at < p_to)::integer,
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
    -- people, not per-repository identities: one person in three repositories counts once
    (select count(distinct k.github_id) from actors a join contributors k on k.id = a.contributor_id)::integer,
    (select count(*) from unreviewed)::integer,
    (select max(waiting) from unreviewed)::numeric,
    (select case when count(*) = 0 then null
                 else (count(*) filter (where c.additions is not null))::numeric / count(*) end
       from period_commits c where not c.is_merge);
$$;

-- Single repository: same definition (used by repository analytics and daily rollups)
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
  select * from repositories_period_metrics(array[p_repository_id], p_from, p_to);
$$;

-- ---------- Per-person activity across a set of repositories ----------
-- Grouped by GitHub id (contributor rows are per repository). Alphabetical: RepoPulse
-- describes activity; it does not rank people.
create or replace function members_activity(
  p_repository_ids uuid[],
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  github_id       bigint,
  login           text,
  avatar_url      text,
  repositories    integer,
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
    select c.contributor_id, c.repository_id, c.committed_at as at, 'commit' as kind,
           case when c.is_merge then 0 else coalesce(c.additions, 0) end as additions,
           case when c.is_merge then 0 else coalesce(c.deletions, 0) end as deletions
      from commits c
     where c.repository_id = any(p_repository_ids) and c.committed_at >= p_from and c.committed_at < p_to
    union all
    select p.contributor_id, p.repository_id, p.created_at, 'pr_opened', 0, 0 from pull_requests p
     where p.repository_id = any(p_repository_ids) and p.created_at >= p_from and p.created_at < p_to
    union all
    select p.contributor_id, p.repository_id, p.merged_at, 'pr_merged', 0, 0 from pull_requests p
     where p.repository_id = any(p_repository_ids) and p.merged_at >= p_from and p.merged_at < p_to
    union all
    select r.contributor_id, r.repository_id, r.submitted_at, 'review', 0, 0 from reviews r
      join pull_requests p on p.id = r.pull_request_id
     where r.repository_id = any(p_repository_ids)
       and r.submitted_at >= p_from and r.submitted_at < p_to
       and r.state <> 'pending'
       and r.reviewer_login <> p.author_login
  ),
  people as (
    select e.*, k.github_id, k.login, k.avatar_url
      from events e join contributors k on k.id = e.contributor_id
  ),
  weeks as (
    select generate_series(
      0, greatest(ceil(extract(epoch from (p_to - p_from)) / 604800.0)::integer - 1, 0)
    ) as w
  ),
  per_week as (
    select p.github_id, floor(extract(epoch from (p.at - p_from)) / 604800.0)::integer as w, count(*) as n
      from people p
     where p.kind <> 'pr_merged'
     group by 1, 2
  ),
  -- Most recent login/avatar for each person (logins can change)
  identity as (
    select distinct on (p.github_id) p.github_id, p.login, p.avatar_url
      from people p
     order by p.github_id, p.at desc
  )
  select
    p.github_id, i.login, i.avatar_url,
    count(distinct p.repository_id)::integer,
    count(*) filter (where p.kind = 'commit')::integer,
    count(*) filter (where p.kind = 'pr_opened')::integer,
    count(*) filter (where p.kind = 'pr_merged')::integer,
    count(*) filter (where p.kind = 'review')::integer,
    coalesce(sum(p.additions), 0)::bigint,
    coalesce(sum(p.deletions), 0)::bigint,
    max(p.at),
    (select array_agg(coalesce(pw.n, 0)::integer order by weeks.w)
       from weeks left join per_week pw on pw.w = weeks.w and pw.github_id = p.github_id)
  from people p
  join identity i on i.github_id = p.github_id
  group by p.github_id, i.login, i.avatar_url
  order by lower(i.login);
$$;

-- ---------- Each repository's headline metrics (team view breakdown) ----------
create or replace function repositories_breakdown(
  p_repository_ids uuid[],
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  repository_id       uuid,
  pr_throughput       integer,
  prs_opened          integer,
  cycle_time          numeric,
  review_count        integer,
  commit_count        integer,
  code_churn          bigint,
  active_contributors integer
)
language sql
stable
as $$
  select r.id, m.pr_throughput, m.prs_opened, m.cycle_time, m.review_count, m.commit_count,
         m.code_churn, m.active_contributors
    from unnest(p_repository_ids) as r(id)
   cross join lateral repository_period_metrics(r.id, p_from, p_to) m;
$$;

-- ---------- Daily series across a set of repositories ----------
-- Computed from facts with the same definitions (people counted once per day).
create or replace function repositories_daily_metrics(
  p_repository_ids uuid[],
  p_from date,
  p_to date
)
returns table (
  metric_date         date,
  prs_opened          integer,
  pr_throughput       integer,
  cycle_time          numeric,
  first_review_time   numeric,
  review_delay        numeric,
  pr_size             numeric,
  code_churn          bigint,
  commit_count        integer,
  review_count        integer,
  active_contributors integer
)
language sql
stable
as $$
  select d::date, m.prs_opened, m.pr_throughput, m.cycle_time, m.first_review_time, m.review_delay,
         m.pr_size, m.code_churn, m.commit_count, m.review_count, m.active_contributors
    from generate_series(p_from, p_to, interval '1 day') d
   cross join lateral repositories_period_metrics(
     p_repository_ids,
     (d::date)::timestamp at time zone 'UTC',
     (d::date + 1)::timestamp at time zone 'UTC'
   ) m
   order by 1;
$$;

-- Only the backend (service role) may call these
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'repositories_period_metrics(uuid[], timestamptz, timestamptz)',
    'repository_period_metrics(uuid, timestamptz, timestamptz)',
    'members_activity(uuid[], timestamptz, timestamptz)',
    'repositories_breakdown(uuid[], timestamptz, timestamptz)',
    'repositories_daily_metrics(uuid[], date, date)'
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
