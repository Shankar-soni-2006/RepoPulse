# Webhooks

`POST /api/webhooks/github` keeps synced repositories current between full syncs.
Code: `backend/src/webhooks/`, `backend/src/services/sync/ingest.ts`.

## Receiving

1. The raw body is kept as bytes (`express.raw`), because the signature covers the exact
   bytes GitHub sent.
2. Checks, in order:
   - `X-GitHub-Event` and `X-GitHub-Delivery` are present (otherwise **400**);
   - content type is `application/json` (otherwise **415**, with a hint to fix the App
     setting);
   - `X-Hub-Signature-256` matches HMAC-SHA256 of the body with `GITHUB_WEBHOOK_SECRET`,
     compared in constant time (otherwise **401**, and nothing is recorded).
3. The delivery is stored in `webhook_events`. The unique `github_delivery_id` makes a
   redelivery a no-op: it gets **200 `duplicate`** and is not reprocessed.
4. The response is **202 `accepted`**, sent immediately (GitHub waits at most 10 s).
   Processing runs afterwards.

No session or CSRF header is needed; the signature is the authentication.

## Processing

Status moves `received → processing → processed | ignored | failed`, with the reason in
`processing_error`.

| Event | Work |
|---|---|
| `pull_request`, `pull_request_review` | Re-fetch **that PR** (sizes) and **its reviews**, upsert them (first review, review count) |
| `push` to the default branch | `compare before...after` for the new commits, store them, fetch their line stats (≤ 100) |
| anything else | `ignored` |

Then daily metrics are recomputed from the earliest affected day: the PR's creation or the
oldest pushed commit, never earlier than `data_since`. **No webhook triggers a full sync.**

Re-fetching the current PR from the API (instead of trusting the payload) makes processing
order-independent: late or out-of-order deliveries still store the latest state.

Ignored, with the reason recorded:
- repositories RepoPulse doesn't track;
- repositories never synced (their first sync imports the activity);
- pushes to other branches, branch creation and deletion;
- pushes with no new commits.

Failures keep a user-safe message; internal details are only logged.

## GitHub App settings

- **Webhook URL:** `${BACKEND_URL}/api/webhooks/github` in production.
- **Secret:** must equal `GITHUB_WEBHOOK_SECRET`.
- **Events:** Pull request, Pull request review, Push.

## Local development

GitHub can't reach `localhost`. `npm run webhooks:relay` connects to the smee.io channel
in `WEBHOOK_PROXY_URL`, creating one if it's empty, and forwards deliveries to
`http://localhost:3001/api/webhooks/github`. Use the smee URL as the App's Webhook URL
while developing.

## Limits

- A push with more than 250 new commits stores the first 250 (GitHub's compare limit);
  the next full sync completes it.
- Installation changes (repositories added to or removed from the App) aren't handled by
  webhooks yet; **Refresh from GitHub** on the repository page re-runs discovery.
