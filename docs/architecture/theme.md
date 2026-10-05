# Light and dark mode

RepoPulse has one app-wide theme setting: **light** or **dark**. It covers every page: home,
login, repositories, all dashboard pages, the Admin page and pop-ups such as the pull
request drawer and the mobile navigation.

## For users

- **Toggle:** the sun/moon button switches the theme. It is on every screen:

  | Screen | Where |
  |---|---|
  | Home page | header, left of *Sign in / Dashboard* |
  | Login page | top-right corner |
  | Repositories | header, left of the account menu |
  | Overview, Pull Requests, Contributors, Analytics, AI Insights, Settings | right end of the top bar |
  | Admin page | header, left of the account menu |

- **Default:** the device's setting (*prefers-color-scheme*). If the device switches between
  light and dark (for example at sunset), RepoPulse follows, until you pick a theme yourself.
- **Remembered:** your choice is saved in this browser (`localStorage`, key
  `repopulse-theme`) and applies to the whole site and to other open tabs. It is per
  browser and device, not per account.
- **No flash:** the saved theme is applied before the page first draws.

## How it works

```
index.html inline script ──► <html class="dark"> before first paint
src/main.tsx applyTheme() ──► same rule once the app starts
hooks/useTheme.ts ──────────► one store: saved choice ▸ system setting; notifies every toggle
components/ui/ThemeToggle ──► setTheme(): saves, updates <html>, re-renders all toggles
index.css .dark { … } ──────► the dark palette (CSS variables)
tailwind darkMode: 'class' ─► dark: variants apply when <html> has "dark"
charts/theme.ts ────────────► chart colors per theme (SVG attributes can't read CSS variables)
```

| Piece | File | Role |
|---|---|---|
| Theme store | `frontend/src/hooks/useTheme.ts` | `currentTheme()` = saved choice, otherwise the system setting; `setTheme()` saves and applies; `useTheme()` keeps components in sync (also across tabs via the `storage` event, and with system changes). Falls back to memory if storage is blocked. Reads the older home-page-only key `repopulse-home-theme` once and migrates it |
| No-flash script | `frontend/index.html` | Same rule as the store, inline in `<head>`, so the first paint is already in the right theme |
| Start-up | `frontend/src/main.tsx` | `applyTheme()` before rendering |
| Toggle | `frontend/src/components/ui/ThemeToggle.tsx` | Sun in dark mode, moon in light mode; accessible label *Switch to light/dark mode* |
| Palettes | `frontend/src/index.css` | Light variables on `:root`, dark variables on `.dark`, `color-scheme` so native scrollbars and form controls match |
| Tailwind | `frontend/tailwind.config.js` | Theme colors read the CSS variables; `darkMode: 'class'` for `dark:` variants |
| Charts | `frontend/src/components/charts/theme.ts` | `useChartColors()` returns the light or dark chart palette; used by `TrendChart`, `Sparkline`, `PeriodComparison` |
| Home page effects | `frontend/src/pages/HomePage.tsx` | React Bits ShinyText, SpotlightCard and GlareHover colors switch with the theme; the features Carousel uses theme tokens throughout (glare: faint blue `#2563eb` at 10% on light, white at 12% on dark) |

## Palettes

Most components use theme tokens (`bg-background`, `text-foreground`, `border-border`,
`text-muted-foreground`, `bg-primary`, …), so they change automatically.

| Token | Light | Dark |
|---|---|---|
| `--background` | `0 0% 100%` (white) | `222 24% 7%` (near-black blue) |
| `--foreground` | `222 14% 10%` | `210 20% 92%` |
| `--muted` / `--secondary` | `220 14% 96%` | `217 19% 13%` |
| `--muted-foreground` | `220 9% 46%` | `215 16% 66%` |
| `--border` / `--input` | `220 13% 91%` | `217 15% 19%` |
| `--primary` / `--ring` | `221 83% 53%` (blue) | `213 94% 68%` (light blue) |
| `--primary-foreground` | white | `222 47% 11%` (dark text on light-blue buttons) |
| `--accent` | `220 14% 96%` | `217 19% 15%` |
| `--destructive` | `0 84% 60%` | `0 72% 60%` |

Status colors that aren't tokens carry explicit `dark:` variants:

| Use | Light | Dark |
|---|---|---|
| Success badge (*Synced*, *Active*) | `bg-green-50 text-green-700 border-green-200` | `dark:bg-green-950/40 dark:text-green-300 dark:border-green-900` |
| Warning badge / API-unreachable notice | `bg-yellow-50 text-yellow-700/800 border-yellow-200` | `dark:bg-yellow-950/40 dark:text-yellow-200/300 dark:border-yellow-900` |
| Danger badge / error boxes | `bg-red-50 text-red-700/800 border-red-200` | `dark:bg-red-950/40 dark:text-red-200/300 dark:border-red-900` |
| Improvement / added lines | `text-emerald-700` | `dark:text-emerald-400` |
| Regression / deleted lines | `text-red-700` | `dark:text-red-300` |
| LinkedIn logo (footer) | `#0a66c2` | `#70b5f9` |

Chart palette (`charts/theme.ts`):

| | Light | Dark |
|---|---|---|
| Series (lines, bars, current period) | `#2a78d6` | `#60a5fa` |
| Grid and axis line | `hsl(220 13% 91%)` | `hsl(217 15% 19%)` |
| Axis labels | `hsl(220 9% 46%)` | `hsl(215 16% 66%)` |
| Hover band (bar charts) | `hsl(220 14% 96%)` | `hsl(217 19% 15%)` |
| Ring around points | white | the dark background |
| Previous period (comparison bars) | muted text color at 45% | same token, adapts automatically |

## Accessibility

Measured contrast ratios (WCAG; AA needs 4.5:1 for normal text, 3:1 for large text and
graphics):

| Pair | Light | Dark |
|---|---|---|
| Body text on background | 17.75 | 15.81 |
| Secondary text on background | 4.85 | 7.71 |
| Secondary text on muted panels | 4.42 ⚠ | 6.65 |
| Links / primary on background | 5.20 | 7.53 |
| Button text on primary button | 5.20 | 7.09 |
| Chart series on background (graphics, 3:1) | 4.42 | 7.48 |

⚠ In light mode, small gray text on gray panels is just under 4.5:1 (fine for large text);
darkening `--muted-foreground` slightly would close the gap. Dark mode passes everywhere.

- The toggle has an accessible name that says what it will do.
- Visitors who prefer reduced motion get static versions of the home page animations;
  the theme itself never animates.

## Verification

- **Automated tests:** `frontend/src/hooks/useTheme.test.tsx` (system default, migrated old
  setting, whole-document switch, all toggles in sync, start-up restore, chart palette per
  theme) and `frontend/src/pages/HomePage.test.tsx` (toggle and remembered choice).
- **Visual audit (2026-10-05):** every page above, plus the pull request drawer, a real AI
  answer and the mobile navigation, was scanned in dark mode for light backgrounds and
  dark text. No issues; the only flags were the intended dark text on light-blue buttons.
  The same scan in light mode flagged 25 elements, confirming it detects light styling.

## Adding a new screen or component

1. Use theme tokens (`bg-background`, `text-foreground`, `text-muted-foreground`,
   `border-border`, `bg-muted`, `bg-primary`, `text-primary`, …), not fixed colors.
2. If a fixed color is unavoidable (status colors, brand logos), add a `dark:` variant on the
   same element and check contrast on the dark background.
3. Charts and SVG: take colors from `useChartColors()`; SVG attributes can't read CSS
   variables.
4. Put `<ThemeToggle />` in the header of any new full-page layout.
5. Check the screen in both themes (toggle, or emulate *prefers-color-scheme*).
