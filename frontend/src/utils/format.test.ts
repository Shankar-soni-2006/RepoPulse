import { describe, it, expect } from 'vitest';
import { formatChange, formatCount, formatDay, formatHours } from './format';

describe('formatHours (backend durations are hours)', () => {
  it.each([
    [null, '—'],
    [0.0032, '12s'],
    [0.5, '30m'],
    [4.84, '4.8h'],
    [31.5, '1.3d'],
  ])('%s → %s', (hours, text) => {
    expect(formatHours(hours)).toBe(text);
  });
});

describe('formatChange (fraction → signed percent)', () => {
  it.each([
    [null, '—'],
    [0, '0%'],
    [0.27, '+27%'],
    [-0.1, '−10%'],
    [-1, '−100%'],
    [0.004, '+0.4%'],
  ])('%s → %s', (change, text) => {
    expect(formatChange(change)).toBe(text);
  });
});

describe('formatCount / formatDay', () => {
  it('uses thousands separators and readable UTC days', () => {
    expect(formatCount(8200)).toBe('8,200');
    expect(formatCount(null)).toBe('—');
    expect(formatDay('2026-09-04')).toBe('Sep 4');
  });
});
