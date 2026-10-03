import type { Analytics } from '../../types';
import { subDays, startOfDay, endOfDay, format } from 'date-fns';
import { dailyMetricRepository } from '../../repositories/dailyMetricRepository';
import { pullRequestRepository } from '../../repositories/pullRequestRepository';
import { commitRepository } from '../../repositories/commitRepository';
import { contributorRepository } from '../../repositories/contributorRepository';

// Stub — fully implemented in Phase 6 (analytics engine)
export const analyticsService = {
  async getAnalytics(repositoryId: string, days: 7 | 30 | 90): Promise<Analytics> {
    const to = endOfDay(new Date());
    const from = startOfDay(subDays(to, days));
    const fromStr = from.toISOString();
    const toStr = to.toISOString();

    const [dailyMetrics, prs, commits, contributors] = await Promise.all([
      dailyMetricRepository.findByDateRange(repositoryId, format(from, 'yyyy-MM-dd'), format(to, 'yyyy-MM-dd')),
      pullRequestRepository.findByDateRange(repositoryId, fromStr, toStr),
      commitRepository.findByDateRange(repositoryId, fromStr, toStr),
      contributorRepository.findByRepository(repositoryId),
    ]);

    const mergedPrs = prs.filter((p) => p.status === 'merged');
    const cycleTimes = mergedPrs.map((p) => p.cycleTime).filter((v): v is number => v !== null);
    const reviewTimes = prs.map((p) => p.firstReviewTime).filter((v): v is number => v !== null);
    const codeChurn = commits.reduce((sum, c) => sum + c.additions + c.deletions, 0);

    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    return {
      repositoryId,
      period: { from: fromStr, to: toStr, days },
      metrics: {
        cycleTime: avg(cycleTimes),
        firstReviewTime: avg(reviewTimes),
        reviewDelay: avg(reviewTimes),
        prThroughput: mergedPrs.length,
        codeChurn,
        avgPrSize: prs.length ? prs.reduce((s, p) => s + p.prSize, 0) / prs.length : 0,
        commitCount: commits.length,
        activeContributors: contributors.filter((c) => c.lastContributionAt && new Date(c.lastContributionAt) >= from).length,
      },
      trends: dailyMetrics.map((d) => ({
        date: d.date,
        cycleTime: d.avgCycleTime,
        firstReviewTime: d.avgFirstReviewTime,
        prCount: d.prCount,
        mergedPrCount: d.mergedPrCount,
        codeChurn: d.additions + d.deletions,
        commitCount: d.commitCount,
      })),
    };
  },
};
