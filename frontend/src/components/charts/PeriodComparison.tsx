import { METRICS } from '@/components/dashboard/MetricRow';
import { Panel } from '@/components/ui/Panel';
import { formatChange } from '@/utils/format';
import type { ComparableMetric, MetricsSummary } from '@/types';
import { useChartColors } from './theme';

// "This period vs previous" as paired bars. Metrics have different units (hours, lines,
// counts), so there is no shared axis: each row is scaled to its own larger value and
// both values are written next to the bars. Current = series color, previous = muted.

const PREVIOUS_BAR = 'hsl(var(--muted-foreground) / 0.45)';

function Bar({ value, max, color, text, label }: { value: number | null; max: number; color: string; text: string; label: string }) {
  const pct = value === null || max <= 0 ? 0 : (value / max) * 100;
  return (
    <div className="flex items-center gap-2" title={`${label}: ${text}`}>
      <div className="h-2.5 flex-1 rounded-r-sm bg-transparent">
        {value !== null && value > 0 && (
          <div className="h-full rounded-r-[4px]" style={{ width: `max(${pct}%, 3px)`, background: color }} />
        )}
      </div>
      <span className="w-16 flex-shrink-0 text-right text-xs tabular-nums text-foreground">{text}</span>
    </div>
  );
}

export function PeriodComparison({
  summary,
  metrics,
  days,
}: {
  /** Repository analytics or the team view: anything with current/previous metrics and changes */
  summary: Pick<MetricsSummary, 'metrics' | 'previousMetrics' | 'changes'>;
  metrics: ComparableMetric[];
  days: number;
}) {
  const colors = useChartColors();
  const current = `Last ${days} days`;
  const previous = `Previous ${days} days`;

  return (
    <Panel
      title="This period vs previous"
      description="Each metric is scaled to itself; values are shown beside the bars"
      actions={
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground" aria-hidden>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-sm" style={{ background: colors.series }} />
            {current}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-sm" style={{ background: PREVIOUS_BAR }} />
            {previous}
          </span>
        </div>
      }
    >
      <ul className="grid gap-x-8 gap-y-3 md:grid-cols-2">
        {metrics.map((key) => {
          const spec = METRICS[key];
          const now = summary.metrics[key];
          const before = summary.previousMetrics[key];
          const max = Math.max(now ?? 0, before ?? 0);
          const change = summary.changes[key];
          // Nothing in either period: one line instead of two empty bars
          const none = !now && !before;
          return (
            <li
              key={key}
              aria-label={`${spec.label}: ${current.toLowerCase()} ${spec.format(now)}, ${previous.toLowerCase()} ${spec.format(before)}${change === null ? '' : `, change ${formatChange(change)}`}`}
            >
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium">{spec.label}</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">{change === null ? spec.hint : formatChange(change)}</span>
              </div>
              {none ? (
                <p className="text-[11px] text-muted-foreground" aria-hidden>
                  {now === 0 || before === 0 ? 'None' : 'No data'} in either period
                </p>
              ) : (
                <div className="space-y-[2px]" aria-hidden>
                  <Bar value={now} max={max} color={colors.series} text={spec.format(now)} label={current} />
                  <Bar value={before} max={max} color={PREVIOUS_BAR} text={spec.format(before)} label={previous} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
