import { cn } from '@/utils/cn';

interface SegmentedControlProps<T extends string | number> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  'aria-label': string;
  size?: 'sm' | 'md';
}

/** Compact single-choice toggle (e.g. 7d / 30d / 90d). */
export function SegmentedControl<T extends string | number>({
  value,
  options,
  onChange,
  size = 'sm',
  ...aria
}: SegmentedControlProps<T>) {
  return (
    <div role="radiogroup" aria-label={aria['aria-label']} className="inline-flex rounded border border-border bg-muted/40 p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-[3px] font-medium tabular-nums transition-colors whitespace-nowrap',
              size === 'sm' ? 'h-6 px-2 text-xs' : 'h-7 px-2.5 text-sm',
              active ? 'bg-background text-foreground shadow-[0_0_0_1px_hsl(var(--border))]' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
