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

export function formatHours(hours: number | null): string {
  if (hours === null) return '—';
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
