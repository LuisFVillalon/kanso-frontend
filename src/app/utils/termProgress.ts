import { isWeekday, isWeekend } from './dateUtils';

/**
 * Term Tracker math. A term runs from its start date through its end date,
 * both inclusive, so every figure below agrees: on any in-term day,
 * `daysInto + daysRemaining === totalDays` (today counts as remaining, not
 * completed), and `weeksRemaining` counts the current week through the
 * last, matching "Week {weekNumber} of {totalWeeks}".
 */
export interface TermProgress {
  totalDays: number;
  daysInto: number;
  daysRemaining: number;
  weekNumber: number;
  totalWeeks: number;
  weeksRemaining: number;
  pct: number;
  businessDaysRemaining: number;
  weekendDaysRemaining: number;
}

const MS_DAY = 24 * 60 * 60 * 1000;

// Whole calendar days from `from` to `to`, read from their local Y/M/D
// fields via UTC so a DST change in between (a 23h or 25h day) never
// shifts the count by one.
const calendarDaysBetween = (from: Date, to: Date): number =>
  Math.round(
    (Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) -
      Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / MS_DAY,
  );

// Inclusive count of calendar days between `from` and `to` (dates only, time
// ignored) whose day-of-week matches `predicate`.
const countDaysMatching = (from: Date, to: Date, predicate: (dayOfWeek: number) => boolean): number => {
  let count = 0;
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const endTime = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  while (cursor.getTime() <= endTime) {
    if (predicate(cursor.getDay())) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
};

/** True when `today`'s calendar date falls within [start, end], inclusive. */
export const isInTerm = (start: Date, end: Date, today: Date): boolean =>
  calendarDaysBetween(start, today) >= 0 && calendarDaysBetween(today, end) >= 0;

/**
 * Progress through the term for `today`, or null when today is outside
 * [start, end]. Only the calendar date of each argument is used.
 */
export const computeTermProgress = (start: Date, end: Date, today: Date): TermProgress | null => {
  if (!isInTerm(start, end, today)) return null;

  const totalDays = calendarDaysBetween(start, end) + 1;
  const daysInto = calendarDaysBetween(start, today);
  const daysRemaining = totalDays - daysInto;
  const totalWeeks = Math.ceil(totalDays / 7);
  const weekNumber = Math.floor(daysInto / 7) + 1;
  const weeksRemaining = totalWeeks - weekNumber + 1;
  // Floor, not round, so the ring never reads 100% while a day is still left.
  const pct = Math.floor((daysInto / totalDays) * 100);
  const businessDaysRemaining = countDaysMatching(today, end, isWeekday);
  const weekendDaysRemaining = countDaysMatching(today, end, isWeekend);

  return { totalDays, daysInto, daysRemaining, weekNumber, totalWeeks, weeksRemaining, pct, businessDaysRemaining, weekendDaysRemaining };
};

/**
 * The instant the term ends: local midnight at the close of its end date
 * (i.e. the start of the following day), since the end date is itself a
 * full day of the term.
 */
export const termEndInstant = (end: Date): Date =>
  new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
