import type { ReactNode } from 'react';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { PERIODS, usePeriod } from '@/hooks/usePeriod';

interface PageHeaderProps {
  title: string;
  /** One line under the title */
  subtitle?: ReactNode;
  /** Show the 7/30/90-day period switch */
  period?: boolean;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, period, actions }: PageHeaderProps) {
  const [days, setDays] = usePeriod();
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-2 mb-4">
      <div className="min-w-0 flex-1">
        <h1 className="text-base font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {actions}
      {period && (
        <SegmentedControl
          aria-label="Time period"
          value={days}
          onChange={setDays}
          options={PERIODS.map((d) => ({ value: d, label: `${d}d` }))}
        />
      )}
    </div>
  );
}
