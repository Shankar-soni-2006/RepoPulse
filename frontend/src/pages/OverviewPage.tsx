import { Link } from 'react-router-dom';
import { useShellRepository } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { MetricRow } from '@/components/dashboard/MetricRow';
import { DataQualityNotice } from '@/components/dashboard/DataQualityNotice';
import { TrendChart } from '@/components/charts/TrendChart';
import { ContributorTable } from '@/components/contributors/ContributorTable';
import { PullRequestStatusBadge } from '@/components/pullRequests/PullRequestStatusBadge';
import { Panel } from '@/components/ui/Panel';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useAnalytics, useContributorActivity, usePullRequests } from '@/hooks/useAnalytics';
import { usePeriod } from '@/hooks/usePeriod';
import { formatCount, formatHours, formatRelative } from '@/utils/format';
import type { PullRequest } from '@/types';

function PrLine({ pr, detail }: { pr: PullRequest; detail: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2 px-3 py-1.5 text-sm min-w-0">
      <span className="tabular-nums text-muted-foreground w-10 text-right flex-shrink-0">#{pr.number}</span>
      <span className="truncate min-w-0 flex-1" title={pr.title}>
        {pr.title}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">{detail}</span>
    </li>
  );
}

export function OverviewPage() {
  const repo = useShellRepository();
  const [days] = usePeriod();
  const analytics = useAnalytics(repo.id, days);
  const recent = usePullRequests(repo.id, { sort: 'created', order: 'desc', limit: 6 });
  const reviewed = usePullRequests(repo.id, { sort: 'firstReview', order: 'desc', limit: 6 });
  const contributors = useContributorActivity(repo.id, days);
  const base = `/repositories/${repo.id}`;

  if (!repo.lastSyncedAt) {
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="Overview" />
        <EmptyState message="This repository hasn’t been synchronized yet. Use Sync in the top bar to import its activity." />
      </div>
    );
  }

  const a = analytics.data;
  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-[1400px]">
      <PageHeader
        title="Overview"
        subtitle={a ? `Last ${days} days, compared with the ${days} days before · updated ${formatRelative(a.generatedAt)}` : `Last ${days} days`}
        period
      />

      {analytics.isLoading && <LoadingState message="Loading metrics…" />}
      {analytics.error && <ErrorState message={analytics.error.message} onRetry={() => analytics.refetch()} />}

      {a && (
        <>
          <MetricRow summary={a} metrics={['cycleTime', 'firstReviewTime', 'prThroughput', 'codeChurn']} />
          <DataQualityNotice quality={a.dataQuality} compact />

          <div className="grid gap-4 lg:grid-cols-2">
            <TrendChart title="PR cycle time" description="Median hours from open to merge, PRs merged that day" data={a.trends} valueKey="cycleTime" kind="line" format={formatHours} duration emptyLabel="No PRs merged" />
            <TrendChart title="Review delay" description="Mean wait for first review, PRs first reviewed that day" data={a.trends} valueKey="reviewDelay" kind="line" format={formatHours} duration emptyLabel="No first reviews" />
            <TrendChart title="PR throughput" description="PRs merged per day" data={a.trends} valueKey="prThroughput" kind="bar" format={(v) => formatCount(v)} emptyLabel="No PRs merged" />
            <TrendChart title="Code churn" description="Lines added + deleted per day, non-merge commits" data={a.trends} valueKey="codeChurn" kind="bar" format={(v) => formatCount(v)} emptyLabel="No code changes" />
          </div>
        </>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Recent pull requests"
          actions={<Link to={`${base}/pull-requests`} className="text-xs text-primary hover:underline">View all</Link>}
          flush
        >
          {recent.isLoading ? (
            <LoadingState />
          ) : recent.error ? (
            <ErrorState message={recent.error.message} onRetry={() => recent.refetch()} />
          ) : recent.data && recent.data.items.length > 0 ? (
            <ul className="divide-y divide-border">
              {recent.data.items.map((pr) => (
                <PrLine key={pr.id} pr={pr} detail={<PullRequestStatusBadge status={pr.status} />} />
              ))}
            </ul>
          ) : (
            <EmptyState message="No pull requests synced." />
          )}
        </Panel>

        <Panel title="Review activity" description="Most recently reviewed PRs and their wait for a first review" flush>
          {reviewed.isLoading ? (
            <LoadingState />
          ) : reviewed.error ? (
            <ErrorState message={reviewed.error.message} onRetry={() => reviewed.refetch()} />
          ) : reviewed.data && reviewed.data.items.some((p) => p.firstReviewAt) ? (
            <ul className="divide-y divide-border">
              {reviewed.data.items
                .filter((p) => p.firstReviewAt)
                .map((pr) => (
                  <PrLine key={pr.id} pr={pr} detail={`first review after ${formatHours(pr.firstReviewTime)}`} />
                ))}
            </ul>
          ) : (
            <EmptyState message="No pull requests have been reviewed by someone other than their author." />
          )}
        </Panel>
      </div>

      <Panel
        title="Contributor activity"
        description={`Last ${days} days, alphabetical`}
        actions={<Link to={{ pathname: `${base}/contributors`, search: days === 30 ? '' : `?days=${days}` }} className="text-xs text-primary hover:underline">View all</Link>}
        flush
      >
        {contributors.isLoading ? (
          <LoadingState />
        ) : contributors.error ? (
          <ErrorState message={contributors.error.message} onRetry={() => contributors.refetch()} />
        ) : contributors.data && contributors.data.contributors.length > 0 ? (
          <ContributorTable contributors={contributors.data.contributors.slice(0, 8)} compact />
        ) : (
          <EmptyState message={`No contributor activity in the last ${days} days.`} />
        )}
      </Panel>
    </div>
  );
}
