/**
 * Live end-to-end smoke test against a RUNNING backend and the real services it is
 * configured with (GitHub, Supabase, Upstash, AI). Non-destructive:
 *   - uses a temporary session (deleted at the end) for a user who already signed in
 *   - re-syncs one already-synced repository (idempotent)
 *   - delivers a signed pull_request webhook for an EXISTING PR (re-fetched from GitHub)
 *   - deletes the webhook events it created
 *
 *   npm run dev:backend            # in another terminal
 *   npm run test:smoke             # optional: -- <repositoryId>
 *
 * Exits non-zero if any check fails.
 */
import { createHmac, randomUUID } from 'node:crypto';
import { env } from '../backend/src/config/env.js';
import { supabase } from '../backend/src/config/supabase.js';
import { sessionRepository } from '../backend/src/repositories/sessionRepository.js';
import { encryptSecret, generateToken, hashToken } from '../backend/src/utils/crypto.js';

// SMOKE_BASE_URL targets a deployment (e.g. https://repopulse-shankar.vercel.app); default: local backend
const BASE = (process.env.SMOKE_BASE_URL ?? `http://localhost:${env.PORT}`).replace(/\/$/, '');
const results: { check: string; ok: boolean; detail: string }[] = [];
const record = (check: string, ok: boolean, detail = '') => {
  results.push({ check, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${check}${detail ? `  (${detail})` : ''}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Response bodies are inspected field by field below; loosely typed on purpose
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = (r: Response): Promise<any> => r.json();

async function main(): Promise<void> {
  // ---- Target repository and a user who can access it ----
  const requested = process.argv[2];
  const { data: access, error } = await supabase
    .from('user_repositories')
    .select('user_id, repositories!inner(id, github_id, name, owner, full_name, last_synced_at)')
    .not('repositories.last_synced_at', 'is', null);
  if (error) throw error;
  type Row = { user_id: string; repositories: { id: string; github_id: number; name: string; owner: string; full_name: string } };
  const rows = access as unknown as Row[];
  const target = rows.find((r) => !requested || r.repositories.id === requested);
  if (!target) throw new Error('No synced repository with a signed-in user found. Sign in and sync one first.');
  const repo = target.repositories;
  console.log(`Target: ${repo.full_name} (${repo.id})\n`);

  // ---- Temporary session (the API never sees a real GitHub token in these checks) ----
  const token = generateToken();
  const session = await sessionRepository.create({
    user_id: target.user_id,
    token_hash: hashToken(token),
    encrypted_access_token: encryptSecret('smoke-test-placeholder'),
    access_token_expires_at: null,
    encrypted_refresh_token: null,
    refresh_token_expires_at: null,
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  });
  const auth = { Cookie: `rp_session=${token}`, 'X-RepoPulse-Client': 'web', 'Content-Type': 'application/json' };
  const deliveries: string[] = [];

  try {
    // ---- Health ----
    const health = await fetch(`${BASE}/api/health`).then(json);
    record('API health', health.success && health.data.status === 'ok', `cache: ${health.data?.cache}`);

    // ---- Unauthorized / authorized ----
    const anon = await fetch(`${BASE}/api/repositories`);
    record('Unauthenticated request rejected', anon.status === 401, `HTTP ${anon.status}`);
    const list = await fetch(`${BASE}/api/repositories`, { headers: auth }).then(json);
    record('Signed-in user sees the repository', list.data?.some((r: { id: string }) => r.id === repo.id));
    const noCsrf = await fetch(`${BASE}/api/repositories/${repo.id}/sync`, { method: 'POST', headers: { Cookie: auth.Cookie } });
    record('Mutation without client header rejected (CSRF)', noCsrf.status === 403, `HTTP ${noCsrf.status}`);

    // ---- Invalid input ----
    const bad = await fetch(`${BASE}/api/repositories/${repo.id}/analytics?days=14`, { headers: auth });
    record('Invalid period rejected', bad.status === 400, `HTTP ${bad.status}`);
    const badId = await fetch(`${BASE}/api/repositories/not-a-uuid`, { headers: auth });
    record('Invalid repository id rejected', badId.status === 400, `HTTP ${badId.status}`);

    // ---- Sync (GitHub → Supabase → analytics) ----
    const started = await fetch(`${BASE}/api/repositories/${repo.id}/sync`, { method: 'POST', headers: auth });
    record('Sync accepted', started.status === 202 || started.status === 409, `HTTP ${started.status}`);
    let status = 'syncing';
    let syncError: string | null = null;
    for (let i = 0; i < 90 && status === 'syncing'; i++) {
      await sleep(2000);
      const r = await fetch(`${BASE}/api/repositories/${repo.id}`, { headers: auth }).then(json);
      status = r.data.syncStatus;
      syncError = r.data.syncError;
    }
    record('Sync completes', status === 'synced', syncError ?? status);

    // ---- Analytics + cache ----
    const metricsUrl = `${BASE}/api/repositories/${repo.id}/metrics?days=90`;
    const m1 = await fetch(metricsUrl, { headers: auth });
    const m1Body = await json(m1);
    const m2 = await fetch(metricsUrl, { headers: auth });
    record('Analytics returned', m1.ok && typeof m1Body.data?.metrics?.prThroughput === 'number');
    const caching = health.data?.cache === 'ok';
    record(
      'Analytics cached on repeat',
      caching ? m2.headers.get('x-cache') === 'HIT' : m2.headers.get('x-cache') === 'BYPASS',
      `${m1.headers.get('x-cache')} → ${m2.headers.get('x-cache')}${caching ? '' : ' (Redis not configured)'}`,
    );

    // ---- Webhook (signed delivery for an existing PR) ----
    const { data: pr } = await supabase
      .from('pull_requests')
      .select('number, created_at')
      .eq('repository_id', repo.id)
      .order('number', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!pr) {
      record('Webhook processing', false, 'repository has no pull requests to re-deliver');
    } else {
      const body = JSON.stringify({
        action: 'edited',
        repository: { id: repo.github_id, name: repo.name, owner: { login: repo.owner } },
        pull_request: { number: pr.number, created_at: pr.created_at },
      });
      const sign = (b: string, secret = env.GITHUB_WEBHOOK_SECRET) => `sha256=${createHmac('sha256', secret).update(b).digest('hex')}`;
      const deliver = (id: string, signature: string) =>
        fetch(`${BASE}/api/webhooks/github`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-GitHub-Event': 'pull_request', 'X-GitHub-Delivery': id, 'X-Hub-Signature-256': signature },
          body,
        });

      const forged = await deliver(`smoke-${randomUUID()}`, sign(body, 'wrong-secret'));
      record('Forged webhook signature rejected', forged.status === 401, `HTTP ${forged.status}`);

      const delivery = `smoke-${randomUUID()}`;
      deliveries.push(delivery);
      const accepted = await deliver(delivery, sign(body));
      record('Signed webhook accepted', accepted.status === 202, `HTTP ${accepted.status}`);

      let outcome: { status: string; processing_error: string | null } | null = null;
      for (let i = 0; i < 30; i++) {
        await sleep(1000);
        const { data } = await supabase.from('webhook_events').select('status, processing_error').eq('github_delivery_id', delivery).maybeSingle();
        outcome = data;
        if (data && !['received', 'processing'].includes(data.status)) break;
      }
      record(`Webhook processed (PR #${pr.number} re-fetched from GitHub)`, outcome?.status === 'processed', outcome?.processing_error ?? outcome?.status ?? 'not recorded');

      const duplicate = await deliver(delivery, sign(body)).then(json);
      record('Duplicate delivery not reprocessed', duplicate.data?.status === 'duplicate');

      if (caching) {
        const m3 = await fetch(metricsUrl, { headers: auth });
        record('Webhook invalidated cached analytics', m3.headers.get('x-cache') === 'MISS', `x-cache: ${m3.headers.get('x-cache')}`);
      }
    }

    // ---- AI ----
    const ai = await fetch(`${BASE}/api/ai/insights`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ repositoryId: repo.id, mode: 'summary', days: 90 }),
    });
    const aiBody = await json(ai);
    const aiCode = aiBody.error?.code as string | undefined;
    const aiOk = ai.ok
      ? typeof aiBody.data.summary === 'string' && Array.isArray(aiBody.data.insights)
      : ['AI_NOT_CONFIGURED', 'AI_NO_ACTIVITY', 'AI_RATE_LIMITED', 'AI_USER_LIMIT'].includes(aiCode ?? '');
    record(
      'AI insights (or a clear, expected refusal)',
      aiOk,
      ai.ok ? `${aiBody.data.meta.model} via ${aiBody.data.meta.provider}${aiBody.data.meta.cached ? ', cached' : ''}, ${aiBody.data.insights.length} insight(s)` : `HTTP ${ai.status} ${aiCode}`,
    );
  } finally {
    await sessionRepository.deleteById(session.id);
    if (deliveries.length) await supabase.from('webhook_events').delete().in('github_delivery_id', deliveries);
    // forged deliveries are never recorded, so there is nothing else to clean up
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exit(1);
}

main().catch((err: unknown) => {
  console.error('Smoke test could not run:', err instanceof Error ? err.message : err);
  process.exit(1);
});
