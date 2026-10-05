import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { Activity, CircleAlert, Github, ShieldCheck } from 'lucide-react';
import { useSession } from '@/hooks/useSession';
import { authService } from '@/services/authService';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { LoadingState } from '@/components/ui/States';

// Codes come from the backend OAuth callback (?error=...)
const ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'GitHub authorization was cancelled.',
  state_mismatch: 'The sign-in attempt expired or was started in another tab. Please try again.',
  github_rate_limited: 'GitHub rate limit reached. Please try again in a few minutes.',
  invalid_callback: 'GitHub returned an incomplete response. Please try again.',
  not_admin: 'This GitHub account isn’t a RepoPulse admin. Use the Member form, or ask an admin to change your role.',
  account_suspended: 'This account has been suspended. Contact the RepoPulse admin if you think this is a mistake.',
  oauth_code_invalid: 'The GitHub sign-in link was already used or has expired. Please try again.',
  supabase_auth_error: 'The sign-in service (Supabase Auth) returned an error. Please try again.',
};
const GENERIC_ERROR = 'Signing in with GitHub failed. Please try again.';

type LoginRole = 'member' | 'admin';

// Both forms sign in with GitHub (RepoPulse has no passwords). Picking "Admin" doesn't
// grant anything: only accounts that already have the admin role get through.
const FORMS: Record<LoginRole, { label: string; description: string; button: string }> = {
  member: {
    label: 'Member sign-in',
    description: 'See analytics for the repositories you can access on GitHub.',
    button: 'Continue with GitHub',
  },
  admin: {
    label: 'Admin sign-in',
    description: 'Manage users and roles. Only accounts with the admin role can sign in here; you land on the Admin page.',
    button: 'Sign in as admin with GitHub',
  },
};

export function LoginPage() {
  const { data: session, isPending, error, errorUpdateCount, refetch, isFetching } = useSession();
  const [params, setParams] = useSearchParams();
  const errorCode = params.get('error');
  // Which form is shown; kept in the URL so the backend can send errors back to it
  const role: LoginRole = params.get('as') === 'admin' ? 'admin' : 'member';
  const chooseRole = (next: LoginRole) =>
    setParams(next === 'admin' ? { as: 'admin' } : {}, { replace: true }); // switching clears an old error

  // Spinner only for the very first check; later re-checks keep the page in place
  if (isPending && errorUpdateCount === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingState message="Checking session…" />
      </div>
    );
  }
  if (session) return <Navigate to={role === 'admin' && session.user.role === 'admin' ? '/admin' : '/repositories'} replace />;
  const form = FORMS[role];

  return (
    <div className="relative min-h-screen bg-muted/40 flex items-center justify-center px-4">
      <ThemeToggle className="absolute right-3 top-3" />
      <div className="w-full max-w-sm rounded-md border border-border bg-background">
        <div className="px-6 pt-6 pb-5 border-b border-border">
          <Link to="/" className="flex items-center gap-2 mb-4 w-fit" aria-label="RepoPulse home">
            <Activity className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold tracking-tight">RepoPulse</span>
          </Link>
          <h1 className="text-base font-semibold">Sign in</h1>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            Engineering analytics for your GitHub repositories: pull request cycle time, review
            delay, throughput and code churn.
          </p>
        </div>

        <div className="px-6 py-5 space-y-4">
          <SegmentedControl
            aria-label="Sign in as"
            value={role}
            onChange={chooseRole}
            options={[
              { value: 'member', label: 'Member' },
              { value: 'admin', label: 'Admin' },
            ]}
          />

          {(error || (isPending && errorUpdateCount > 0)) && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded border border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-950/40 px-3 py-2 text-xs text-yellow-800 dark:text-yellow-200"
            >
              <CircleAlert className="h-3.5 w-3.5 flex-shrink-0 mt-px" />
              <span className="flex-1">
                Can’t reach the RepoPulse API. Sign-in won’t work until the backend is running.
              </span>
              <button
                type="button"
                onClick={() => refetch()}
                disabled={isFetching}
                className="font-medium underline underline-offset-2 disabled:opacity-50"
              >
                {isFetching ? 'Checking…' : 'Retry'}
              </button>
            </div>
          )}

          {errorCode && (
            <div
              role="alert"
              className="flex gap-2 rounded border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-700 dark:text-red-300"
            >
              <CircleAlert className="h-3.5 w-3.5 flex-shrink-0 mt-px" />
              <span>{ERROR_MESSAGES[errorCode] ?? GENERIC_ERROR}</span>
            </div>
          )}

          <form
            aria-label={form.label}
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              authService.login(role);
            }}
          >
            <div className="space-y-1">
              <h2 className="flex items-center gap-1.5 text-sm font-medium">
                {role === 'admin' && <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden />}
                {form.label}
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">{form.description}</p>
            </div>
            <Button type="submit" variant="primary" className="w-full justify-center">
              <Github className="h-4 w-4" />
              {form.button}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground leading-relaxed">
            RepoPulse reads repositories through its GitHub App. You choose which accounts and
            repositories it can see when you install the app.
          </p>

          <p className="text-xs text-muted-foreground">
            By continuing you agree to the{' '}
            <Link to="/#terms" className="underline underline-offset-2 hover:text-foreground">Terms of Use</Link> and{' '}
            <Link to="/#privacy" className="underline underline-offset-2 hover:text-foreground">Privacy Policy</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
