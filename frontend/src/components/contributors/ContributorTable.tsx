import type { ContributorActivity } from '@/types';
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { Sparkline } from '@/components/charts/Sparkline';
import { Avatar } from '@/components/layout/AccountMenu';
import { formatCount, formatRelative } from '@/utils/format';

// Alphabetical and unsortable on purpose: RepoPulse describes repository
// activity; it does not rank people.
export function ContributorTable({ contributors, compact }: { contributors: ContributorActivity[]; compact?: boolean }) {
  return (
    <Table>
      <Thead>
        <tr>
          <Th>Contributor</Th>
          <Th className="text-right">Commits</Th>
          <Th className="text-right">PRs opened</Th>
          <Th className="text-right hidden sm:table-cell">PRs merged</Th>
          <Th className="text-right">Reviews</Th>
          <Th className="text-right hidden md:table-cell">Additions</Th>
          <Th className="text-right hidden md:table-cell">Deletions</Th>
          {!compact && <Th className="hidden lg:table-cell">Weekly activity</Th>}
          {!compact && <Th className="hidden lg:table-cell">Last active</Th>}
        </tr>
      </Thead>
      <Tbody>
        {contributors.map((c) => (
          <Tr key={c.contributorId}>
            <Td>
              <span className="inline-flex items-center gap-2 min-w-0">
                <Avatar user={{ id: c.contributorId, login: c.login, name: null, avatarUrl: c.avatarUrl }} size={18} />
                <span className="font-medium truncate">{c.login}</span>
              </span>
            </Td>
            <Td className="text-right tabular-nums">{formatCount(c.commits)}</Td>
            <Td className="text-right tabular-nums">{formatCount(c.prsOpened)}</Td>
            <Td className="text-right tabular-nums hidden sm:table-cell">{formatCount(c.prsMerged)}</Td>
            <Td className="text-right tabular-nums">{formatCount(c.reviews)}</Td>
            <Td className="text-right tabular-nums hidden md:table-cell text-emerald-700">+{formatCount(c.additions)}</Td>
            <Td className="text-right tabular-nums hidden md:table-cell text-red-700">−{formatCount(c.deletions)}</Td>
            {!compact && (
              <Td className="hidden lg:table-cell">
                <Sparkline values={c.weeklyActivity} label={`${c.login} weekly commits, PRs and reviews`} />
              </Td>
            )}
            {!compact && <Td className="hidden lg:table-cell text-muted-foreground">{formatRelative(c.lastActiveAt)}</Td>}
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}
