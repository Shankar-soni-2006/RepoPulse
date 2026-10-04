import type { AIInsight } from '@/types';
import { Badge, type BadgeProps } from '@/components/ui/Badge';

const SEVERITY: Record<AIInsight['severity'], { label: string; variant: BadgeProps['variant'] }> = {
  high: { label: 'High', variant: 'danger' },
  medium: { label: 'Medium', variant: 'warning' },
  low: { label: 'Low', variant: 'muted' },
};

const TYPE_LABEL: Record<AIInsight['type'], string> = {
  trend: 'Trend',
  anomaly: 'Anomaly',
  bottleneck: 'Bottleneck',
  comparison: 'Comparison',
  observation: 'Observation',
};

function Section({ label, children, tone }: { label: string; children: React.ReactNode; tone?: 'hypothesis' }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[9.5rem_1fr] gap-x-3 gap-y-0.5 py-2 first:pt-0 last:pb-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={tone === 'hypothesis' ? 'text-sm text-foreground/90 italic' : 'text-sm text-foreground'}>{children}</dd>
    </div>
  );
}

/**
 * One AI insight with fact, evidence, hypothesis and investigation kept visibly
 * separate, so a hypothesis is never read as an established fact.
 */
export function InsightCard({ insight }: { insight: AIInsight }) {
  const severity = SEVERITY[insight.severity];
  return (
    <article className="rounded-md border border-border">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <h3 className="text-sm font-semibold flex-1 min-w-0">{insight.title}</h3>
        <Badge variant="muted">{TYPE_LABEL[insight.type]}</Badge>
        <Badge variant={severity.variant} title="Severity assigned by the AI">
          {severity.label}
        </Badge>
      </header>
      <dl className="divide-y divide-border px-3 py-2">
        <Section label="Fact">{insight.fact}</Section>
        <Section label="Evidence">
          <ul className="list-disc pl-4 space-y-0.5">
            {insight.evidence.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Section>
        <Section label="Possible explanation" tone="hypothesis">
          {insight.possibleExplanation}
        </Section>
        <Section label="Investigation">{insight.recommendedInvestigation}</Section>
      </dl>
    </article>
  );
}
