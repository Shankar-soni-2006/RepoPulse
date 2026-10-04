# AI insights

AI is an **interpretation layer**. It explains metrics the backend has already computed;
it never queries GitHub, Supabase or Redis, never computes metrics, and never writes data.
Analytics work whether or not AI is configured or available.

Code: `backend/src/services/ai/`. Endpoint: `POST /api/ai/insights`.

## Providers

Any **OpenAI-compatible** chat-completions API, configured in `backend/.env`:

| Variable | Default |
|---|---|
| `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` | Groq: `https://api.groq.com/openai/v1`, `openai/gpt-oss-120b` |
| `AI_FALLBACK_API_KEY`, `AI_FALLBACK_BASE_URL`, `AI_FALLBACK_MODEL` | Cerebras: `https://api.cerebras.ai/v1`, `gpt-oss-120b` |

The fallback is tried when the primary fails: rate limit (429), outage, timeout (45 s),
or an unusable answer. Both defaults run the same open model, so answers stay consistent.
Switching provider (OpenRouter, Mistral, Together, …) is a configuration change only.

Free tiers checked on 2026-10-04: Groq about 1,000 requests and 200K tokens per day; Cerebras
1M tokens per day at 5 requests per minute. One analysis is about 3–4K tokens.

## Request

```json
{ "repositoryId": "…", "days": 30, "mode": "summary", "question": "…" }
```

`mode`: `summary`, `trends`, `anomalies`, `bottlenecks`, `comparison` or `question`
(`question` is required for that mode, max 500 characters). `days` defaults to 30.

## What the model sees

`context.ts` builds the only input:
- current and previous period metrics, with durations pre-formatted (e.g. `"4.8h"`);
- changes as precomputed `changePercent`;
- metric definitions;
- evidence lines for specific PRs (slowest merged, largest merged, awaiting first review),
  with **no author data**;
- the analytics data limitations.

The model never does arithmetic.

## What comes back

```json
{ "summary": "…",
  "insights": [{ "title", "type", "severity", "fact", "evidence": [], "possibleExplanation", "recommendedInvestigation" }],
  "dataLimitations": [],
  "meta": { "mode", "period", "provider", "model", "generatedAt", "cached", "rejectedInsights" } }
```

## Integrity checks

1. **Structured output:** the provider is asked for strict JSON-schema output.
2. **Zod validation** (`schema.ts`): types, enums, lengths, at most 5 insights.
3. **Grounding** (`grounding.ts`): every number in the output must match a number in the
   input, within the rounding the model used (`27%` matches `27.0`; `342` does not match
   `341`).
   - A summary with an unsupported number makes the whole answer unusable, so the next
     provider is tried.
   - An insight with one is dropped, and a data limitation says so.

   *Limit:* grounding catches invented values, not a real value used in the wrong sentence.
4. **Prompt rules:**
   - explanations are worded as hypotheses;
   - nobody is evaluated or ranked, and investigations point at process, never at people,
     staffing or HR;
   - related changes are grouped into one insight;
   - modes like `bottlenecks` and `anomalies` return no insights when nothing qualifies;
   - insufficient data is stated as a limitation.

   `PROMPT_VERSION` is part of the cache key, so changing the prompt never serves old
   answers.

Verified live with Groq on 2026-10-04: summary, trends, anomalies, bottlenecks and question
modes all returned grounded answers (0 rejected), the cache returned `cached: true`, and
periods with no activity returned 422 without calling the provider. The Cerebras fallback
is covered by tests; it wasn't exercised live because no fallback key was configured.

## Cost and abuse controls

- **Cache:** answers are cached in Redis for 6 h, keyed by a hash of the mode, the question
  and the input data. The same question on unchanged data costs nothing; new data produces
  a new key automatically.
- **No call** for repositories never synced (409 `AI_NO_DATA`) or with no activity in
  either period (422 `AI_NO_ACTIVITY`).
- **Per-user limit:** 20 provider calls per hour (429 `AI_USER_LIMIT`).

## Errors

| Code | HTTP | Meaning |
|---|---|---|
| `AI_NOT_CONFIGURED` | 503 | No `AI_API_KEY` |
| `AI_RATE_LIMITED` | 429 | Every provider is at its quota |
| `AI_UNAVAILABLE` | 503 | Providers failed or returned unusable answers |
| `AI_USER_LIMIT` | 429 | This user's hourly limit |
| `AI_NO_DATA` / `AI_NO_ACTIVITY` | 409 / 422 | Nothing to analyze |
