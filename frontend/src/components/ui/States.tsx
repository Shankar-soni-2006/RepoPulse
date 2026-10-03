import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message = 'Something went wrong', onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
      <AlertCircle className="h-8 w-8 text-destructive" />
      <p className="text-sm">{message}</p>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          <RefreshCw className="h-3 w-3" />
          Retry
        </Button>
      )}
    </div>
  );
}

export function LoadingState({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
      <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      <p className="text-sm">{message}</p>
    </div>
  );
}

export function EmptyState({ message = 'No data available' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
      <p className="text-sm">{message}</p>
    </div>
  );
}
