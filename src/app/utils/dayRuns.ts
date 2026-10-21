/**
 * Work-day / day-off runs for the Timers card, driven by the user's rest
 * days (JS `Date#getDay()` indices, 0 = Sunday … 6 = Saturday). A "run" is
 * a stretch of consecutive calendar days of one kind; runs may wrap the
 * week (e.g. rest days Fri/Sat/Sun/Mon form one 4-day run).
 */
export type DayKind = 'work' | 'off';

export type DayRunState =
  /** Today is this kind; the run ends at local midnight `end`. */
  | { status: 'active'; end: Date }
  /** Today is the other kind; the next run of this kind starts at `start` and lasts `lengthDays`. */
  | { status: 'upcoming'; start: Date; lengthDays: number }
  /** Every day of the week is this kind, so the run never ends. */
  | { status: 'everyDay' }
  /** No day of the week is this kind. */
  | { status: 'never' };

const addDays = (base: Date, n: number): Date =>
  new Date(base.getFullYear(), base.getMonth(), base.getDate() + n);

/** The current-or-next run of `kind` as of `now`, given the user's rest days. */
export const computeDayRun = (now: Date, restDays: number[], kind: DayKind): DayRunState => {
  const rest = new Set(restDays);
  const matches = (date: Date) => rest.has(date.getDay()) === (kind === 'off');

  const matchingWeekdays = [0, 1, 2, 3, 4, 5, 6].filter(dow => rest.has(dow) === (kind === 'off')).length;
  if (matchingWeekdays === 0) return { status: 'never' };
  if (matchingWeekdays === 7) return { status: 'everyDay' };

  const today = addDays(now, 0);
  // Length of the run starting at `from` — at most 6 days, since at least
  // one day of the week is the other kind.
  const runLength = (from: Date) => {
    let n = 0;
    while (matches(addDays(from, n))) n++;
    return n;
  };

  if (matches(today)) return { status: 'active', end: addDays(today, runLength(today)) };

  let offset = 1;
  while (!matches(addDays(today, offset))) offset++;
  const start = addDays(today, offset);
  return { status: 'upcoming', start, lengthDays: runLength(start) };
};
