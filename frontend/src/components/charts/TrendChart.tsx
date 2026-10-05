import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import type { DailyTrend } from '@/types';
import { useChartColors } from './theme';
import { Panel } from '@/components/ui/Panel';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { formatDay } from '@/utils/format';

// Single-series trend over UTC days. Values come from the backend's daily rollups;
// the chart only displays them. Spec: 2px line / ≤24px bars with 4px rounded tops,
// hairline solid grid, crosshair tooltip, and a table view of the same numbers.

type NumericKey = {
  [K in keyof DailyTrend]: DailyTrend[K] extends number | null ? K : never;
}[keyof DailyTrend];

interface TrendChartProps {
  title: string;
  description?: string;
  data: DailyTrend[];
  valueKey: NumericKey;
  kind: 'line' | 'bar';
  /** Formats values for the tooltip and table */
  format: (v: number | null) => string;
  /**
   * Values are durations in hours. The axis then uses ONE unit for every tick
   * (minutes, hours or days, picked from the largest value) with round numbers.
   */
  duration?: boolean;
  /** Tooltip text for a day without a value (e.g. nothing merged) */
  emptyLabel?: string;
  height?: number;
}

function ChartTooltip({
  active,
  payload,
  label,
  format,
  emptyLabel,
}: TooltipContentProps<number, string> & { format: TrendChartProps['format']; emptyLabel: string }) {
  if (!active || !payload?.length) return null;
  const value = payload[0].value as number | null | undefined;
  return (
    <div className="rounded border border-border bg-background px-2 py-1.5 text-xs shadow-sm">
      <div className="text-muted-foreground">{formatDay(String(label))}</div>
      <div className="font-medium text-foreground tabular-nums">
        {value === null || value === undefined ? emptyLabel : format(value)}
      </div>
    </div>
  );
}

export function TrendChart({
  title,
  description,
  data,
  valueKey,
  kind,
  format,
  emptyLabel = 'No data',
  height = 180,
  duration,
}: TrendChartProps) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const colors = useChartColors();
  const hasValues = data.some((d) => d[valueKey] !== null && d[valueKey] !== 0);

  // Plot durations in a single unit so axis ticks are comparable and round
  const max = Math.max(0, ...data.map((d) => (d[valueKey] as number | null) ?? 0));
  const unit = !duration ? null : max >= 48 ? { label: 'd', perHour: 1 / 24 } : max >= 1 ? { label: 'h', perHour: 1 } : { label: 'm', perHour: 60 };
  const plotted = unit
    ? data.map((d) => ({ ...d, __v: d[valueKey] === null ? null : (d[valueKey] as number) * unit.perHour }))
    : data.map((d) => ({ ...d, __v: d[valueKey] }));
  const axisFormat = (v: number) => (unit ? `${Number.isInteger(v) ? v : v.toFixed(1)}${unit.label}` : format(v));
  // With many days, show fewer x labels so they never collide
  const tickInterval = data.length > 45 ? 13 : data.length > 14 ? 6 : 0;

  const common = {
    data: plotted,
    margin: { top: 8, right: 8, bottom: 0, left: 0 },
  };
  const axes = (
    <>
      <CartesianGrid vertical={false} stroke={colors.grid} strokeWidth={1} />
      <XAxis
        dataKey="date"
        tickFormatter={formatDay}
        interval={tickInterval}
        tick={{ fontSize: 11, fill: colors.axisText }}
        tickLine={false}
        axisLine={{ stroke: colors.grid }}
        minTickGap={8}
      />
      <YAxis
        width={48}
        tickFormatter={axisFormat}
        tick={{ fontSize: 11, fill: colors.axisText }}
        tickLine={false}
        axisLine={false}
        allowDecimals={false}
        // An empty period still gets a 0–1 scale, so the chart draws its baseline and grid
        domain={[0, (dataMax: number) => (dataMax > 0 ? dataMax : 1)]}
      />
      <Tooltip
        cursor={kind === 'line' ? { stroke: colors.axisText, strokeWidth: 1 } : { fill: colors.cursorFill }}
        // Tooltip shows the precise backend value, not the axis-unit conversion
        content={(props) => {
          const p = props as TooltipContentProps<number, string>;
          const row = p.payload?.[0]?.payload as DailyTrend | undefined;
          const precise = row ? [{ ...p.payload![0], value: row[valueKey] as number }] : p.payload;
          return <ChartTooltip {...p} payload={precise} format={format} emptyLabel={emptyLabel} />;
        }}
      />
    </>
  );

  return (
    <Panel
      title={title}
      description={description}
      actions={
        <SegmentedControl
          aria-label={`${title} view`}
          value={view}
          onChange={setView}
          options={[
            { value: 'chart', label: 'Chart' },
            { value: 'table', label: 'Table' },
          ]}
        />
      }
    >
      {view === 'table' ? (
        <div className="overflow-auto" style={{ maxHeight: height }}>
          <table className="w-full text-xs tabular-nums">
            <thead className="sticky top-0 bg-background">
              <tr className="text-left text-muted-foreground">
                <th className="py-1 font-medium">Day (UTC)</th>
                <th className="py-1 font-medium text-right">{title}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[...data].reverse().map((d) => (
                <tr key={d.date}>
                  <td className="py-1 text-muted-foreground">{formatDay(d.date)}</td>
                  <td className="py-1 text-right">{d[valueKey] === null ? '—' : format(d[valueKey])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          className="relative"
          style={{ height }}
          role="img"
          aria-label={hasValues ? `${title} by day. Switch to Table for the values.` : `${title}: ${emptyLabel.toLowerCase()} in this period.`}
        >
          {!hasValues && (
            // The chart still draws (zero baseline, axes); the note says why it's flat
            <div className="pointer-events-none absolute inset-x-0 top-1/3 z-10 flex justify-center">
              <span className="rounded border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
                {emptyLabel} in this period
              </span>
            </div>
          )}
          <ResponsiveContainer width="100%" height="100%">
            {kind === 'line' ? (
              <LineChart {...common}>
                {axes}
                <Line
                  // Straight segments: curves would imply values between measured days
                  type="linear"
                  dataKey="__v"
                  stroke={colors.series}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  // Days without a value stay gaps: no invented interpolation
                  connectNulls={false}
                  dot={data.length <= 31 ? { r: 3, fill: colors.series, stroke: colors.pointRing, strokeWidth: 2 } : false}
                  activeDot={{ r: 4, fill: colors.series, stroke: colors.pointRing, strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </LineChart>
            ) : (
              <BarChart {...common} barCategoryGap={2}>
                {axes}
                <Bar dataKey="__v" fill={colors.series} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}
