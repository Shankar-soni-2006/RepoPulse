/**
 * Synchronize one repository from the command line and print a summary.
 *
 *   cd backend && npm run sync:repo -- <repositoryId>
 *
 * Uses backend/.env. The repository must already be known to RepoPulse (discovered
 * after a user signed in). Same code path and locking as POST /api/repositories/:id/sync.
 */
import { syncService } from '../backend/src/services/sync/syncService.js';

async function main(): Promise<void> {
  const repositoryId = process.argv[2];
  if (!repositoryId || !/^[0-9a-f-]{36}$/i.test(repositoryId)) {
    console.error('Usage: npm run sync:repo -- <repositoryId (uuid)>');
    process.exit(2);
  }

  const summary = await syncService.runNow(repositoryId);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
