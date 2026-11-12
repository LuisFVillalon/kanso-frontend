/**
 * Words for suggested work times: "Today", "5:00 – 6:00 PM", "1 hr 30 min".
 */
import { parseLocalDate } from './dateUtils';
import { addDaysStr } from './slotSuggest';

/** Minutes from midnight as "5:00 PM" ("12:00 AM" past midnight). */
export function clock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const d = new Date(2000, 0, 1, Math.floor(m / 60), m % 60);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** "5:00 – 6:00 PM", or "11:30 AM – 12:30 PM" across noon. */
export function timeRange(start: number, end: number): string {
  const a = clock(start);
  const b = clock(end);
  const [aTime, aMer] = a.split(' ');
  const [, bMer] = b.split(' ');
  return aMer === bMer ? `${aTime} – ${b}` : `${a} – ${b}`;
}

/** "Today", "Tomorrow", or "Fri, Nov 13". */
export function dayName(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addDaysStr(today, 1)) return 'Tomorrow';
  return parseLocalDate(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "Today", "Tomorrow", or "Fri": a slot pill's short day. */
export function dayShort(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addDaysStr(today, 1)) return 'Tomorrow';
  return parseLocalDate(date).toLocaleDateString('en-US', { weekday: 'short' });
}

/** "30 min", "1 hr", "2 hr 30 min". */
export function lengthText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/** Minutes → "HH:MM", as the API takes times; the end of the day is "23:59". */
export const hhmm = (minutes: number): string =>
  minutes >= 1440 ? '23:59' : `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** "30m", "1h", "1h 30m": a day chip's free time. */
export function shortLength(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** "Friday, Nov 13": a day spelled out for screen readers. */
export const dayLong = (date: string): string =>
  parseLocalDate(date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

/** "Thu 12": a day chip's label. */
export const dayChip = (date: string, today: string): string => {
  if (date === today) return 'Today';
  const d = parseLocalDate(date);
  return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getDate()}`;
};

/** "today", "tomorrow", or "Fri, Nov 13", to go after "on" or stand alone in a sentence. */
export const dayInSentence = (date: string, today: string): string => {
  const name = dayName(date, today);
  return date === today || date === addDaysStr(today, 1) ? name.toLowerCase() : `on ${name}`;
};
