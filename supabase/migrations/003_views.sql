-- ============================================================
-- Migration 003: Analytics helper views
-- ============================================================

-- PR metrics view — pre-computes per-PR analytics fields
create or replace view v_pull_request_metrics as
select
  pr.id,
  pr.repository_id,
  pr.number,
  pr.title,
  pr.author_login,
  pr.status,
  pr.additions,
  pr.deletions,
  pr.changed_files,
  pr.review_count,
  pr.labels,
  pr.created_at,
  pr.updated_at,
  pr.merged_at,
  pr.closed_at,
  pr.first_review_at,
  -- cycle time in hours (merged PRs only)
  case
    when pr.merged_at is not null
    then extract(epoch from (pr.merged_at - pr.created_at)) / 3600.0
    else null
  end as cycle_time,
  -- first review time in hours
  case
    when pr.first_review_at is not null
    then extract(epoch from (pr.first_review_at - pr.created_at)) / 3600.0
    else null
  end as first_review_time,
  -- PR size
  (pr.additions + pr.deletions) as pr_size
from pull_requests pr;

-- Repository summary view
create or replace view v_repository_summary as
select
  r.id as repository_id,
  r.full_name,
  count(distinct pr.id)                                          as total_prs,
  count(distinct pr.id) filter (where pr.status = 'merged')     as merged_prs,
  count(distinct pr.id) filter (where pr.status = 'open')       as open_prs,
  count(distinct c.id)                                           as total_commits,
  count(distinct con.id)                                         as total_contributors,
  avg(
    case when pr.merged_at is not null
    then extract(epoch from (pr.merged_at - pr.created_at)) / 3600.0
    end
  )                                                              as avg_cycle_time,
  avg(
    case when pr.first_review_at is not null
    then extract(epoch from (pr.first_review_at - pr.created_at)) / 3600.0
    end
  )                                                              as avg_first_review_time
from repositories r
left join pull_requests pr  on pr.repository_id = r.id
left join commits c         on c.repository_id  = r.id
left join contributors con  on con.repository_id = r.id
group by r.id, r.full_name;
