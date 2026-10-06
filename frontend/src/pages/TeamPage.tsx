import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Activity, Building2, User } from 'lucide-react';
import { useSession } from '@/hooks/useSession';
import { usePeriod } from '@/hooks/usePeriod';
import { teamService } from '@/services/teamService';
import { AccountMenu, Avatar } from '@/components/layout/AccountMenu';
import { PageHeader } from '@/components/layout/PageHeader';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Panel } from '@/components/ui/Panel';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { DataQualityNotice } from '@/components/dashboard/DataQualityNotice';
import { PeriodComparison } from '@/components/charts/PeriodComparison';
import { Sparkline } from '@/components/charts/Sparkline';
import { TrendChart } from '@/components/charts/TrendChart';
import { formatCount, formatHours, formatRelative } from '@/utils/format';
import type { ComparableMetric } from '@/types';

const ORDER: ComparableMetric[] = [
  'prThroughput',
  'prsOpened',
  'cycleTime',
  'firstReviewTime',
  'reviewDelay',
  'prSize',
  'reviewCount',
  'commitCount',
  'codeChurn',
  'activeContributors',
];
const count = (v: number | null) => formatCount(v);

/**
 * Team view: every repository of one account (organization or user) combined, limited to
 * the repositories the signed-in user can access on GitHub. Numbers are recomputed over
 * the whole set: medians over all PRs together, each person counted once.
 */
export function TeamPage() {
  const { accountId = '' } = useParams();
  const [days] = usePeriod();
  const { data: session } = useSession();
  const { data: o, isLoading, error, refetch } = useQuery({
    queryKey: ['team', accountId, days],
    queryFn: () => teamService.overview(accountId, days),
  });
  const AccountIcon = o?.account.type === 'User' ? User : Building2;
  const synced = o?.account.syncedRepositoryCount ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="h-11 border-b border-border px-4 sm:px-6 flex items-center gap-3">
        <Link to="/repositories" className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="text-sm font-semibold tracking-tight whitespace-nowrap">RepoPulse</span>
        </Link>
        <span className="text-muted-foreground text-sm whitespace-nowrap hidden sm:inline">/ Team view</span>
        <div className="flex-1" />
        <ThemeToggle />
        {session && (
          <div className="w-36 sm:w-44 min-w-0">
            <AccountMenu user={session.user} />
          </div>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <PageHeader
          title={o ? `${o.account.login} · team view` : 'Team view'}
          subtitle={
            o ? (
              <span className="inline-flex items-center gap-1.5">
                <AccountIcon className="h-3 w-3" aria-hidden />
                {o.account.type === 'User' ? 'Personal account' : 'Organization'} · {synced} of {o.account.repositoryCount} repositories
                you can access, combined · last {days} days vs the {days} before
              </span>
            ) : (
              'All repositories of one account, combined'
            )
          }
          period
        />

        {isLoading && <LoadingState message="Combining repositories…" />}
        {error && (
          <ErrorState
            message={'status' in error && error.status === 404 ? 'This account doesn’t exist or you don’t have access to it.' : error.message}
            onRetry={() => refetch()}
          />
        )}

        {o && (
          <>
            <DataQualityNotice quality={o.dataQuality} />

            {synced === 0 ? (
              <EmptyState message="Sync at least one repository of this account to see the team view." />
            ) : (
              <>
                <PeriodComparison summary={o} metrics={ORDER} days={days} />

                <Panel
                  title={`Members (${o.members.length})`}
                  description="Each person once across all repositories. Alphabetical: RepoPulse describes activity, it doesn’t rank people"
                  flush
                >
                  {o.members.length === 0 ? (
                    <p className="px-3 py-6 text-center text-xs text-muted-foreground">No activity in this period.</p>
                  ) : (
                    <Table>
                      <Thead>
                        <tr>
                          <Th>Member</Th>
                          <Th className="text-right">Repos</Th>
                          <Th className="text-right">PRs opened</Th>
                          <Th className="text-right">PRs merged</Th>
                          <Th className="text-right">Reviews</Th>
                          <Th className="text-right">Commits</Th>
                          <Th className="text-right hidden md:table-cell">Lines</Th>
                          <Th className="hidden lg:table-cell">Weekly activity</Th>
                          <Th className="hidden sm:table-cell">Last active</Th>
                        </tr>
                      </Thead>
                      <Tbody>
                        {o.members.map((m) => (
                          <Tr key={m.githubId}>
                            <Td>
                              <span className="inline-flex items-center gap-2 min-w-0">
                                <Avatar user={{ login: m.login, avatarUrl: m.avatarUrl }} size={18} />
                                <span className="font-medium truncate">{m.login}</span>
                              </span>
                            </Td>
                            <Td className="text-right tabular-nums">{m.repositories}</Td>
                            <Td className="text-right tabular-nums">{m.prsOpened}</Td>
                            <Td className="text-right tabular-nums">{m.prsMerged}</Td>
                            <Td className="text-right tabular-nums">{m.reviews}</Td>
                            <Td className="text-right tabular-nums">{m.commits}</Td>
                            <Td className="text-right tabular-nums hidden md:table-cell">
                              <span className="text-emerald-700 dark:text-emerald-400">+{formatCount(m.additions)}</span>{' '}
                              <span className="text-red-700 dark:text-red-300">−{formatCount(m.deletions)}</span>
                            </Td>
                            <Td className="hidden lg:table-cell">
                              <Sparkline values={m.weeklyActivity} label={`${m.login} weekly activity`} />
                            </Td>
                            <Td className="hidden sm:table-cell text-xs text-muted-foreground">{formatRelative(m.lastActiveAt)}</Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  )}
                </Panel>

                <Panel title={`Repositories (${o.repositories.length})`} description="Each repository’s own numbers for the same period" flush>
                  <Table>
                    <Thead>
                      <tr>
                        <Th>Repository</Th>
                        <Th className="text-right">PRs merged</Th>
                        <Th className="text-right hidden sm:table-cell">PRs opened</Th>
                        <Th className="text-right">Cycle time</Th>
                        <Th className="text-right hidden md:table-cell">Reviews</Th>
                        <Th className="text-right hidden md:table-cell">Commits</Th>
                        <Th className="text-right hidden sm:table-cell">People</Th>
                        <Th className="hidden lg:table-cell">Last synced</Th>
                      </tr>
                    </Thead>
                    <Tbody>
                      {o.repositories.map((r) => (
                        <Tr key={r.repositoryId}>
                          <Td>
                            <Link to={`/repositories/${r.repositoryId}/overview?days=${days}`} className="font-medium hover:underline">
                              {r.fullName}
                            </Link>
                          </Td>
                          <Td className="text-right tabular-nums">{r.prThroughput}</Td>
                          <Td className="text-right tabular-nums hidden sm:table-cell">{r.prsOpened}</Td>
                          <Td className="text-right tabular-nums">{formatHours(r.cycleTime)}</Td>
                          <Td className="text-right tabular-nums hidden md:table-cell">{r.reviewCount}</Td>
                          <Td className="text-right tabular-nums hidden md:table-cell">{r.commitCount}</Td>
                          <Td className="text-right tabular-nums hidden sm:table-cell">{r.activeContributors}</Td>
                          <Td className="hidden lg:table-cell text-xs text-muted-foreground">{formatRelative(r.lastSyncedAt)}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </Panel>

                <h2 className="pt-2 text-sm font-semibold">Trends across all repositories</h2>
                <div className="grid gap-4 lg:grid-cols-2">
                  <TrendChart title="PRs merged" description="Throughput per day, all repositories" data={o.trends} valueKey="prThroughput" kind="bar" format={count} emptyLabel="No PRs merged" />
                  <TrendChart title="Cycle time" description="Median, PRs merged that day" data={o.trends} valueKey="cycleTime" kind="line" format={formatHours} duration emptyLabel="No PRs merged" />
                  <TrendChart title="Reviews" description="Submitted per day, excluding self-reviews" data={o.trends} valueKey="reviewCount" kind="bar" format={count} emptyLabel="No reviews" />
                  <TrendChart title="Active people" description="Distinct people active per day, counted once" data={o.trends} valueKey="activeContributors" kind="bar" format={count} emptyLabel="No activity" />
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
