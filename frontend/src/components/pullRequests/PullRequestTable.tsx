import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { PullRequest, PullRequestSort } from '@/types';
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { PullRequestStatusBadge } from './PullRequestStatusBadge';
import { formatCount, formatDate, formatHours } from '@/utils/format';
import { cn } from '@/utils/cn';

export interface SortState {
  sort: PullRequestSort;
  order: 'asc' | 'desc';
}

interface Column {
  label: string;
  sort?: PullRequestSort;
  align?: 'right';
  className?: string;
}

const COLUMNS: Column[] = [
  { label: '#', sort: 'number', align: 'right' },
  { label: 'Title' },
  { label: 'Author', className: 'hidden md:table-cell' },
  { label: 'Status' },
  { label: 'Created', sort: 'created' },
  { label: 'First review', sort: 'firstReview', align: 'right', className: 'hidden lg:table-cell' },
  { label: 'Merged', sort: 'merged', className: 'hidden lg:table-cell' },
  { label: 'Cycle time', sort: 'cycleTime', align: 'right' },
  { label: 'Size', sort: 'prSize', align: 'right', className: 'hidden sm:table-cell' },
  { label: 'Reviews', sort: 'reviewCount', align: 'right', className: 'hidden md:table-cell' },
];

function SortHeader({ column, sort, onSort }: { column: Column; sort: SortState; onSort: (s: SortState) => void }) {
  if (!column.sort) return <Th className={cn(column.align === 'right' && 'text-right', column.className)}>{column.label}</Th>;
  const active = sort.sort === column.sort;
  const Icon = !active ? ArrowUpDown : sort.order === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      className={cn('px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap', column.align === 'right' ? 'text-right' : 'text-left', column.className)}
      aria-sort={active ? (sort.order === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() =>
          onSort({ sort: column.sort!, order: active && sort.order === 'desc' ? 'asc' : 'desc' })
        }
        className={cn('inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground', active && 'text-foreground')}
      >
        {column.label}
        <Icon className={cn('h-3 w-3', !active && 'opacity-40')} aria-hidden />
      </button>
    </th>
  );
}

export function PullRequestTable({
  items,
  sort,
  onSort,
  onSelect,
  selectedId,
}: {
  items: PullRequest[];
  sort: SortState;
  onSort: (s: SortState) => void;
  onSelect: (pr: PullRequest) => void;
  selectedId?: string | null;
}) {
  return (
    <Table>
      <Thead>
        <tr>
          {COLUMNS.map((c) => (
            <SortHeader key={c.label} column={c} sort={sort} onSort={onSort} />
          ))}
        </tr>
      </Thead>
      <Tbody>
        {items.map((pr) => (
          <Tr key={pr.id} onClick={() => onSelect(pr)} className={cn(selectedId === pr.id && 'bg-muted/60')}>
            <Td className="text-right tabular-nums text-muted-foreground">{pr.number}</Td>
            <Td className="max-w-[18rem] sm:max-w-[26rem]">
              <span className="block truncate font-medium" title={pr.title}>
                {pr.title}
              </span>
            </Td>
            <Td className="hidden md:table-cell text-muted-foreground">{pr.authorLogin}</Td>
            <Td>
              <PullRequestStatusBadge status={pr.status} />
            </Td>
            <Td className="text-muted-foreground tabular-nums">{formatDate(pr.createdAt)}</Td>
            <Td className="hidden lg:table-cell text-right tabular-nums">{formatHours(pr.firstReviewTime)}</Td>
            <Td className="hidden lg:table-cell text-muted-foreground tabular-nums">{formatDate(pr.mergedAt)}</Td>
            <Td className="text-right tabular-nums">{formatHours(pr.cycleTime)}</Td>
            <Td className="hidden sm:table-cell text-right tabular-nums" title={`+${pr.additions} −${pr.deletions}`}>
              {formatCount(pr.prSize)}
            </Td>
            <Td className="hidden md:table-cell text-right tabular-nums">{pr.reviewCount}</Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}
