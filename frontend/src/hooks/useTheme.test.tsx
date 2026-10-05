import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { CHART_COLORS, useChartColors } from '@/components/charts/theme';
import { THEME_STORAGE_KEY, applyTheme, currentTheme } from './useTheme';

describe('app-wide theme', () => {
  it('uses the system setting until the user chooses', () => {
    expect(currentTheme()).toBe('light'); // test environment reports a light system theme
  });

  it('keeps a choice made on the old home-page-only setting', () => {
    localStorage.setItem('repopulse-home-theme', 'dark');
    expect(currentTheme()).toBe('dark');
  });

  it('applies the theme to the whole document and keeps every toggle in sync', async () => {
    render(
      <>
        <ThemeToggle />
        <ThemeToggle />
      </>,
    );
    const [first] = screen.getAllByRole('button', { name: 'Switch to dark mode' });
    await userEvent.click(first);

    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(screen.getAllByRole('button', { name: 'Switch to light mode' })).toHaveLength(2);
  });

  it('restores the saved theme at start-up', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    applyTheme();
    expect(document.documentElement).toHaveClass('dark');
  });

  it('gives charts the palette of the current theme', async () => {
    function Probe() {
      return <span data-testid="series">{useChartColors().series}</span>;
    }
    render(
      <>
        <Probe />
        <ThemeToggle />
      </>,
    );
    expect(screen.getByTestId('series')).toHaveTextContent(CHART_COLORS.light.series);
    await userEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }));
    expect(screen.getByTestId('series')).toHaveTextContent(CHART_COLORS.dark.series);
  });
});
