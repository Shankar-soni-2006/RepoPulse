import { useState } from 'react';
import { Search } from 'lucide-react';
import { useShellRepository } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { ContributorTable } from '@/components/contributors/ContributorTable';
import { Input } from '@/components/ui/Input';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useContributorActivity } from '@/hooks/useAnalytics';
import { usePeriod } from '@/hooks/usePeriod';

export function ContributorsPage() {
  const repo = useShellRepository();
  const [days] = usePeriod();
  const { data, isLoading, error, refetch } = useContributorActivity(repo.id, days);
  const [filter, setFilter] = useState('');

  const q = filter.trim().toLowerCase();
  const rows = (data?.contributors ?? []).filter((c) => !q || c.login.toLowerCase().includes(q));

  return (
    <div className="p-4 sm:p-6 max-w-[1400px]">
      <PageHeader
        title="Contributors"
        subtitle="Repository activity per person in the period, listed alphabetically. RepoPulse describes activity; it does not rank or evaluate people."
        period
      />

      <div className="rounded-md border border-border">
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
          <div className="relative flex-1 min-w-[12rem] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by login" aria-label="Filter contributors" className="pl-8" />
          </div>
          {data && (
            <span className="text-xs text-muted-foreground tabular-nums ml-auto">
              {rows.length} of {data.contributors.length} active in the last {days} days
            </span>
          )}
        </div>

        {isLoading && <LoadingState message="Loading contributors…" />}
        {error && <ErrorState message={error.message} onRetry={() => refetch()} />}
        {data && data.contributors.length === 0 && <EmptyState message={`No contributor activity in the last ${days} days.`} />}
        {data && data.contributors.length > 0 && rows.length === 0 && <EmptyState message="No contributors match this filter." />}
        {rows.length > 0 && <ContributorTable contributors={rows} />}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Weekly activity counts commits, PRs opened and reviews in 7-day buckets. Lines come from non-merge commits with known stats. Commits whose author email isn’t linked to a GitHub account aren’t attributed.
      </p>
    </div>
  );
}
