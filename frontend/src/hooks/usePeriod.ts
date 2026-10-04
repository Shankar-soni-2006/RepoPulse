import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { TimePeriod } from '@/types';

export const PERIODS: TimePeriod[] = [7, 30, 90];
const DEFAULT_PERIOD: TimePeriod = 30;

/** Selected analysis period, kept in the URL (?days=7|30|90) so views are shareable. */
export function usePeriod(): [TimePeriod, (days: TimePeriod) => void] {
  const [params, setParams] = useSearchParams();
  const raw = Number(params.get('days'));
  const days = (PERIODS as number[]).includes(raw) ? (raw as TimePeriod) : DEFAULT_PERIOD;

  const setDays = useCallback(
    (next: TimePeriod) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next === DEFAULT_PERIOD) p.delete('days');
          else p.set('days', String(next));
          return p;
        },
        { replace: true },
      ),
    [setParams],
  );

  return [days, setDays];
}
