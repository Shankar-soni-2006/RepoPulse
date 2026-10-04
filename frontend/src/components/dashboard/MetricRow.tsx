import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { ComparableMetric, MetricsSummary } from '@/types';
import { formatChange, formatCount, formatHours } from '@/utils/format';
import { cn } from '@/utils/cn';

// How a rise in each metric should read. Only metrics with a clear "better"
// direction get good/bad color; volume metrics stay neutral.
type Direction = 'lowerIsBetter' | 'higherIsBetter' | 'neutral';

export interface MetricSpec {
  key: ComparableMetric;
  label: string;
  /** Short definition shown under the value */
  hint: string;
  format: (v: number | null) => string;
  direction: Direction;
}

const lines = (v: number | null) => (v === null ? '—' : `${formatCount(Math.round(v))} lines`);
const count = (v: number | null) => formatCount(v);

export const METRICS: Record<ComparableMetric, MetricSpec> = {
  cycleTime: { key: 'cycleTime', label: 'PR cycle time', hint: 'median, open → merge', format: formatHours, direction: 'lowerIsBetter' },
  firstReviewTime: { key: 'firstReviewTime', label: 'First review', hint: 'median wait', format: formatHours, direction: 'lowerIsBetter' },
  reviewDelay: { key: 'reviewDelay', label: 'Review delay', hint: 'mean wait for first review', format: formatHours, direction: 'lowerIsBetter' },
  prThroughput: { key: 'prThroughput', label: 'Throughput', hint: 'PRs merged', format: count, direction: 'higherIsBetter' },
  prsOpened: { key: 'prsOpened', label: 'PRs opened', hint: 'created in period', format: count, direction: 'neutral' },
  prSize: { key: 'prSize', label: 'PR size', hint: 'median lines, merged PRs', format: lines, direction: 'lowerIsBetter' },
  codeChurn: { key: 'codeChurn', label: 'Code churn', hint: 'lines added + deleted', format: lines, direction: 'neutral' },
  commitCount: { key: 'commitCount', label: 'Commits', hint: 'default branch', format: count, direction: 'neutral' },
  reviewCount: { key: 'reviewCount', label: 'Reviews', hint: 'submitted', format: count, direction: 'neutral' },
  activeContributors: { key: 'activeContributors', label: 'Active contributors', hint: 'committed, opened or reviewed', format: count, direction: 'neutral' },
};

function Delta({ change, direction, days }: { change: number | null; direction: Direction; days: number }) {
  if (change === null) {
    return <span className="text-[11px] text-muted-foreground">no comparison</span>;
  }
  const up = change > 0;
  const flat = change === 0;
  const good = flat || direction === 'neutral' ? null : direction === 'lowerIsBetter' ? !up : up;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums',
        good === null && 'text-muted-foreground',
        good === true && 'text-emerald-700',
        good === false && 'text-red-700',
      )}
      title={`${formatChange(change)} vs previous ${days} days${good === null ? '' : good ? ' (improved)' : ' (worse)'}`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {formatChange(change)}
      <span className="font-normal text-muted-foreground">vs prev</span>
    </span>
  );
}

/** Compact strip of headline metrics with change vs the previous period. */
export function MetricRow({ summary, metrics }: { summary: MetricsSummary; metrics: ComparableMetric[] }) {
  return (
    // 1px gaps over the border color draw hairline separators at every breakpoint
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-px overflow-hidden rounded-md border border-border bg-border">
      {metrics.map((key) => {
        const spec = METRICS[key];
        return (
          <div key={key} className="bg-background px-3 py-2.5 min-w-0">
            <div className="text-[11px] font-medium text-muted-foreground truncate">{spec.label}</div>
            <div className="mt-0.5 text-xl font-semibold tracking-tight text-foreground">{spec.format(summary.metrics[key])}</div>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
              <Delta change={summary.changes[key]} direction={spec.direction} days={summary.period.days} />
            </div>
            <div className="text-[11px] text-muted-foreground truncate">{spec.hint}</div>
          </div>
        );
      })}
    </div>
  );
}
