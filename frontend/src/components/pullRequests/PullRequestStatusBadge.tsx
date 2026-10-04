import { GitMerge, GitPullRequest, GitPullRequestClosed } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import type { PullRequestStatus } from '@/types';

const STATUS = {
  open: { label: 'Open', icon: GitPullRequest, variant: 'success' },
  merged: { label: 'Merged', icon: GitMerge, variant: 'default' },
  closed: { label: 'Closed', icon: GitPullRequestClosed, variant: 'muted' },
} as const;

export function PullRequestStatusBadge({ status }: { status: PullRequestStatus }) {
  const { label, icon: Icon, variant } = STATUS[status];
  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </Badge>
  );
}
