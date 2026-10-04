import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface PanelProps {
  title?: ReactNode;
  /** Short secondary text beside the title (units, definitions) */
  description?: ReactNode;
  /** Controls aligned right in the header */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Remove body padding (tables run edge to edge) */
  flush?: boolean;
}

/** Bordered section with an optional header row. Not a card: no shadow, small radius. */
export function Panel({ title, description, actions, children, className, flush }: PanelProps) {
  return (
    <section className={cn('rounded-md border border-border bg-background min-w-0', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-2">
          <div className="min-w-0 flex-1">
            {title && <h2 className="text-xs font-semibold text-foreground">{title}</h2>}
            {description && <p className="text-[11px] leading-tight text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className={flush ? undefined : 'p-3'}>{children}</div>
    </section>
  );
}
