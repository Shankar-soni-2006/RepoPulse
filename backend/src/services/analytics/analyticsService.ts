import { subDays } from 'date-fns';
import { analyticsRepository } from '../../repositories/analyticsRepository.js';
import { repositoryRepository } from '../../repositories/repositoryRepository.js';
import type {
  Analytics,
  AnalyticsPeriod,
  ComparableMetric,
  ContributorActivityReport,
  DataQuality,
  MetricChanges,
  MetricsSummary,
  PeriodMetrics,
  Repository,
  TimePeriod,
} from '../../types/index.js';
import { NotFoundError } from '../../utils/errors.js';

const COMPARABLE: ComparableMetric[] = [
  'prThroughput',
  'prsOpened',
  'cycleTime',
  'firstReviewTime',
  'reviewDelay',
  'prSize',
  'codeChurn',
  'commitCount',
  'reviewCount',
  'activeContributors',
];

const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

/** The period ending now and the equally long period before it. */
export function periodWindow(days: TimePeriod, now: Date = new Date()) {
  const to = now;
  const from = subDays(to, days);
  const previousFrom = subDays(from, days);
  return {
    period: { from: from.toISOString(), to: to.toISOString(), days } satisfies AnalyticsPeriod,
    previousPeriod: { from: previousFrom.toISOString(), to: from.toISOString() },
    dates: { from, to, previousFrom },
  };
}

/**
 * Fractional change from previous to current. null when either side is unknown or
 * the previous value is 0 (no meaningful percentage).
 */
export function compareMetrics(current: PeriodMetrics, previous: PeriodMetrics): MetricChanges {
  const changes = {} as MetricChanges;
  for (const key of COMPARABLE) {
    const now = current[key];
    const before = previous[key];
    changes[key] = now === null || before === null || before === 0 ? null : (now - before) / before;
  }
  return changes;
}

const formatDay = (iso: string) => iso.slice(0, 10);

/** Plain-language caveats for a result. Fed to the UI and to the AI as data limitations. */
export function buildLimitations(
  repo: Pick<Repository, 'lastSyncedAt' | 'dataSince'>,
  period: { from: string },
  previousPeriod: { from: string },
  metrics: PeriodMetrics,
): string[] {
  const out: string[] = [];

  if (!repo.lastSyncedAt) {
    out.push('This repository has not been synchronized yet, so no activity is available.');
    return out;
  }
  if (repo.dataSince && period.from < repo.dataSince) {
    out.push(
      `Activity before ${formatDay(repo.dataSince)} has not been imported, so this period is only partly covered.`,
    );
  } else if (repo.dataSince && previousPeriod.from < repo.dataSince) {
    out.push(
      `Activity before ${formatDay(repo.dataSince)} has not been imported, so the comparison with the previous period is incomplete.`,
    );
  }
  if (metrics.prThroughput === 0) {
    out.push('No pull requests were merged in this period, so cycle time and PR size are unavailable.');
  }
  if (metrics.firstReviewTime === null && (metrics.prsOpened > 0 || metrics.prThroughput > 0)) {
    out.push('No pull request received its first review in this period, so review timing is unavailable.');
  }
  if (metrics.commitsMissingStats > 0) {
    out.push(
      `Line counts are not yet known for ${metrics.commitsMissingStats} commit${metrics.commitsMissingStats === 1 ? '' : 's'}; code churn is understated until the next sync fetches them.`,
    );
  }
  out.push('Commits are counted on the default branch only. Days are in UTC.');
  return out;
}

async function loadRepository(repositoryId: string): Promise<Repository> {
  const repo = await repositoryRepository.findById(repositoryId);
  if (!repo) throw new NotFoundError('Repository');
  return repo;
}

async function summarize(repositoryId: string, days: TimePeriod, now: Date): Promise<MetricsSummary> {
  const repo = await loadRepository(repositoryId);
  const { period, previousPeriod, dates } = periodWindow(days, now);

  const [current, previous] = await Promise.all([
    analyticsRepository.periodMetrics(repositoryId, dates.from, dates.to),
    analyticsRepository.periodMetrics(repositoryId, dates.previousFrom, dates.from),
  ]);
  const metrics = current.metrics;
  const previousMetrics = previous.metrics;

  const dataQuality: DataQuality = {
    dataSince: repo.dataSince,
    lastSyncedAt: repo.lastSyncedAt,
    commitStatsCoverage: current.commitStatsCoverage,
    limitations: buildLimitations(repo, period, previousPeriod, metrics),
  };

  return {
    repositoryId,
    period,
    previousPeriod,
    metrics,
    previousMetrics,
    changes: compareMetrics(metrics, previousMetrics),
    dataQuality,
    generatedAt: now.toISOString(),
  };
}

export const analyticsService = {
  /** Headline metrics with comparison to the previous period. */
  getMetrics(repositoryId: string, days: TimePeriod, now = new Date()): Promise<MetricsSummary> {
    return summarize(repositoryId, days, now);
  },

  /** Headline metrics plus a daily series covering the period (UTC days). */
  async getAnalytics(repositoryId: string, days: TimePeriod, now = new Date()): Promise<Analytics> {
    const summary = await summarize(repositoryId, days, now);
    const trends = await analyticsRepository.dailyTrends(
      repositoryId,
      isoDay(new Date(summary.period.from)),
      isoDay(now),
    );
    return { ...summary, trends };
  },

  async getContributorActivity(
    repositoryId: string,
    days: TimePeriod,
    now = new Date(),
  ): Promise<ContributorActivityReport> {
    await loadRepository(repositoryId);
    const { period, dates } = periodWindow(days, now);
    return {
      period,
      contributors: await analyticsRepository.contributorActivity(repositoryId, dates.from, dates.to),
    };
  },

  /**
   * Recomputes daily rollups from the start of synced data through today (UTC).
   * Called after every successful sync or webhook update.
   */
  async refreshDailyMetrics(repositoryId: string, dataSince: string, now = new Date()): Promise<number> {
    return analyticsRepository.refreshDailyMetrics(repositoryId, isoDay(new Date(dataSince)), isoDay(now));
  },
};

