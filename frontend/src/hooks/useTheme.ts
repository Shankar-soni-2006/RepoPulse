import { useSyncExternalStore } from 'react';

// App-wide light/dark theme. The "dark" class on <html> switches the CSS variables in
// index.css (and Tailwind's dark: variants). index.html applies the same rule before the
// first paint, so there is no flash of the wrong theme.

export type Theme = 'light' | 'dark';
export const THEME_STORAGE_KEY = 'repopulse-theme';
// Earlier versions stored the choice for the home page only under this key
const LEGACY_STORAGE_KEY = 'repopulse-home-theme';

const systemQuery = () =>
  typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : undefined;

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null; // storage blocked (private mode, policies)
  }
}

/** The visitor's saved choice, otherwise their system setting. */
export function currentTheme(): Theme {
  return memoryChoice ?? storedTheme() ?? (systemQuery()?.matches ? 'dark' : 'light');
}

export function applyTheme(theme: Theme = currentTheme()): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

// Used only when storage is unavailable
let memoryChoice: Theme | null = null;

const listeners = new Set<() => void>();
const notify = () => {
  applyTheme();
  listeners.forEach((listener) => listener());
};
const onStorage = (e: StorageEvent) => {
  if (e.key === THEME_STORAGE_KEY) notify(); // changed in another tab
};

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    systemQuery()?.addEventListener('change', notify);
    window.addEventListener('storage', onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      systemQuery()?.removeEventListener('change', notify);
      window.removeEventListener('storage', onStorage);
    }
  };
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // the choice then lasts until the page is reloaded
    memoryChoice = theme;
  }
  notify();
}

export function useTheme(): [Theme, () => void] {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => 'light' as Theme);
  return [theme, () => setTheme(theme === 'dark' ? 'light' : 'dark')];
}
