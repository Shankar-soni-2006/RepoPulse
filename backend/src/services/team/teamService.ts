import { createHash } from 'node:crypto';
import { installationRepository } from '../../repositories/installationRepository.js';
import { teamRepository, type AccessibleRepository } from '../../repositories/teamRepository.js';
import type { DataQuality, GitHubInstallation, TeamAccount, TeamOverview, TimePeriod } from '../../types/index.js';
import { NotFoundError } from '../../utils/errors.js';
import { cacheService } from '../cache/cacheService.js';
import { compareMetrics, periodWindow } from '../analytics/analyticsService.js';

// Team view: one account's repositories combined (an organization, or a user's own
// repositories). Access follows GitHub, like every other view: an account is listed
// only if the user can see its installation, and only repositories the user can access
// (user_repositories) are included. Being a RepoPulse admin changes nothing here.

// Not invalidated by syncs (results depend on each user's repository set); short TTL instead
const TEAM_CACHE_TTL_SECONDS = 5 * 60;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

function toAccount(installation: GitHubInstallation, repos: AccessibleRepository[]): TeamAccount {
  return {
    id: installation.id,
    login: installation.accountLogin,
    type: installation.accountType,
    repositoryCount: repos.length,
    syncedRepositoryCount: repos.filter((r) => r.lastSyncedAt).length,
  };
}

function teamLimitations(
  account: TeamAccount,
  synced: AccessibleRepository[],
  period: { from: string },
  previousPeriod: { from: string },
): string[] {
  const out: string[] = [];
  if (account.syncedRepositoryCount === 0) {
    out.push('None of these repositories has been synchronized yet, so no activity is available.');
    return out;
  }
  if (account.syncedRepositoryCount < account.repositoryCount) {
    const missing = account.repositoryCount - account.syncedRepositoryCount;
    out.push(`${missing} of ${account.repositoryCount} repositories ha${missing === 1 ? 's' : 've'} not been synchronized and ${missing === 1 ? 'is' : 'are'} not included.`);
  }
  const lateStarts = synced.filter((r) => r.dataSince && r.dataSince > period.from).length;
  if (lateStarts > 0) {
    out.push(`${lateStarts} repositor${lateStarts === 1 ? 'y has' : 'ies have'} data starting after the beginning of this period, so the period is only partly covered.`);
  } else if (synced.some((r) => r.dataSince && r.dataSince > previousPeriod.from)) {
    out.push('Some repositories have no data for the whole previous period, so the comparison is incomplete.');
  }
  out.push('People are counted once across repositories (by GitHub account). Days are in UTC; commits are counted on default branches.');
  return out;
}

export const teamService = {
  /** Accounts (installations) the user can see, with how many of their repositories are accessible. */
  async listAccounts(userId: string): Promise<TeamAccount[]> {
    const [installations, repos] = await Promise.all([
      installationRepository.findForUser(userId),
      teamRepository.accessibleRepositories(userId),
    ]);
    return installations.map((i) => toAccount(i, repos.filter((r) => r.installationId === i.id)));
  },

  async getOverview(userId: string, accountId: string, days: TimePeriod, now = new Date()): Promise<TeamOverview> {
    const [installations, allRepos] = await Promise.all([
      installationRepository.findForUser(userId),
      teamRepository.accessibleRepositories(userId),
    ]);
    const installation = installations.find((i) => i.id === accountId);
    // 404, not 403: don't reveal accounts the user can't see
    if (!installation) throw new NotFoundError('Account');

    const repos = allRepos.filter((r) => r.installationId === installation.id);
    const synced = repos.filter((r) => r.lastSyncedAt);
    const ids = synced.map((r) => r.id);
    const account = toAccount(installation, repos);
    const { period, previousPeriod, dates } = periodWindow(days, now);

    const { value } = await cacheService.getOrLoad(
      // The repository set is part of the key: users with different access never share an entry
      `team:${accountId}:${days}:${createHash('sha256').update([...ids].sort().join(',')).digest('hex').slice(0, 16)}`,
      async (): Promise<TeamOverview> => {
        const [current, previous, members, breakdown, trends] = await Promise.all([
          teamRepository.periodMetrics(ids, dates.from, dates.to),
          teamRepository.periodMetrics(ids, dates.previousFrom, dates.from),
          teamRepository.members(ids, dates.from, dates.to),
          teamRepository.breakdown(ids, dates.from, dates.to),
          teamRepository.dailyTrends(ids, isoDay(dates.from), isoDay(dates.to)),
        ]);
        const byId = new Map(synced.map((r) => [r.id, r]));
        const dataQuality: DataQuality = {
          dataSince: synced.map((r) => r.dataSince).filter((d): d is string => !!d).sort()[0] ?? null,
          // the least recently synced repository: everything is at least this fresh
          lastSyncedAt: synced.map((r) => r.lastSyncedAt!).sort()[0] ?? null,
          commitStatsCoverage: current.commitStatsCoverage,
          limitations: teamLimitations(account, synced, period, previousPeriod),
        };
        return {
          account,
          period,
          previousPeriod,
          metrics: current.metrics,
          previousMetrics: previous.metrics,
          changes: compareMetrics(current.metrics, previous.metrics),
          dataQuality,
          repositories: breakdown
            .map((b) => ({ ...b, fullName: byId.get(b.repositoryId)?.fullName ?? '', lastSyncedAt: byId.get(b.repositoryId)?.lastSyncedAt ?? null }))
            .sort((a, b) => a.fullName.localeCompare(b.fullName)),
          members,
          trends,
          generatedAt: now.toISOString(),
        };
      },
      TEAM_CACHE_TTL_SECONDS,
    );
    return value;
  },
};
