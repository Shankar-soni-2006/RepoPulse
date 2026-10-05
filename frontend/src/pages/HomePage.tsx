import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Clock,
  Database,
  GitPullRequest,
  Github,
  Lightbulb,
  Linkedin,
  Lock,
  RefreshCw,
  ShieldCheck,
  Users,
  Webhook,
} from 'lucide-react';
import { useSession } from '@/hooks/useSession';
import { useTheme } from '@/hooks/useTheme';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { authService } from '@/services/authService';
import SplitText from '@/components/reactbits/SplitText';
import ShinyText from '@/components/reactbits/ShinyText';
import CountUp from '@/components/reactbits/CountUp';
import SpotlightCard from '@/components/reactbits/SpotlightCard';
import AnimatedContent from '@/components/reactbits/AnimatedContent';
import GlareHover from '@/components/reactbits/GlareHover';
import Magnet from '@/components/reactbits/Magnet';
import Carousel from '@/components/reactbits/Carousel';

export const OWNER = {
  name: 'Shankar Soni',
  github: 'https://github.com/Shankar-soni-2006',
  githubHandle: 'Shankar-soni-2006',
  linkedin: 'https://www.linkedin.com/in/shankar-soni-82b246337/',
};

const POLICY_UPDATED = 'October 5, 2026';


/** Animations only when the visitor hasn't asked for reduced motion (and the browser can tell us). */
function useMotionAllowed(): boolean {
  const query = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const [allowed, setAllowed] = useState(() => !!query && !query.matches);
  useEffect(() => {
    if (!query) return;
    const onChange = () => setAllowed(!query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [query]);
  return allowed;
}

const FEATURES = [
  {
    icon: Clock,
    title: 'Delivery metrics',
    text: 'Cycle time, first-review time, review delay, throughput, PR size and code churn, each compared with the previous period.',
  },
  {
    icon: GitPullRequest,
    title: 'Pull request explorer',
    text: 'Filter, sort and open any pull request to see its timeline, size, reviews and how long each stage took.',
  },
  {
    icon: Users,
    title: 'Contributors',
    text: 'Who opened, reviewed and committed what, so review load and bottlenecks are visible, not guessed.',
  },
  {
    icon: BarChart3,
    title: 'Trend analytics',
    text: 'Daily trends over 7, 30 or 90 days, one unit per chart, with data-quality notes on every screen.',
  },
  {
    icon: Lightbulb,
    title: 'AI insights you can check',
    text: 'Summaries, trends, anomalies, bottlenecks or your own question. Every number the AI writes must exist in your data.',
  },
  {
    icon: Webhook,
    title: 'Live updates',
    text: 'GitHub webhooks update pull requests, reviews and commits as they happen. No manual refresh needed.',
  },
  {
    icon: RefreshCw,
    title: 'Incremental sync',
    text: 'The first sync reads 180 days of history; later syncs only fetch what changed, within GitHub rate limits.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure by design',
    text: 'Read-only GitHub access, encrypted tokens, hashed sessions, signed webhooks. You only see repositories you can access on GitHub.',
  },
  {
    icon: Database,
    title: 'Real data only',
    text: 'No demo numbers. Everything comes from your repositories, stored in Postgres and cached for speed.',
  },
];

const STEPS = [
  { title: 'Sign in with GitHub', text: 'One click. RepoPulse only reads your public profile to identify you.' },
  { title: 'Install the GitHub App', text: 'Choose “All repositories” so new repositories are included automatically.' },
  { title: 'Sync and explore', text: 'Sync a repository and open its overview, pull requests, contributors, trends and AI insights.' },
];

const FACTS = [
  { value: 6, suffix: '', label: 'delivery metrics' },
  { value: 3, suffix: '', label: 'comparison periods' },
  { value: 180, suffix: ' days', label: 'of history on first sync' },
  { value: 270, suffix: '+', label: 'automated tests' },
];

function Reveal({ children, motion, delay = 0 }: { children: ReactNode; motion: boolean; delay?: number }) {
  if (!motion) return <div className="h-full">{children}</div>;
  return (
    <AnimatedContent distance={24} duration={0.6} delay={delay} threshold={0.15} className="h-full">
      {children}
    </AnimatedContent>
  );
}

/**
 * React Bits hover effects for cards, kept subtle to match the product: a few pixels of
 * magnetic pull toward the pointer (only while it is over the card) and a single soft
 * glare sweep. Glare color follows the theme. Off when reduced motion is preferred.
 */
function HoverCard({ children, motion, dark }: { children: ReactNode; motion: boolean; dark: boolean }) {
  if (!motion) return <>{children}</>;
  return (
    <Magnet
      padding={0}
      magnetStrength={30}
      activeTransition="transform 0.25s ease-out"
      inactiveTransition="transform 0.45s ease-in-out"
      wrapperClassName="h-full"
      innerClassName="h-full"
    >
      <GlareHover
        glareColor={dark ? '#ffffff' : '#2563eb'}
        glareOpacity={dark ? 0.12 : 0.1}
        glareAngle={-35}
        glareSize={220}
        transitionDuration={700}
        playOnce
      >
        {children}
      </GlareHover>
    </Magnet>
  );
}

function PolicySection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-16 border-t border-border py-12">
      <h2 id={`${id}-title`} className="text-lg font-semibold tracking-tight">
        {title}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">Last updated {POLICY_UPDATED}</p>
      <div className="mt-6 space-y-5 text-sm leading-relaxed text-foreground/90 [&_h3]:font-semibold [&_h3]:text-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
        {children}
      </div>
    </section>
  );
}

export function HomePage() {
  const { data: session } = useSession();
  const motion = useMotionAllowed();
  const [theme] = useTheme(); // app-wide; only needed here for the React Bits colors
  // Features as a slider (React Bits Carousel) or all at once; reduced motion always gets the grid
  const [featureView, setFeatureView] = useState<'slider' | 'grid'>('slider');
  const showSlider = motion && featureView === 'slider';
  const dark = theme === 'dark';
  const signedIn = !!session;
  const { hash } = useLocation();

  // Links like /#privacy arrive before this lazily loaded page exists; scroll once it does
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView?.();
  }, [hash]);

  const primaryAction = signedIn ? (
    <Link
      to="/repositories"
      className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
    >
      Open dashboard
    </Link>
  ) : (
    <button
      type="button"
      onClick={() => authService.login()}
      className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
    >
      <Github className="h-4 w-4" aria-hidden />
      Continue with GitHub
    </button>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-5xl items-center gap-4 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" aria-hidden />
            <span className="text-sm font-semibold tracking-tight">RepoPulse</span>
          </Link>
          <nav aria-label="Sections" className="ml-2 hidden items-center gap-4 text-sm text-muted-foreground sm:flex">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#how-it-works" className="hover:text-foreground">How it works</a>
            <a href="#privacy" className="hover:text-foreground">Privacy</a>
            <a href="#terms" className="hover:text-foreground">Terms</a>
          </nav>
          <div className="flex-1" />
          <ThemeToggle />
          {signedIn ? (
            <Link to="/repositories" className="text-sm font-medium text-primary hover:underline">
              Dashboard
            </Link>
          ) : (
            <Link to="/login" className="text-sm font-medium text-primary hover:underline">
              Sign in
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 sm:px-6">
        {/* Hero */}
        <section className="py-16 text-center sm:py-24">
          <div className="text-xs font-medium uppercase tracking-wider">
            {motion ? (
              <ShinyText
                key={theme}
                text="Engineering intelligence for GitHub"
                color={dark ? '#94a3b8' : '#64748b'}
                shineColor={dark ? '#93c5fd' : '#2563eb'}
                speed={3}
              />
            ) : (
              <span className="text-muted-foreground">Engineering intelligence for GitHub</span>
            )}
          </div>
          {motion ? (
            <SplitText
              tag="h1"
              text="Know how your team ships code."
              className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl"
              splitType="words"
              delay={60}
              duration={0.9}
              from={{ opacity: 0, y: 24 }}
              to={{ opacity: 1, y: 0 }}
              rootMargin="0px"
            />
          ) : (
            <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">Know how your team ships code.</h1>
          )}
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground">
            RepoPulse turns your pull requests, reviews and commits into clear delivery metrics: how long changes take,
            where reviews wait, and whether things are getting better. Real GitHub data, explained by AI that can’t make
            numbers up.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {primaryAction}
            <a
              href="#features"
              className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-accent"
            >
              See features
            </a>
          </div>
        </section>

        {/* Facts */}
        <section aria-label="Project facts" className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
          {FACTS.map((f) => (
            <div key={f.label} className="bg-background px-4 py-5 text-center">
              <div className="text-2xl font-semibold tabular-nums">
                {motion ? <CountUp to={f.value} duration={1.2} /> : f.value}
                {f.suffix}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{f.label}</div>
            </div>
          ))}
        </section>

        {/* Features */}
        <section id="features" aria-labelledby="features-title" className="scroll-mt-16 py-16">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="features-title" className="text-lg font-semibold tracking-tight">Features</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Everything below works on your real repositories today.
              </p>
            </div>
            {motion && (
              <button
                type="button"
                onClick={() => setFeatureView(showSlider ? 'grid' : 'slider')}
                className="text-sm font-medium text-primary hover:underline"
              >
                {showSlider ? `Show all ${FEATURES.length} features` : 'Show as slider'}
              </button>
            )}
          </div>
          {showSlider ? (
            <div className="mt-8">
              <Carousel
                label="Features"
                items={FEATURES.map(({ icon: Icon, title, text }, i) => ({
                  id: i + 1,
                  title,
                  description: text,
                  icon: <Icon className="h-4 w-4" aria-hidden />,
                }))}
                maxWidth={560}
                autoplay
                autoplayDelay={4000}
                pauseOnHover
                loop
              />
            </div>
          ) : (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, text }, i) => (
                <Reveal key={title} motion={motion} delay={(i % 3) * 0.08}>
                  <HoverCard motion={motion} dark={dark}>
                    <SpotlightCard className="h-full" spotlightColor={dark ? 'rgba(96, 165, 250, 0.12)' : 'rgba(37, 99, 235, 0.08)'}>
                      <Icon className="h-4 w-4 text-primary" aria-hidden />
                      <h3 className="mt-3 text-sm font-semibold">{title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{text}</p>
                    </SpotlightCard>
                  </HoverCard>
                </Reveal>
              ))}
            </div>
          )}
        </section>

        {/* How it works */}
        <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-16 border-t border-border py-16">
          <h2 id="how-title" className="text-lg font-semibold tracking-tight">How it works</h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <Reveal motion={motion} delay={i * 0.1}>
                  <HoverCard motion={motion} dark={dark}>
                    <div className="h-full rounded-lg border border-border p-5">
                      <div className="text-xs font-medium text-primary">Step {i + 1}</div>
                      <h3 className="mt-2 text-sm font-semibold">{s.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
                    </div>
                  </HoverCard>
                </Reveal>
              </li>
            ))}
          </ol>
          <div className="mt-8 flex items-center gap-2 rounded-md border border-border bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
            RepoPulse never writes to GitHub. It only reads repositories you choose when installing the App.
          </div>
        </section>

        {/* Legal */}
        <PolicySection id="privacy" title="Privacy Policy">
          <p>
            RepoPulse is a personal project operated by {OWNER.name}. This policy explains what data RepoPulse handles
            when you sign in, and why.
          </p>
          <div>
            <h3>What we collect</h3>
            <ul>
              <li>
                <strong>Your GitHub profile:</strong> GitHub user id, username, display name, avatar and email address,
                received when you sign in with GitHub.
              </li>
              <li>
                <strong>Repository activity</strong> for repositories you share through the RepoPulse GitHub App:
                repository details, pull requests (titles, descriptions, labels, timestamps, size), reviews, commits
                (messages, authors, line counts) and the GitHub identities of contributors.
              </li>
              <li>
                <strong>Sign-in data:</strong> a session record and your GitHub access tokens, stored encrypted
                (AES-256-GCM). The session cookie itself is stored only as a hash.
              </li>
              <li>
                <strong>Webhook deliveries</strong> from GitHub about those repositories, kept to process updates.
              </li>
            </ul>
            <p className="mt-2">RepoPulse does not store your source code; it keeps only the activity data above.</p>
          </div>
          <div>
            <h3>How we use it</h3>
            <ul>
              <li>To sign you in and show only the repositories you can access on GitHub.</li>
              <li>To compute and display delivery metrics and trends.</li>
              <li>
                To generate AI insights when you ask for them. Only computed metrics and a few example pull requests
                (number, title, timings, size) are sent to the AI provider.
              </li>
              <li>
                To run the service: RepoPulse admins can see account details (username, name, role, sign-up and last
                activity, number of connected repositories) to manage roles and suspend or delete accounts. Admins do not
                get access to repositories GitHub doesn’t give them.
              </li>
            </ul>
            <p className="mt-2">We do not sell your data, show ads, or use tracking or analytics cookies.</p>
          </div>
          <div>
            <h3>Service providers</h3>
            <ul>
              <li><strong>GitHub</strong> (source of the data and sign-in)</li>
              <li><strong>Supabase</strong> (database and authentication, hosted in Seoul, South Korea)</li>
              <li><strong>Vercel</strong> (hosting of the website and API)</li>
              <li><strong>Upstash</strong> (temporary cache: computed metrics for up to 10 minutes, AI answers for up to 6 hours)</li>
              <li><strong>Groq</strong> and <strong>Cerebras</strong> (AI insights, only when you request them)</li>
            </ul>
          </div>
          <div>
            <h3>Cookies</h3>
            <p>
              Only strictly necessary cookies: <code className="font-mono text-xs">rp_session</code> keeps you signed in
              (up to 7 days); <code className="font-mono text-xs">rp_oauth_flow</code> and{' '}
              <code className="font-mono text-xs">rp_oauth_retry</code> protect the sign-in process (up to 10 minutes).
            </p>
          </div>
          <div>
            <h3>Retention and your choices</h3>
            <ul>
              <li>Signing out deletes your session. Sessions expire after 7 days.</li>
              <li>
                You can stop RepoPulse’s access at any time by uninstalling the GitHub App or revoking its authorization
                in your GitHub settings (Settings → Applications).
              </li>
              <li>
                To have your data deleted, contact the operator through the GitHub or LinkedIn profile linked below.
              </li>
            </ul>
          </div>
        </PolicySection>

        <PolicySection id="terms" title="Terms of Use">
          <div>
            <h3>The service</h3>
            <p>
              RepoPulse is provided free of charge, as a personal and portfolio project, “as is” and “as available”,
              without warranties of any kind. Features, limits and availability may change at any time.
            </p>
          </div>
          <div>
            <h3>Your responsibilities</h3>
            <ul>
              <li>Connect only repositories you are allowed to access, and follow GitHub’s Terms of Service.</li>
              <li>Do not attempt to break, overload or circumvent the service’s security or rate limits.</li>
              <li>Keep your GitHub account secure; you are responsible for activity under it.</li>
            </ul>
          </div>
          <div>
            <h3>Metrics and AI</h3>
            <p>
              Metrics describe your development process, not individual performance, and depend on the data GitHub
              provides. AI insights are hypotheses to investigate, not conclusions; verify them before acting.
            </p>
          </div>
          <div>
            <h3>Limits and liability</h3>
            <p>
              The service runs on free tiers of third-party providers and may be slow, limited or unavailable. To the
              extent permitted by law, the operator is not liable for any loss arising from use of the service.
            </p>
          </div>
          <div>
            <h3>Changes</h3>
            <p>These terms and the privacy policy may be updated; the date above shows the latest version.</p>
          </div>
        </PolicySection>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-4 px-4 py-8 text-sm sm:px-6">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Activity className="h-4 w-4 text-primary" aria-hidden />
            <span>
              © 2026 RepoPulse · Built by <span className="text-foreground">{OWNER.name}</span>
            </span>
          </div>
          <nav aria-label="Legal" className="flex gap-4 text-muted-foreground">
            <a href="#privacy" className="hover:text-foreground">Privacy</a>
            <a href="#terms" className="hover:text-foreground">Terms</a>
          </nav>
          <div className="flex flex-wrap items-center gap-2 md:ml-auto">
            <a
              href={OWNER.github}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${OWNER.name} on GitHub`}
              className="inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-md border border-border px-3 hover:bg-accent"
            >
              <Github className="h-4 w-4 flex-shrink-0" aria-hidden />
              <span>{OWNER.githubHandle}</span>
            </a>
            <a
              href={OWNER.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${OWNER.name} on LinkedIn`}
              className="inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-md border border-border px-3 hover:bg-accent"
            >
              <Linkedin className="h-4 w-4 flex-shrink-0 text-[#0a66c2] dark:text-[#70b5f9]" aria-hidden />
              <span>LinkedIn</span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
