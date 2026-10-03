import { Navigate, useSearchParams } from 'react-router-dom';
import { Activity, CircleAlert, Github } from 'lucide-react';
import { useSession } from '@/hooks/useSession';
import { authService } from '@/services/authService';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/States';

// Codes come from the backend OAuth callback (?error=...)
const ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'GitHub authorization was cancelled.',
  state_mismatch: 'The sign-in attempt expired or was started in another tab. Please try again.',
  github_rate_limited: 'GitHub rate limit reached. Please try again in a few minutes.',
  invalid_callback: 'GitHub returned an incomplete response. Please try again.',
};
const GENERIC_ERROR = 'Signing in with GitHub failed. Please try again.';

export function LoginPage() {
  const { data: session, isLoading } = useSession();
  const [params] = useSearchParams();
  const errorCode = params.get('error');

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingState message="Checking session…" />
      </div>
    );
  }
  if (session) return <Navigate to="/repositories" replace />;

  return (
    <div className="min-h-screen bg-muted/40 flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-md border border-border bg-background">
        <div className="px-6 pt-6 pb-5 border-b border-border">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold tracking-tight">RepoPulse</span>
          </div>
          <h1 className="text-base font-semibold">Sign in</h1>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            Engineering analytics for your GitHub repositories: pull request cycle time, review
            delay, throughput and code churn.
          </p>
        </div>

        <div className="px-6 py-5 space-y-4">
          {errorCode && (
            <div
              role="alert"
              className="flex gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
            >
              <CircleAlert className="h-3.5 w-3.5 flex-shrink-0 mt-px" />
              <span>{ERROR_MESSAGES[errorCode] ?? GENERIC_ERROR}</span>
            </div>
          )}

          <Button variant="primary" className="w-full justify-center" onClick={authService.login}>
            <Github className="h-4 w-4" />
            Continue with GitHub
          </Button>

          <p className="text-xs text-muted-foreground leading-relaxed">
            RepoPulse reads repositories through its GitHub App. You choose which accounts and
            repositories it can see when you install the app.
          </p>
        </div>
      </div>
    </div>
  );
}
