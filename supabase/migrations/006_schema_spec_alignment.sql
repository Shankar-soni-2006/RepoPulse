-- ============================================================
-- Migration 006: Alignment with the RepoPulse database specification
-- (RepoPulse_Database_Schema_Table_Triggers_Updates.docx)
--
-- Adopts the spec's additions that fit the existing design:
-- * PR numbers are unique per repository
-- * Repository fork / archived flags and GitHub URL
-- * Sync status names 'synced' / 'failed' (were 'idle' / 'error')
-- * Webhook 'processing' state, to detect interrupted processing
-- ============================================================

-- PR numbers are unique within a GitHub repository
alter table pull_requests
  add constraint pull_requests_repository_number_key unique (repository_id, number);

-- Repository flags from GitHub
alter table repositories
  add column html_url    text,
  add column is_fork     boolean not null default false,
  add column is_archived boolean not null default false;

-- Sync status vocabulary: never | syncing | synced | failed
alter table repositories drop constraint if exists repositories_sync_status_check;
update repositories set sync_status = 'synced' where sync_status = 'idle';
update repositories set sync_status = 'failed' where sync_status = 'error';
alter table repositories
  add constraint repositories_sync_status_check
  check (sync_status in ('never', 'syncing', 'synced', 'failed'));

-- Webhook processing: received → processing → processed | ignored | failed
alter table webhook_events drop constraint if exists webhook_events_status_check;
alter table webhook_events
  add constraint webhook_events_status_check
  check (status in ('received', 'processing', 'processed', 'ignored', 'failed'));
