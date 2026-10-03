import { useQuery } from '@tanstack/react-query';
import { authService } from '@/services/authService';

export const SESSION_QUERY_KEY = ['session'] as const;

/** `data` is the session, or null when signed out. */
export function useSession() {
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: authService.me,
    staleTime: 5 * 60_000,
  });
}
