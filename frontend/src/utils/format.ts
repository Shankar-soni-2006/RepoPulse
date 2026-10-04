import { formatDistanceToNow, format, parseISO } from 'date-fns';

export function formatRelative(dateStr: string | null): string {
  if (!dateStr) return '—';
  return formatDistanceToNow(parseISO(dateStr), { addSuffix: true });
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return format(parseISO(dateStr), 'MMM d, yyyy');
}

export function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  return format(parseISO(dateStr), 'MMM d, yyyy HH:mm');
}

/** Backend durations are hours; show the unit that keeps the number readable. */
export function formatHours(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 1 / 60) return `${Math.round(hours * 3600)}s`;
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = hours / 24;
  return `${days.toFixed(1)}d`;
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Exact count with thousands separators, for tables */
export function formatCount(n: number | null): string {
  return n === null ? '—' : n.toLocaleString('en-US');
}

/** Fractional change (0.27) → "+27%". Under 1% shows one decimal. */
export function formatChange(change: number | null): string {
  if (change === null) return '—';
  const pct = change * 100;
  const abs = Math.abs(pct);
  const text = abs < 1 && abs > 0 ? abs.toFixed(1) : Math.round(abs).toString();
  return `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${text}%`;
}

/** "2026-09-14" (a UTC day from the backend) → "Sep 14" */
export function formatDay(day: string): string {
  return format(parseISO(`${day}T00:00:00Z`), 'MMM d');
}
