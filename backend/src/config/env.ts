import dotenv from 'dotenv';
import { z } from 'zod';

// Tests supply their own environment (vitest.config.mts) and must never read real credentials
if (process.env.NODE_ENV !== 'test') dotenv.config();

// A blank `KEY=` line in .env means "not set", not an empty value
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

const envSchema = z.object({
  PORT: z.string().default('3001'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  GITHUB_APP_ID: z.string().min(1),
  GITHUB_APP_PRIVATE_KEY: z.string().min(1),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  GITHUB_WEBHOOK_SECRET: z.string().min(1),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  UPSTASH_REDIS_REST_URL: optional(z.string().url()),
  UPSTASH_REDIS_REST_TOKEN: optional(z.string()),

  // AI insights: any OpenAI-compatible chat-completions API. Without AI_API_KEY the
  // AI endpoint reports "not configured"; analytics are unaffected.
  AI_API_KEY: optional(z.string()),
  AI_BASE_URL: z.string().url().default('https://api.groq.com/openai/v1'),
  AI_MODEL: z.string().default('openai/gpt-oss-120b'),
  // Optional second provider, used when the first is rate-limited or unavailable
  AI_FALLBACK_API_KEY: optional(z.string()),
  AI_FALLBACK_BASE_URL: z.string().url().default('https://api.cerebras.ai/v1'),
  AI_FALLBACK_MODEL: z.string().default('gpt-oss-120b'),

  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  // Public URL of this API — used to build the GitHub OAuth callback URL
  BACKEND_URL: z.string().url().default('http://localhost:3001'),

  // 32 random bytes, base64-encoded. Encrypts GitHub user tokens at rest.
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, {
      message: 'must be 32 bytes encoded as base64 (e.g. `openssl rand -base64 32`)',
    }),
  // How far back the first sync of a repository reads (later syncs are incremental)
  SYNC_LOOKBACK_DAYS: z.coerce.number().int().min(7).max(3650).default(180),

  // `none` is only needed when frontend and API are on different sites
  SESSION_COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
