import { useShellRepository } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { METRICS } from '@/components/dashboard/MetricRow';
import { DataQualityNotice } from '@/components/dashboard/DataQualityNotice';
import { TrendChart } from '@/components/charts/TrendChart';
import { PeriodComparison } from '@/components/charts/PeriodComparison';
import { Panel } from '@/components/ui/Panel';
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useAnalytics } from '@/hooks/useAnalytics';
import { usePeriod } from '@/hooks/usePeriod';
import { formatChange, formatCount, formatHours } from '@/utils/format';
import type { ComparableMetric } from '@/types';

const ORDER: ComparableMetric[] = [
  'cycleTime',
  'firstReviewTime',
  'reviewDelay',
  'prSize',
  'prThroughput',
  'prsOpened',
  'reviewCount',
  'commitCount',
  'codeChurn',
  'activeContributors',
];

const count = (v: number | null) => formatCount(v);
const lines = (v: number | null) => (v === null ? '—' : formatCount(Math.round(v)));

export function AnalyticsPage() {
  const repo = useShellRepository();
  const [days] = usePeriod();
  const { data: a, isLoading, error, refetch } = useAnalytics(repo.id, days);

  if (!repo.lastSyncedAt) {
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="Analytics" />
        <EmptyState message="Sync this repository to see its analytics." />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-[1400px]">
      <PageHeader title="Analytics" subtitle={`Engineering metrics for the last ${days} days, compared with the ${days} days before`} period />

      {isLoading && <LoadingState message="Loading analytics…" />}
      {error && <ErrorState message={error.message} onRetry={() => refetch()} />}

      {a && (
        <>
          <DataQualityNotice quality={a.dataQuality} />

          <PeriodComparison summary={a} metrics={ORDER} days={days} />

          <Panel title="Metrics" description="Durations are medians unless noted; review delay is the mean first-review wait" flush>
            <Table>
              <Thead>
                <tr>
                  <Th>Metric</Th>
                  <Th className="text-right">Last {days} days</Th>
                  <Th className="text-right">Previous {days} days</Th>
                  <Th className="text-right">Change</Th>
                  <Th className="hidden md:table-cell">Definition</Th>
                </tr>
              </Thead>
              <Tbody>
                {ORDER.map((key) => {
                  const spec = METRICS[key];
                  return (
                    <Tr key={key}>
                      <Td className="font-medium">{spec.label}</Td>
                      <Td className="text-right tabular-nums">{spec.format(a.metrics[key])}</Td>
                      <Td className="text-right tabular-nums text-muted-foreground">{spec.format(a.previousMetrics[key])}</Td>
                      <Td className="text-right tabular-nums">{formatChange(a.changes[key])}</Td>
                      <Td className="hidden md:table-cell text-xs text-muted-foreground">{spec.hint}</Td>
                    </Tr>
                  );
                })}
                <Tr>
                  <Td className="font-medium">Open PRs without review</Td>
                  <Td className="text-right tabular-nums">{formatCount(a.metrics.openPrsWithoutReview)}</Td>
                  <Td className="text-right tabular-nums text-muted-foreground">{formatCount(a.previousMetrics.openPrsWithoutReview)}</Td>
                  <Td className="text-right text-muted-foreground">—</Td>
                  <Td className="hidden md:table-cell text-xs text-muted-foreground">
                    at period end{a.metrics.oldestUnreviewedWait !== null && <> · oldest waiting {formatHours(a.metrics.oldestUnreviewedWait)}</>}
                  </Td>
                </Tr>
              </Tbody>
            </Table>
          </Panel>

          <h2 className="pt-2 text-sm font-semibold">Pull request flow</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <TrendChart title="Cycle time" description="Median, PRs merged that day" data={a.trends} valueKey="cycleTime" kind="line" format={formatHours} duration emptyLabel="No PRs merged" />
            <TrendChart title="First review time" description="Median, PRs first reviewed that day" data={a.trends} valueKey="firstReviewTime" kind="line" format={formatHours} duration emptyLabel="No first reviews" />
            <TrendChart title="Review delay" description="Mean first-review wait, PRs first reviewed that day" data={a.trends} valueKey="reviewDelay" kind="line" format={formatHours} duration emptyLabel="No first reviews" />
            <TrendChart title="PR size" description="Median lines changed, PRs merged that day" data={a.trends} valueKey="prSize" kind="line" format={lines} emptyLabel="No PRs merged" />
            <TrendChart title="PRs merged" description="Throughput per day" data={a.trends} valueKey="prThroughput" kind="bar" format={count} emptyLabel="No PRs merged" />
            <TrendChart title="PRs opened" description="Per day" data={a.trends} valueKey="prsOpened" kind="bar" format={count} emptyLabel="No PRs opened" />
          </div>

          <h2 className="pt-2 text-sm font-semibold">Repository activity</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <TrendChart title="Commits" description="Default branch, per day" data={a.trends} valueKey="commitCount" kind="bar" format={count} emptyLabel="No commits" />
            <TrendChart title="Code churn" description="Lines added + deleted per day, non-merge commits" data={a.trends} valueKey="codeChurn" kind="bar" format={count} emptyLabel="No code changes" />
            <TrendChart title="Reviews" description="Submitted per day, excluding self-reviews" data={a.trends} valueKey="reviewCount" kind="bar" format={count} emptyLabel="No reviews" />
            <TrendChart title="Active contributors" description="Distinct people active per day" data={a.trends} valueKey="activeContributors" kind="bar" format={count} emptyLabel="No activity" />
          </div>
        </>
      )}
    </div>
  );
}
