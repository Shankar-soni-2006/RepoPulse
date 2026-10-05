import { useTheme } from '@/hooks/useTheme';

// Chart colors per theme. Recharts and the sparkline set SVG attributes directly, which
// can't read CSS variables, so components pick the palette for the current theme here.
// Kept separate from TrendChart so small charts don't import the charting library.
export interface ChartColors {
  series: string;
  grid: string;
  axisText: string;
  cursorFill: string;
  /** Ring around points, matching the page background */
  pointRing: string;
}

export const CHART_COLORS: Record<'light' | 'dark', ChartColors> = {
  light: {
    series: '#2a78d6',
    grid: 'hsl(220 13% 91%)',
    axisText: 'hsl(220 9% 46%)',
    cursorFill: 'hsl(220 14% 96%)',
    pointRing: '#ffffff',
  },
  dark: {
    series: '#60a5fa',
    grid: 'hsl(217 15% 19%)',
    axisText: 'hsl(215 16% 66%)',
    cursorFill: 'hsl(217 19% 15%)',
    pointRing: 'hsl(222 24% 7%)',
  },
};

export function useChartColors(): ChartColors {
  const [theme] = useTheme();
  return CHART_COLORS[theme];
}
