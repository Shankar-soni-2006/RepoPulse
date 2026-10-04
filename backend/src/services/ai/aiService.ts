import { createHash } from 'node:crypto';
import { pullRequestRepository } from '../../repositories/pullRequestRepository.js';
import { repositoryRepository } from '../../repositories/repositoryRepository.js';
import type {
  AIInsightMode,
  AIInsightResult,
  MetricsSummary,
  TimePeriod,
} from '../../types/index.js';
import { AppError, NotFoundError } from '../../utils/errors.js';
import { analyticsService } from '../analytics/analyticsService.js';
import { cacheKeys, cacheService } from '../cache/cacheService.js';
import { buildAIContext, type AIContext } from './context.js';
import { Grounding } from './grounding.js';
import { completeJson, configuredProviders, ProviderError, type AIProvider, type ChatMessage } from './provider.js';
import { aiResponseJsonSchema, aiResponseSchema, type ValidatedAIResponse } from './schema.js';

// AI is an interpretation layer: it receives backend-computed metrics and must not
// add numbers of its own. Analytics never depend on it.

const AI_CACHE_TTL_SECONDS = 6 * 60 * 60;
// Free provider quotas are shared by everyone; cap provider calls per user
const USER_CALLS_PER_HOUR = 20;

const MODE_INSTRUCTIONS: Record<AIInsightMode, string> = {
  summary: 'Give an overall engineering summary of this repository for the period, with the most important insights.',
  trends: 'Explain how the metrics moved compared with the previous period and which changes matter most.',
  anomalies:
    'Identify unusual values or sudden changes in the metrics and evidence. If nothing looks unusual, say so in the summary and return no insights.',
  bottlenecks:
    'Identify where work waits or slows down: review waits, unreviewed PRs, large PRs, slow merges. Only report a bottleneck where work is actually waiting or slow; if there is none (for example no PRs are open or awaiting review), say so in the summary and return no insights instead of describing other changes.',
  comparison: 'Compare this period with the previous period metric by metric. Use type "comparison".',
  question: 'Answer the user\'s question using only the data. If the data cannot answer it, say so in the summary.',
};

// Bump when the prompt changes so cached answers from the old prompt aren't reused
const PROMPT_VERSION = 4;

const SYSTEM_PROMPT = `You are the analysis assistant inside RepoPulse, an engineering analytics product.
You explain engineering metrics that RepoPulse has already computed. You do not compute new statistics.

Rules:
- Use only the data in the user message. Never invent repositories, pull requests, people, dates or numbers.
- Every number you write must appear in the data. Copy durations exactly as given in "display" (e.g. "4.2h", "11s"); do not convert units or calculate new values. Use "changePercent" for percentage changes.
- "fact" states what the data shows, in one or two plain sentences.
- "evidence" lists specific data points as short readable sentences (e.g. "PRs merged: 2 in the previous period, 0 in this period", or an evidence line quoted as given). Never write field names like "prThroughput" or "changePercent".
- "possibleExplanation" is a hypothesis: word it as one ("may", "could", "possibly"). Never present it as established.
- "recommendedInvestigation" names something the team can look at in the repository or its process (PRs, review practice, branches, release plans). Never suggest examining, monitoring or contacting a specific person, and never suggest staffing, leave, HR or performance records.
- Describe repository activity. Never judge, rank or evaluate individual people.
- Types: "bottleneck" only where work is waiting (unreviewed PRs, long review waits, slow merges); "anomaly" for unusual values or abrupt changes; "trend" for sustained direction; "comparison" for period-over-period contrasts; "observation" otherwise.
- Each insight must add something new. When several metrics changed together for what is plausibly one reason (e.g. all activity stopped), report them as ONE insight with each metric as evidence, not one insight per metric. Skip trivial consequences (e.g. "no PRs await review" when no PRs were opened). Fewer, stronger insights are better; at most 5.
- If the data is insufficient (for example nothing was merged), say so and add a dataLimitations entry rather than speculating.
- Return JSON matching the schema.`;

function userPrompt(mode: AIInsightMode, context: AIContext, question?: string): string {
  const parts = [`Task: ${MODE_INSTRUCTIONS[mode]}`];
  if (mode === 'question' && question) parts.push(`User question (answer only from the data):\n"""${question}"""`);
  parts.push(`Data (JSON):\n${JSON.stringify(context, null, 2)}`);
  return parts.join('\n\n');
}

// ---- per-user call limit ----
// Counted in Redis so it holds across serverless instances; in memory (per instance)
// when Redis is unavailable.
const callLog = new Map<string, number[]>();

const limitError = () =>
  new AppError('AI_USER_LIMIT', `AI analysis is limited to ${USER_CALLS_PER_HOUR} requests per hour`, 429);

async function takeUserCall(userId: string, now = Date.now()): Promise<void> {
  const hour = Math.floor(now / 3_600_000);
  const count = await cacheService.increment(`ai:calls:${userId}:${hour}`, 3600);
  if (count !== null) {
    if (count > USER_CALLS_PER_HOUR) throw limitError();
    return;
  }

  const recent = (callLog.get(userId) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= USER_CALLS_PER_HOUR) throw limitError();
  recent.push(now);
  callLog.set(userId, recent);
}

// ---- validation ----

interface Checked {
  response: ValidatedAIResponse;
  rejectedInsights: number;
}

/** Parses, schema-validates and grounds a completion. Throws if unusable. */
function check(raw: string, grounding: Grounding): Checked {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('completion is not valid JSON');
  }
  const parsed = aiResponseSchema.safeParse(json);
  if (!parsed.success) throw new Error(`completion does not match the schema: ${parsed.error.issues[0]?.message}`);

  const response = parsed.data;
  const badSummary = grounding.check(response.summary);
  if (badSummary.length) throw new Error(`summary cites numbers not in the data: ${badSummary.join(', ')}`);

  const insights = response.insights.filter(
    (i) =>
      grounding.check(i.title, i.fact, ...i.evidence, i.possibleExplanation, i.recommendedInvestigation).length === 0,
  );
  const dataLimitations = response.dataLimitations.filter((l) => grounding.check(l).length === 0);
  return { response: { ...response, insights, dataLimitations }, rejectedInsights: response.insights.length - insights.length };
}

/** Tries each configured provider in order until one returns a usable answer. */
async function generate(messages: ChatMessage[], grounding: Grounding): Promise<Checked & { provider: AIProvider }> {
  const providers = configuredProviders();
  if (providers.length === 0) {
    throw new AppError('AI_NOT_CONFIGURED', 'AI insights are not configured on this server', 503);
  }

  const failures: { provider: string; rateLimited: boolean; message: string }[] = [];
  for (const provider of providers) {
    try {
      const raw = await completeJson(provider, messages, aiResponseJsonSchema);
      return { ...check(raw, grounding), provider };
    } catch (err) {
      const rateLimited = err instanceof ProviderError && err.rateLimited;
      failures.push({ provider: provider.name, rateLimited, message: (err as Error).message });
      console.warn(`[ai] ${provider.name} failed${rateLimited ? ' (rate limited)' : ''}: ${(err as Error).message}`);
    }
  }

  if (failures.every((f) => f.rateLimited)) {
    throw new AppError('AI_RATE_LIMITED', 'The AI providers are at their usage limit. Try again later.', 429);
  }
  throw new AppError('AI_UNAVAILABLE', 'AI analysis is temporarily unavailable. Analytics are unaffected.', 503);
}

function hasActivity(summary: MetricsSummary): boolean {
  const any = (m: MetricsSummary['metrics']) => m.prsOpened + m.prThroughput + m.commitCount + m.reviewCount > 0;
  return any(summary.metrics) || any(summary.previousMetrics);
}

export interface InsightRequest {
  userId: string;
  repositoryId: string;
  days: TimePeriod;
  mode: AIInsightMode;
  question?: string;
}

export const aiService = {
  async getInsights(req: InsightRequest): Promise<AIInsightResult> {
    const repo = await repositoryRepository.findById(req.repositoryId);
    if (!repo) throw new NotFoundError('Repository');
    if (!repo.lastSyncedAt) {
      throw new AppError('AI_NO_DATA', 'Sync this repository before requesting AI analysis', 409);
    }

    // Same metrics the dashboard shows (cached when Redis is available)
    const { value: summary } = await cacheService.getOrLoad(cacheKeys.overview(repo.id, req.days), () =>
      analyticsService.getMetrics(repo.id, req.days),
    );
    if (!hasActivity(summary)) {
      throw new AppError(
        'AI_NO_ACTIVITY',
        `No activity in the last ${req.days} days or the ${req.days} days before, so there is nothing to analyze`,
        422,
      );
    }

    const evidence = await pullRequestRepository.findPeriodEvidence(
      repo.id,
      new Date(summary.period.from),
      new Date(summary.period.to),
    );
    const context = buildAIContext(repo.fullName, summary, evidence);
    const question = req.mode === 'question' ? req.question?.trim() : undefined;

    // Identical data + request => identical answer: cache by content, not by time
    const key = `repo:${repo.id}:ai:${createHash('sha256')
      .update(
        JSON.stringify({
          v: PROMPT_VERSION,
          mode: req.mode,
          question,
          context: { ...context, period: undefined, previousPeriod: undefined },
        }),
      )
      .digest('hex')
      .slice(0, 32)}`;

    const { value, cache } = await cacheService.getOrLoad(
      key,
      async (): Promise<AIInsightResult> => {
        await takeUserCall(req.userId);
        const messages: ChatMessage[] = [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt(req.mode, context, question) },
        ];
        const { response, rejectedInsights, provider } = await generate(messages, new Grounding(context));

        const limitations = [...summary.dataQuality.limitations, ...response.dataLimitations];
        if (rejectedInsights > 0) {
          limitations.push(
            `${rejectedInsights} AI insight${rejectedInsights === 1 ? ' was' : 's were'} removed because ${rejectedInsights === 1 ? 'it' : 'they'} cited numbers not present in the data.`,
          );
        }
        return {
          summary: response.summary,
          insights: response.insights,
          dataLimitations: [...new Set(limitations)],
          meta: {
            mode: req.mode,
            period: summary.period,
            provider: provider.name,
            model: provider.model,
            generatedAt: new Date().toISOString(),
            cached: false,
            rejectedInsights,
          },
        };
      },
      AI_CACHE_TTL_SECONDS,
    );
    return cache === 'HIT' ? { ...value, meta: { ...value.meta, cached: true } } : value;
  },

  /** Tests only */
  resetUserLimitsForTests(): void {
    callLog.clear();
  },
};
