import { Navigate, Outlet } from 'react-router-dom';
import { useSession } from '@/hooks/useSession';
import { ErrorState, LoadingState } from '@/components/ui/States';

// Gate for signed-in routes. Signed-out users go to /login; API failures get a retry.
export function RequireAuth() {
  const { data: session, isLoading, error, refetch } = useSession();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingState message="Checking session…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <ErrorState message={error.message} onRetry={() => refetch()} />
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;

  return <Outlet />;
}
