import { formatDuration } from './duration';

// Habits are daily: streaks count consecutive days logged, and a habit's
// `estimated_time` is the hours planned for it each day.

/** Reads a habit's daily time goal as a sentence, or null when none is set. */
export function formatHabitGoal(hours: number | null | undefined): string | null {
  if (hours == null || !(hours > 0)) return null;
  return `Goal: ${formatDuration(hours)} per day`;
}

const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

export function currentStreakLabel(n: number): string {
  return `${n}-day streak`;
}

export function bestStreakLabel(n: number): string {
  return `Best: ${days(n)}`;
}

export const CURRENT_STREAK_HINT = 'Current streak: days in a row you have logged this habit';
export const BEST_STREAK_HINT = 'Best streak: the longest run of days in a row you have logged this habit';
