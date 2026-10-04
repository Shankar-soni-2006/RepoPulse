import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useShellRepository } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { PullRequestTable, type SortState } from '@/components/pullRequests/PullRequestTable';
import { PullRequestDetailPanel } from '@/components/pullRequests/PullRequestDetailPanel';
import { Pagination } from '@/components/ui/Pagination';
import { Input, Select } from '@/components/ui/Input';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { usePullRequests } from '@/hooks/useAnalytics';
import type { PullRequestListQuery, PullRequestSort, PullRequestStatus } from '@/types';

const PAGE_SIZE = 25;
const RANGES = [
  { value: '', label: 'Any time' },
  { value: '7', label: 'Created in last 7 days' },
  { value: '30', label: 'Created in last 30 days' },
  { value: '90', label: 'Created in last 90 days' },
];

export function PullRequestsPage() {
  const repo = useShellRepository();
  // Filters live in the URL so a filtered view can be shared or reloaded
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? '') as PullRequestStatus | '';
  const created = params.get('created') ?? '';
  const sort = (params.get('sort') ?? 'created') as PullRequestSort;
  const order = (params.get('order') ?? 'desc') as 'asc' | 'desc';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const selected = params.get('pr');

  const [searchInput, setSearchInput] = useState(params.get('q') ?? '');
  const search = params.get('q') ?? '';

  const update = (patch: Record<string, string | null>, resetPage = true) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null || v === '') p.delete(k);
          else p.set(k, v);
        }
        if (resetPage) p.delete('page');
        return p;
      },
      { replace: true },
    );

  // Debounce typing into the URL
  useEffect(() => {
    const t = setTimeout(() => searchInput !== search && update({ q: searchInput.trim() }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // The created-range bound is computed once per selection so the query key stays stable
  const fromDate = useMemo(
    () => (created ? new Date(Date.now() - Number(created) * 86_400_000).toISOString() : undefined),
    [created],
  );

  const query: PullRequestListQuery = {
    status: status || undefined,
    search: search || undefined,
    from: fromDate,
    sort,
    order,
    page,
    limit: PAGE_SIZE,
  };
  const { data, isLoading, isFetching, error, refetch } = usePullRequests(repo.id, query);

  return (
    <div className="p-4 sm:p-6 max-w-[1400px]">
      <PageHeader
        title="Pull requests"
        subtitle="Durations: cycle time = open → merge; first review = open → first review by someone other than the author."
      />

      <div className="rounded-md border border-border">
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
          <div className="relative flex-1 min-w-[12rem]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search title or #number"
              aria-label="Search pull requests"
              className="pl-8"
            />
          </div>
          <Select value={status} onChange={(e) => update({ status: e.target.value })} aria-label="Status">
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="merged">Merged</option>
            <option value="closed">Closed (not merged)</option>
          </Select>
          <Select value={created} onChange={(e) => update({ created: e.target.value })} aria-label="Created">
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
          {isFetching && !isLoading && <span className="text-xs text-muted-foreground">Updating…</span>}
        </div>

        {isLoading && <LoadingState message="Loading pull requests…" />}
        {error && <ErrorState message={error.message} onRetry={() => refetch()} />}
        {data && data.items.length === 0 && (
          <EmptyState
            message={search || status || created ? 'No pull requests match these filters.' : 'No pull requests have been synced for this repository.'}
          />
        )}
        {data && data.items.length > 0 && (
          <>
            <PullRequestTable
              items={data.items}
              sort={{ sort, order }}
              onSort={(s: SortState) => update({ sort: s.sort, order: s.order })}
              onSelect={(pr) => update({ pr: pr.id }, false)}
              selectedId={selected}
            />
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={(p) => update({ page: String(p) }, false)} />
          </>
        )}
      </div>

      {selected && <PullRequestDetailPanel repository={repo} pullRequestId={selected} onClose={() => update({ pr: null }, false)} />}
    </div>
  );
}
