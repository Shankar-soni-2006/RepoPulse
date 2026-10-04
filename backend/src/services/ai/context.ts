import type { PullRequestEvidence } from '../../repositories/pullRequestRepository.js';
import type { ComparableMetric, MetricsSummary, PeriodMetrics } from '../../types/index.js';

// Builds the only input the model sees: backend-computed metrics and specific PRs.
// Every value the model may quote is precomputed here (durations formatted, changes
// as percentages) so it never has to do arithmetic, and so its output can be checked
// against this input number by number.

/** Same units as the frontend: seconds, minutes, hours, days */
export function formatDuration(hours: number | null): string | null {
  if (hours === null) return null;
  if (hours < 1 / 60) return `${Math.round(hours * 3600)}s`;
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

const round = (n: number, decimals = 2) => Math.round(n * 10 ** decimals) / 10 ** decimals;
const duration = (hours: number | null) =>
  hours === null ? null : { hours: round(hours), display: formatDuration(hours) };

export const METRIC_DEFINITIONS: Record<string, string> = {
  prThroughput: 'pull requests merged in the period',
  prsOpened: 'pull requests opened in the period',
  cycleTime: 'median time from PR creation to merge, PRs merged in the period',
  firstReviewTime: 'median time from PR creation to its first review by someone else, PRs first reviewed in the period',
  reviewDelay: 'mean of the same first-review waits (long waits pull it up)',
  prSize: 'median lines changed (additions + deletions), PRs merged in the period',
  codeChurn: 'lines added + deleted in non-merge commits with known stats',
  commitCount: 'commits on the default branch',
  reviewCount: 'submitted reviews, excluding authors reviewing their own PRs',
  activeContributors: 'distinct people who committed, opened a PR or reviewed',
  openPrsWithoutReview: 'PRs open at the end of the period with no review yet',
  oldestUnreviewedWait: 'how long the oldest of those has waited',
};

function describeMetrics(m: PeriodMetrics) {
  return {
    prThroughput: m.prThroughput,
    prsOpened: m.prsOpened,
    cycleTime: duration(m.cycleTime),
    firstReviewTime: duration(m.firstReviewTime),
    reviewDelay: duration(m.reviewDelay),
    prSizeLines: m.prSize === null ? null : round(m.prSize, 1),
    codeChurnLines: m.codeChurn,
    commitCount: m.commitCount,
    reviewCount: m.reviewCount,
    activeContributors: m.activeContributors,
    openPrsWithoutReview: m.openPrsWithoutReview,
    oldestUnreviewedWait: duration(m.oldestUnreviewedWait),
  };
}

function describeChanges(summary: MetricsSummary) {
  const out: Record<string, { previous: number | null; current: number | null; changePercent: number }> = {};
  for (const [key, change] of Object.entries(summary.changes) as [ComparableMetric, number | null][]) {
    if (change === null) continue;
    out[key] = {
      previous: summary.previousMetrics[key],
      current: summary.metrics[key],
      changePercent: round(change * 100, 1),
    };
  }
  return out;
}

function prEvidence(kind: string, pr: PullRequestEvidence): string {
  const parts = [`PR #${pr.number} "${pr.title.slice(0, 80)}"`];
  if (pr.mergedAt && pr.cycleTime !== null) parts.push(`merged after ${formatDuration(pr.cycleTime)}`);
  if (!pr.mergedAt) parts.push(`opened ${pr.createdAt.slice(0, 10)}, not yet reviewed`);
  parts.push(`${pr.prSize} lines changed`);
  if (pr.firstReviewTime !== null) parts.push(`first review after ${formatDuration(pr.firstReviewTime)}`);
  parts.push(`${pr.reviewCount} review${pr.reviewCount === 1 ? '' : 's'}`);
  return `${kind}: ${parts.join(', ')}`;
}

export interface EvidenceSets {
  slowestMerged: PullRequestEvidence[];
  largestMerged: PullRequestEvidence[];
  awaitingReview: PullRequestEvidence[];
}

export function buildAIContext(repositoryName: string, summary: MetricsSummary, evidence: EvidenceSets) {
  const items = [
    ...evidence.slowestMerged.map((p) => prEvidence('Slowest merged', p)),
    ...evidence.largestMerged.map((p) => prEvidence('Largest merged', p)),
    ...evidence.awaitingReview.map((p) => prEvidence('Awaiting first review', p)),
  ];
  return {
    repository: repositoryName,
    period: { days: summary.period.days, from: summary.period.from.slice(0, 10), to: summary.period.to.slice(0, 10) },
    previousPeriod: { from: summary.previousPeriod.from.slice(0, 10), to: summary.previousPeriod.to.slice(0, 10) },
    definitions: METRIC_DEFINITIONS,
    metrics: describeMetrics(summary.metrics),
    previousMetrics: describeMetrics(summary.previousMetrics),
    changesVsPreviousPeriod: describeChanges(summary),
    // Unique, stable lines; the model cites them as evidence
    evidence: [...new Set(items)],
    dataLimitations: summary.dataQuality.limitations,
  };
}

export type AIContext = ReturnType<typeof buildAIContext>;
