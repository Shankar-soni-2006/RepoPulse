import { useQuery } from '@tanstack/react-query';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { useShellRepository } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { SyncStatusBadge } from '@/components/repositories/SyncStatusBadge';
import { Badge, type BadgeProps } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useWebhookEvents } from '@/hooks/useAnalytics';
import { useStartSync } from '@/hooks/useRepository';
import { useSession } from '@/hooks/useSession';
import { systemService } from '@/services/systemService';
import type { WebhookEventSummary } from '@/types';
import { formatDate, formatDateTime, formatRelative } from '@/utils/format';

const EVENT_STATUS: Record<WebhookEventSummary['status'], { label: string; variant: BadgeProps['variant'] }> = {
  processed: { label: 'Processed', variant: 'success' },
  ignored: { label: 'Ignored', variant: 'muted' },
  failed: { label: 'Failed', variant: 'danger' },
  processing: { label: 'Processing', variant: 'default' },
  received: { label: 'Received', variant: 'default' },
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function SettingsPage() {
  const repo = useShellRepository();
  const { data: session } = useSession();
  const startSync = useStartSync();
  const events = useWebhookEvents(repo.id);
  const health = useQuery({ queryKey: ['health'], queryFn: systemService.health, staleTime: 60_000 });
  const installation = session?.installations.find((i) => i.accountLogin.toLowerCase() === repo.owner.toLowerCase());

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-4xl">
      <PageHeader title="Settings" subtitle="Repository synchronization, GitHub connection and system status" />

      <Panel
        title="Repository"
        actions={
          <Button size="sm" loading={startSync.isPending || repo.syncStatus === 'syncing'} onClick={() => startSync.mutate(repo.id)}>
            <RefreshCw className="h-3 w-3" aria-hidden />
            Sync now
          </Button>
        }
      >
        <dl className="divide-y divide-border">
          <Row label="Repository">
            <a href={repo.htmlUrl ?? `https://github.com/${repo.fullName}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">
              {repo.fullName}
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          </Row>
          <Row label="Visibility">
            <span className="capitalize">{repo.visibility}</span>
            {repo.isArchived && <Badge variant="warning" className="ml-2">Archived</Badge>}
            {repo.isFork && <Badge variant="muted" className="ml-2">Fork</Badge>}
          </Row>
          <Row label="Default branch">
            <span className="font-mono text-xs">{repo.defaultBranch}</span>
          </Row>
          <Row label="Sync status">
            <span className="inline-flex flex-wrap items-center gap-2">
              <SyncStatusBadge repository={repo} />
              {repo.syncError && <span className="text-xs text-destructive">{repo.syncError}</span>}
              {startSync.error && <span className="text-xs text-destructive">{startSync.error.message}</span>}
            </span>
          </Row>
          <Row label="Last synced">{repo.lastSyncedAt ? `${formatDateTime(repo.lastSyncedAt)} (${formatRelative(repo.lastSyncedAt)})` : 'Never'}</Row>
          <Row label="Data since">{repo.dataSince ? formatDate(repo.dataSince) : '—'}</Row>
        </dl>
      </Panel>

      <Panel title="GitHub connection">
        <dl className="divide-y divide-border">
          <Row label="Signed in as">{session?.user.login ?? '—'}</Row>
          <Row label="App installation">
            {installation ? `${installation.accountLogin} (${installation.accountType})` : 'Not found for this owner'}
          </Row>
          <Row label="Accounts">{session ? session.installations.map((i) => i.accountLogin).join(', ') || 'None' : '—'}</Row>
        </dl>
        {(installation?.manageUrl ?? session?.installUrl) && (
          <a
            href={installation?.manageUrl ?? session?.installUrl ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Manage which repositories RepoPulse can read (choose "All repositories" to include new ones)
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        )}
      </Panel>

      <Panel
        title="Webhook deliveries"
        description="Recent GitHub events for this repository. Pull request, review and push events update data without a full sync."
        actions={
          <Button size="sm" variant="ghost" onClick={() => events.refetch()} aria-label="Refresh deliveries">
            <RefreshCw className="h-3 w-3" aria-hidden />
          </Button>
        }
        flush
      >
        {events.isLoading ? (
          <LoadingState />
        ) : events.error ? (
          <ErrorState message={events.error.message} onRetry={() => events.refetch()} />
        ) : !events.data || events.data.length === 0 ? (
          <EmptyState message="No webhook deliveries for this repository yet." />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>Event</Th>
                <Th>Status</Th>
                <Th className="hidden sm:table-cell">Detail</Th>
                <Th>Received</Th>
              </tr>
            </Thead>
            <Tbody>
              {events.data.map((e) => (
                <Tr key={e.id}>
                  <Td className="font-mono text-xs">
                    {e.eventType}
                    {e.action && <span className="text-muted-foreground">.{e.action}</span>}
                  </Td>
                  <Td>
                    <Badge variant={EVENT_STATUS[e.status].variant}>{EVENT_STATUS[e.status].label}</Badge>
                  </Td>
                  <Td className="hidden sm:table-cell text-xs text-muted-foreground max-w-[22rem] truncate" title={e.processingError ?? undefined}>
                    {e.processingError ?? '—'}
                  </Td>
                  <Td className="text-xs text-muted-foreground">{formatRelative(e.createdAt)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Panel>

      <Panel title="System">
        <dl className="divide-y divide-border">
          <Row label="API">{health.data ? `OK · v${health.data.version}` : health.error ? 'Unreachable' : '…'}</Row>
          <Row label="Cache (Redis)">
            {health.data
              ? { ok: 'Connected', disabled: 'Not configured — analytics read from the database', error: 'Unavailable — analytics read from the database' }[health.data.cache]
              : '…'}
          </Row>
        </dl>
      </Panel>
    </div>
  );
}
