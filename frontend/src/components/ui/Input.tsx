import * as React from 'react';
import { cn } from '@/utils/cn';

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-8 w-full rounded border border-border bg-background px-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-8 rounded border border-border bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
