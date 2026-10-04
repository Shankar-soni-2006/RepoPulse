import { Info } from 'lucide-react';
import type { DataQuality } from '@/types';
import { formatDate, formatRelative } from '@/utils/format';

/** Backend-reported caveats for the numbers on screen. Always visible, never hidden behind hover. */
export function DataQualityNotice({ quality, compact }: { quality: DataQuality; compact?: boolean }) {
  // The UTC/default-branch note is constant; show it once, de-emphasized
  const notes = quality.limitations.filter((l) => !l.startsWith('Commits are counted on the default branch'));
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      <div className="flex items-start gap-2">
        <Info className="h-3.5 w-3.5 mt-px flex-shrink-0" aria-hidden />
        <div className="min-w-0 space-y-0.5">
          {notes.map((n) => (
            <p key={n} className="text-foreground/80">
              {n}
            </p>
          ))}
          <p>
            Data since {formatDate(quality.dataSince)} · synced {formatRelative(quality.lastSyncedAt)}
            {quality.commitStatsCoverage !== null && quality.commitStatsCoverage < 1 && (
              <> · line stats for {Math.round(quality.commitStatsCoverage * 100)}% of commits</>
            )}
            {!compact && <> · default branch only · days in UTC</>}
          </p>
        </div>
      </div>
    </div>
  );
}
