import { useEffect } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { usePullRequest } from '@/hooks/useAnalytics';
import { PullRequestStatusBadge } from './PullRequestStatusBadge';
import { Badge } from '@/components/ui/Badge';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { formatCount, formatDateTime, formatHours } from '@/utils/format';
import type { Repository, Review } from '@/types';

const REVIEW_LABEL: Record<Review['state'], string> = {
  approved: 'Approved',
  changes_requested: 'Changes requested',
  commented: 'Commented',
  dismissed: 'Dismissed',
  pending: 'Pending',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="text-sm tabular-nums truncate">{children}</dd>
    </div>
  );
}

/** Slide-over with one PR's details and reviews. */
export function PullRequestDetailPanel({
  repository,
  pullRequestId,
  onClose,
}: {
  repository: Repository;
  pullRequestId: string;
  onClose: () => void;
}) {
  const { data: pr, isLoading, error, refetch } = usePullRequest(repository.id, pullRequestId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const githubUrl = pr ? `${repository.htmlUrl ?? `https://github.com/${repository.fullName}`}/pull/${pr.number}` : null;

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Pull request details">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-lg flex-col border-l border-border bg-background">
        <header className="flex items-start gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            {pr ? (
              <>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="tabular-nums">#{pr.number}</span>
                  <PullRequestStatusBadge status={pr.status} />
                </div>
                <h2 className="mt-1 text-sm font-semibold leading-snug">{pr.title}</h2>
              </>
            ) : (
              <h2 className="text-sm font-semibold">Pull request</h2>
            )}
          </div>
          {githubUrl && (
            <a href={githubUrl} target="_blank" rel="noopener noreferrer" className="p-1 text-muted-foreground hover:text-foreground" aria-label="Open on GitHub" title="Open on GitHub">
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
          <button type="button" onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {isLoading && <LoadingState message="Loading pull request…" />}
          {error && <ErrorState message={error.message} onRetry={() => refetch()} />}
          {pr && (
            <>
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2.5">
                <Field label="Author">{pr.authorLogin}</Field>
                <Field label="Created">{formatDateTime(pr.createdAt)}</Field>
                <Field label="Updated">{formatDateTime(pr.updatedAt)}</Field>
                <Field label="Merged">{formatDateTime(pr.mergedAt)}</Field>
                <Field label="Cycle time">{formatHours(pr.cycleTime)}</Field>
                <Field label="First review">{formatHours(pr.firstReviewTime)}</Field>
                <Field label="Lines">
                  <span className="text-emerald-700 dark:text-emerald-400">+{formatCount(pr.additions)}</span>{' '}
                  <span className="text-red-700 dark:text-red-300">−{formatCount(pr.deletions)}</span>
                </Field>
                <Field label="Changed files">{formatCount(pr.changedFiles)}</Field>
                <Field label="Reviews">{pr.reviewCount}</Field>
              </dl>

              {pr.labels.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {pr.labels.map((l) => (
                    <Badge key={l} variant="muted">
                      {l}
                    </Badge>
                  ))}
                </div>
              )}

              <section>
                <h3 className="text-xs font-semibold mb-1">Description</h3>
                {pr.body ? (
                  <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground max-h-60 overflow-y-auto rounded border border-border bg-muted/30 p-2">
                    {pr.body}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">No description.</p>
                )}
              </section>

              <section>
                <h3 className="text-xs font-semibold mb-1">Reviews</h3>
                {pr.reviews.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No reviews.</p>
                ) : (
                  <ul className="divide-y divide-border rounded border border-border">
                    {pr.reviews.map((r) => (
                      <li key={r.id} className="flex items-center gap-2 px-2 py-1.5 text-xs">
                        <span className="font-medium min-w-0 truncate">{r.reviewerLogin}</span>
                        <Badge variant={r.state === 'approved' ? 'success' : r.state === 'changes_requested' ? 'warning' : 'muted'}>
                          {REVIEW_LABEL[r.state]}
                        </Badge>
                        <span className="ml-auto text-muted-foreground tabular-nums whitespace-nowrap">
                          {r.submittedAt ? formatDateTime(r.submittedAt) : 'not submitted'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  First review time counts the first submitted review by someone other than the author.
                </p>
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
