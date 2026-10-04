import { GRID_COLOR, SERIES_COLOR } from './theme';

/** Tiny inline trend of backend-provided values (e.g. weekly activity). Values are labeled for screen readers. */
export function Sparkline({ values, label, width = 80, height = 20 }: { values: number[]; label: string; width?: number; height?: number }) {
  if (values.length === 0) return <span className="text-muted-foreground">—</span>;
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? (width - 4) / (values.length - 1) : 0;
  const y = (v: number) => height - 2 - (v / max) * (height - 4);
  const points = values.map((v, i) => `${2 + i * step},${y(v)}`).join(' ');
  const last = values.length - 1;
  return (
    <svg width={width} height={height} role="img" aria-label={`${label}: ${values.join(', ')}`} className="overflow-visible">
      <line x1={2} x2={width - 2} y1={height - 2} y2={height - 2} stroke={GRID_COLOR} strokeWidth={1} />
      {values.length > 1 && (
        <polyline points={points} fill="none" stroke={SERIES_COLOR} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      )}
      <circle cx={2 + last * step} cy={y(values[last])} r={2.5} fill={SERIES_COLOR} />
    </svg>
  );
}
