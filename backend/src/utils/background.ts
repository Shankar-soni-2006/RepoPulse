import { waitUntil } from '@vercel/functions';

/**
 * Runs work after the response has been sent. On Vercel the function would otherwise
 * be frozen as soon as it responds; waitUntil keeps it alive until the task settles
 * (within the function's maxDuration). On a long-running server it is a no-op wrapper.
 * The task must handle its own errors.
 */
export function runInBackground(task: Promise<unknown>): void {
  waitUntil(task);
}
