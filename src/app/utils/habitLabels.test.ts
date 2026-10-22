import { describe, expect, it } from 'vitest';
import { bestStreakLabel, currentStreakLabel, formatHabitGoal } from './habitLabels';

describe('formatHabitGoal', () => {
  it('reads the daily time goal as a sentence', () => {
    expect(formatHabitGoal(0.5)).toBe('Goal: 30 min per day');
    expect(formatHabitGoal(1)).toBe('Goal: 1 hr per day');
    expect(formatHabitGoal(1.5)).toBe('Goal: 1.5 hrs per day');
  });

  it('returns null when no goal is set', () => {
    expect(formatHabitGoal(null)).toBeNull();
    expect(formatHabitGoal(undefined)).toBeNull();
    expect(formatHabitGoal(0)).toBeNull();
  });
});

describe('streak labels', () => {
  it('labels the current streak in days', () => {
    expect(currentStreakLabel(5)).toBe('5-day streak');
    expect(currentStreakLabel(0)).toBe('0-day streak');
  });

  it('labels the best streak with singular and plural days', () => {
    expect(bestStreakLabel(1)).toBe('Best: 1 day');
    expect(bestStreakLabel(12)).toBe('Best: 12 days');
  });
});
