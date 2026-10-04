import { z } from 'zod';

// The AI response contract, twice: a JSON Schema sent to the provider (strict
// structured output) and a Zod schema that validates what actually comes back.
// Strict mode requires every property to be listed and required.

const INSIGHT_TYPES = ['trend', 'anomaly', 'bottleneck', 'comparison', 'observation'] as const;
const SEVERITIES = ['low', 'medium', 'high'] as const;
export const MAX_INSIGHTS = 5;

export const aiResponseJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'insights', 'dataLimitations'],
  properties: {
    summary: { type: 'string' },
    insights: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'type', 'severity', 'fact', 'evidence', 'possibleExplanation', 'recommendedInvestigation'],
        properties: {
          title: { type: 'string' },
          type: { type: 'string', enum: [...INSIGHT_TYPES] },
          severity: { type: 'string', enum: [...SEVERITIES] },
          fact: { type: 'string' },
          evidence: { type: 'array', items: { type: 'string' } },
          possibleExplanation: { type: 'string' },
          recommendedInvestigation: { type: 'string' },
        },
      },
    },
    dataLimitations: { type: 'array', items: { type: 'string' } },
  },
} as const;

const text = (max: number) => z.string().trim().min(1).max(max);

export const aiInsightSchema = z.object({
  title: text(120),
  type: z.enum(INSIGHT_TYPES),
  severity: z.enum(SEVERITIES),
  fact: text(600),
  evidence: z.array(text(400)).min(1).max(8),
  possibleExplanation: text(600),
  recommendedInvestigation: text(600),
});

export const aiResponseSchema = z.object({
  summary: text(1200),
  insights: z.array(aiInsightSchema).max(MAX_INSIGHTS),
  dataLimitations: z.array(text(400)).max(10),
});

export type ValidatedAIResponse = z.infer<typeof aiResponseSchema>;
