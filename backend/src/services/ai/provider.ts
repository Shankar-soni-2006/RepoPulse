import { env } from '../../config/env.js';

// Minimal client for OpenAI-compatible chat-completions APIs (Groq, Cerebras,
// OpenRouter, Mistral, ...). No SDK: one POST per call, so any compatible
// provider works by configuration alone.

const REQUEST_TIMEOUT_MS = 45_000;
// gpt-oss models spend part of the completion budget on reasoning tokens
const MAX_COMPLETION_TOKENS = 4000;

export interface AIProvider {
  /** Host of the base URL, e.g. api.groq.com */
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }

  get rateLimited(): boolean {
    return this.status === 429;
  }
}

/** Configured providers in priority order: primary, then the optional fallback. */
export function configuredProviders(): AIProvider[] {
  const candidates = [
    { apiKey: env.AI_API_KEY, baseUrl: env.AI_BASE_URL, model: env.AI_MODEL },
    { apiKey: env.AI_FALLBACK_API_KEY, baseUrl: env.AI_FALLBACK_BASE_URL, model: env.AI_FALLBACK_MODEL },
  ];
  return candidates
    .filter((c): c is { apiKey: string; baseUrl: string; model: string } => !!c.apiKey)
    .map((c) => ({ ...c, baseUrl: c.baseUrl.replace(/\/+$/, ''), name: new URL(c.baseUrl).host }));
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  error?: { message?: string };
}

/**
 * One chat completion constrained to `jsonSchema`. Returns the raw message content
 * (a JSON string; the caller validates it).
 */
export async function completeJson(
  provider: AIProvider,
  messages: ChatMessage[],
  jsonSchema: Record<string, unknown>,
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${provider.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: provider.model,
        messages,
        temperature: 0.2,
        max_completion_tokens: MAX_COMPLETION_TOKENS,
        reasoning_effort: 'low',
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'repopulse_insights', strict: true, schema: jsonSchema },
        },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new ProviderError(provider.name, `request failed: ${(err as Error).message}`);
  }

  let body: ChatCompletionResponse;
  try {
    body = (await res.json()) as ChatCompletionResponse;
  } catch {
    throw new ProviderError(provider.name, `non-JSON response (HTTP ${res.status})`, res.status);
  }
  if (!res.ok) {
    throw new ProviderError(provider.name, body.error?.message ?? `HTTP ${res.status}`, res.status);
  }

  const choice = body.choices?.[0];
  const content = choice?.message?.content;
  if (!content) {
    throw new ProviderError(provider.name, `empty completion (finish_reason: ${choice?.finish_reason ?? 'unknown'})`);
  }
  return content;
}
