import { describe, expect, it } from 'vitest';
import { DURATION_PRESETS, findDurationPreset, formatDuration, parseCustomHours } from './duration';

describe('findDurationPreset', () => {
  it('matches exact preset hours', () => {
    for (const p of DURATION_PRESETS) expect(findDurationPreset(p.hours)).toBe(p);
  });

  it('matches backend-rounded values', () => {
    expect(findDurationPreset(0.08)?.label).toBe('5 min');
    expect(findDurationPreset(0.25)?.label).toBe('15 min');
  });

  it('returns null for no estimate or non-preset values', () => {
    expect(findDurationPreset(null)).toBeNull();
    expect(findDurationPreset(undefined)).toBeNull();
    expect(findDurationPreset(0)).toBeNull();
    expect(findDurationPreset(1.5)).toBeNull();
  });
});

describe('parseCustomHours', () => {
  it('treats empty text as no estimate', () => {
    expect(parseCustomHours('  ')).toEqual({ ok: true, hours: null });
  });

  it('accepts decimals', () => {
    expect(parseCustomHours('1.5')).toEqual({ ok: true, hours: 1.5 });
    expect(parseCustomHours('.75')).toEqual({ ok: true, hours: 0.75 });
    expect(parseCustomHours('4')).toEqual({ ok: true, hours: 4 });
  });

  it('rejects non-numeric, zero and negative input', () => {
    for (const t of ['abc', '1h', '-2', '0', '0.0', '1e3']) {
      expect(parseCustomHours(t).ok).toBe(false);
    }
  });

  it('accepts large values', () => {
    expect(parseCustomHours('1000')).toEqual({ ok: true, hours: 1000 });
  });
});

describe('formatDuration', () => {
  it('shows minutes under an hour', () => {
    expect(formatDuration(5 / 60)).toBe('5 min');
    expect(formatDuration(0.08)).toBe('5 min');
    expect(formatDuration(0.25)).toBe('15 min');
    expect(formatDuration(0.5)).toBe('30 min');
  });

  it('shows rounded hours from one hour up', () => {
    expect(formatDuration(1)).toBe('1 hr');
    expect(formatDuration(1.5)).toBe('1.5 hrs');
    expect(formatDuration(4 / 3)).toBe('1.33 hrs');
  });
});
