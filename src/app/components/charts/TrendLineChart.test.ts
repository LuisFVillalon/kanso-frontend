import { describe, expect, it } from 'vitest';
import { niceHourTicks } from './TrendLineChart';

describe('niceHourTicks', () => {
  it('keeps small ranges at one label per hour', () => {
    expect(niceHourTicks(2)).toEqual([0, 1, 2]);
    expect(niceHourTicks(1.5)).toEqual([0, 1, 2]);
    expect(niceHourTicks(4)).toEqual([0, 1, 2, 3, 4]);
  });

  it('uses half-hour steps for sub-hour ranges', () => {
    expect(niceHourTicks(1)).toEqual([0, 0.5, 1]);
    expect(niceHourTicks(0.25)).toEqual([0, 0.5]);
  });

  it('spreads busy weeks over a few evenly spaced labels', () => {
    expect(niceHourTicks(13)).toEqual([0, 4, 8, 12, 16]);
    expect(niceHourTicks(5)).toEqual([0, 2, 4, 6]);
    expect(niceHourTicks(20)).toEqual([0, 6, 12, 18, 24]);
    expect(niceHourTicks(40)).toEqual([0, 12, 24, 36, 48]);
  });

  it('never exceeds five labels and always reaches the max', () => {
    for (let max = 0.1; max <= 300; max += 0.7) {
      const ticks = niceHourTicks(max);
      expect(ticks.length).toBeLessThanOrEqual(5);
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(max);
    }
  });
});
