import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { AlertCircle, Info } from 'lucide-react';
import { useShellRepository } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { InsightCard } from '@/components/ai/InsightCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Panel } from '@/components/ui/Panel';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { LoadingState } from '@/components/ui/States';
import { usePeriod } from '@/hooks/usePeriod';
import { aiService } from '@/services/aiService';
import { ApiRequestError } from '@/services/api';
import type { AIInsightMode, AIInsightResult } from '@/types';
import { formatRelative } from '@/utils/format';

const MODES: { value: Exclude<AIInsightMode, 'question'>; label: string; hint: string }[] = [
  { value: 'summary', label: 'Summary', hint: 'Overall engineering summary of the period' },
  { value: 'trends', label: 'Trends', hint: 'How metrics moved vs the previous period' },
  { value: 'anomalies', label: 'Anomalies', hint: 'Unusual values or abrupt changes' },
  { value: 'bottlenecks', label: 'Bottlenecks', hint: 'Where work waits: reviews, large PRs, backlog' },
  { value: 'comparison', label: 'Comparison', hint: 'This period vs the previous one, metric by metric' },
];

const EXAMPLES = ['Why did cycle time change?', 'What changed this period?', 'Which metric changed the most?', 'Are reviews a bottleneck?'];

// Informational outcomes (not failures) the backend reports as errors
const INFO_CODES = new Set(['AI_NO_ACTIVITY', 'AI_NO_DATA']);

function ErrorNotice({ error, base }: { error: Error; base: string }) {
  const code = error instanceof ApiRequestError ? error.code : undefined;
  const info = code && INFO_CODES.has(code);
  const message =
    code === 'AI_NOT_CONFIGURED'
      ? 'AI analysis isn’t configured on this server (no AI provider key).'
      : error.message;
  return (
    <div
      role={info ? 'status' : 'alert'}
      className={
        info
          ? 'flex gap-2 rounded-md border border-border bg-muted/30 px-3 py-2.5 text-sm'
          : 'flex gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800'
      }
    >
      {info ? <Info className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" aria-hidden /> : <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden />}
      <div>
        <p>{message}</p>
        {!info && (
          <p className="mt-0.5 text-xs opacity-80">
            Metrics are unaffected —{' '}
            <Link to={`${base}/analytics`} className="underline">
              open Analytics
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}

function Result({ result }: { result: AIInsightResult }) {
  const { meta } = result;
  return (
    <div className="space-y-3">
      <Panel title="Summary">
        <p className="text-sm leading-relaxed">{result.summary}</p>
      </Panel>

      {result.insights.length === 0 ? (
        <p className="text-sm text-muted-foreground px-1">No specific insights for this question — nothing in the data qualified.</p>
      ) : (
        <div className="space-y-3">
          {result.insights.map((insight, i) => (
            <InsightCard key={`${insight.title}-${i}`} insight={insight} />
          ))}
        </div>
      )}

      {result.dataLimitations.length > 0 && (
        <Panel title="Data limitations">
          <ul className="list-disc pl-4 space-y-0.5 text-xs text-muted-foreground">
            {result.dataLimitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </Panel>
      )}

      <p className="text-[11px] text-muted-foreground px-1">
        AI interpretation of RepoPulse metrics for the last {meta.period.days} days. Possible explanations are hypotheses — verify before acting.
        <br />
        {meta.model} via {meta.provider} · generated {formatRelative(meta.generatedAt)}
        {meta.cached && ' · served from cache (same data and question)'}
      </p>
    </div>
  );
}

export function AIInsightsPage() {
  const repo = useShellRepository();
  const [days] = usePeriod();
  const [mode, setMode] = useState<Exclude<AIInsightMode, 'question'>>('summary');
  const [question, setQuestion] = useState('');

  const run = useMutation({
    mutationFn: (req: { mode: AIInsightMode; question?: string }) => aiService.getInsights(repo.id, req.mode, days, req.question),
  });

  const ask = (q: string) => {
    const text = q.trim();
    if (text) run.mutate({ mode: 'question', question: text });
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-4xl">
      <PageHeader
        title="AI insights"
        subtitle="Explanations of this repository’s metrics. The AI only sees numbers RepoPulse computed; answers citing numbers not in that data are filtered out."
        period
      />

      <Panel>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl aria-label="Analysis type" value={mode} onChange={setMode} options={MODES.map(({ value, label }) => ({ value, label }))} />
            <Button variant="primary" size="sm" loading={run.isPending && run.variables?.mode !== 'question'} disabled={run.isPending} onClick={() => run.mutate({ mode })}>
              Analyze last {days} days
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{MODES.find((m) => m.value === mode)?.hint}</p>

          <form
            className="flex flex-wrap gap-2 border-t border-border pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              ask(question);
            }}
          >
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={500}
              placeholder="Ask a question about this repository’s metrics"
              aria-label="Question"
              className="flex-1 min-w-[14rem]"
            />
            <Button type="submit" size="md" loading={run.isPending && run.variables?.mode === 'question'} disabled={run.isPending || !question.trim()}>
              Ask
            </Button>
          </form>
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((q) => (
              <button
                key={q}
                type="button"
                disabled={run.isPending}
                onClick={() => {
                  setQuestion(q);
                  ask(q);
                }}
                className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </Panel>

      {run.isPending && <LoadingState message="Analyzing metrics…" />}
      {run.error && <ErrorNotice error={run.error} base={`/repositories/${repo.id}`} />}
      {run.data && !run.isPending && (
        <>
          {run.variables?.mode === 'question' && run.variables.question && (
            <p className="text-sm">
              <span className="text-muted-foreground">Question:</span> {run.variables.question}
            </p>
          )}
          <Result result={run.data} />
        </>
      )}
      {run.isIdle && (
        <p className="text-sm text-muted-foreground px-1">
          Choose an analysis or ask a question. Each run uses the AI provider’s daily quota; repeated requests on unchanged data are answered from cache.
        </p>
      )}
    </div>
  );
}
