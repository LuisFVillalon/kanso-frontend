/** The Activity card's tabs. */
export type ActivityMetric = 'completions' | 'notes' | 'events';

// Steps the y axis can count in: whole numbers of things done, or round
// stretches of time (in seconds) for note and event time — up to 100h, for a
// year's months of events.
const COUNT_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
const TIME_STEPS = [5, 10, 15, 30, 60, 120, 180, 300, 600, 1200, 1500, 1800, 3000, 6000].map(m => m * 60);
const MAX_GRIDLINES = 4;

/** The y axis ticks from 0 up to a round number at or above `max`, at most MAX_GRIDLINES above 0. Time is in seconds. */
export const axisTicks = (max: number, metric: ActivityMetric): number[] => {
  const steps = metric === 'completions' ? COUNT_STEPS : TIME_STEPS;
  const step = steps.find(st => Math.ceil(max / st) <= MAX_GRIDLINES) ?? Math.ceil(max / MAX_GRIDLINES);
  const top = Math.max(Math.ceil(max / step), 1);
  return Array.from({ length: top + 1 }, (_, i) => i * step);
};
