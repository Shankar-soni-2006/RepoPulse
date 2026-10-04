/**
 * Recompute a repository's daily metrics from the stored facts and clear its cached
 * analytics, without contacting GitHub. Useful after changing a metric definition
 * (a new migration) or repairing data.
 *
 *   npm run metrics:recalculate -- <repositoryId>
 *
 * Uses backend/.env. Covers everything from the repository's data_since to today (UTC).
 */
import { repositoryRepository } from '../backend/src/repositories/repositoryRepository.js';
import { analyticsService } from '../backend/src/services/analytics/analyticsService.js';
import { cacheService } from '../backend/src/services/cache/cacheService.js';

async function main(): Promise<void> {
  const repositoryId = process.argv[2];
  if (!repositoryId || !/^[0-9a-f-]{36}$/i.test(repositoryId)) {
    console.error('Usage: npm run metrics:recalculate -- <repositoryId (uuid)>');
    process.exit(2);
  }

  const repo = await repositoryRepository.findById(repositoryId);
  if (!repo) throw new Error(`Repository ${repositoryId} not found`);
  if (!repo.dataSince) throw new Error(`${repo.fullName} has not been synced yet; run a sync first`);

  const days = await analyticsService.refreshDailyMetrics(repo.id, repo.dataSince);
  await cacheService.invalidateRepository(repo.id);
  console.log(`${repo.fullName}: recomputed ${days} daily rows from ${repo.dataSince.slice(0, 10)} and cleared cached analytics`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
