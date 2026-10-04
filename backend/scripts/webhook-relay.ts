/**
 * Local development only: relays GitHub webhooks from a public smee.io channel to the
 * local backend, because GitHub cannot reach localhost.
 *
 *   npm run webhooks:relay        (from the repo root or backend/)
 *
 * Reads WEBHOOK_PROXY_URL from backend/.env. Without it, creates a new channel and
 * prints the URL to put in the GitHub App's webhook settings (and in .env).
 * Production deployments receive webhooks directly at ${BACKEND_URL}/api/webhooks/github.
 */
import 'dotenv/config';
import { SmeeClient } from 'smee-client';

const target = `http://localhost:${process.env.PORT ?? '3001'}/api/webhooks/github`;

async function main(): Promise<void> {
  let source = process.env.WEBHOOK_PROXY_URL?.trim();
  if (!source) {
    source = await SmeeClient.createChannel();
    console.log(`\nCreated a new relay channel:\n\n  ${source}\n`);
    console.log('1. Add to backend/.env:      WEBHOOK_PROXY_URL=' + source);
    console.log('2. Set it as the Webhook URL in your GitHub App settings.\n');
  }

  const client = new SmeeClient({ source, target, logger: console });
  await client.start();
  console.log(`Relaying ${source} → ${target}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
