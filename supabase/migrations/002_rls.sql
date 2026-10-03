-- ============================================================
-- Migration 002: Row Level Security
-- ============================================================

-- Enable RLS on all tables
alter table users                 enable row level security;
alter table github_installations  enable row level security;
alter table repositories          enable row level security;
alter table contributors          enable row level security;
alter table pull_requests         enable row level security;
alter table reviews               enable row level security;
alter table commits               enable row level security;
alter table daily_metrics         enable row level security;
alter table webhook_events        enable row level security;

-- The backend uses the service-role key which bypasses RLS.
-- These policies allow authenticated users to read their own data
-- if direct Supabase access is ever needed (e.g. Supabase Auth).

-- For now: service-role key is used exclusively from the backend.
-- No direct frontend access to Supabase is permitted.

-- Deny all by default (service-role bypasses these).
create policy "deny_all_users"               on users               for all using (false);
create policy "deny_all_installations"       on github_installations for all using (false);
create policy "deny_all_repositories"        on repositories         for all using (false);
create policy "deny_all_contributors"        on contributors         for all using (false);
create policy "deny_all_pull_requests"       on pull_requests        for all using (false);
create policy "deny_all_reviews"             on reviews              for all using (false);
create policy "deny_all_commits"             on commits              for all using (false);
create policy "deny_all_daily_metrics"       on daily_metrics        for all using (false);
create policy "deny_all_webhook_events"      on webhook_events       for all using (false);
