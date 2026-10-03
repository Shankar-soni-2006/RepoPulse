import { Badge, type BadgeProps } from '@/components/ui/Badge';
import type { Repository } from '@/types';

const STATUS: Record<Repository['syncStatus'], { label: string; variant: BadgeProps['variant'] }> = {
  never: { label: 'Not synced', variant: 'muted' },
  synced: { label: 'Synced', variant: 'success' },
  syncing: { label: 'Syncing', variant: 'default' },
  failed: { label: 'Sync failed', variant: 'danger' },
};

export function SyncStatusBadge({ repository }: { repository: Pick<Repository, 'syncStatus' | 'syncError'> }) {
  const { label, variant } = STATUS[repository.syncStatus];
  return (
    <Badge variant={variant} title={repository.syncError ?? undefined}>
      {label}
    </Badge>
  );
}
