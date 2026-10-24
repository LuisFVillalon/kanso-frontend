import type { CalendarEvent, EventOccurrence } from '@/app/types/event';
import { formatTime12Hour } from '@/app/utils/taskUtils';
import { parseLocalDate } from '@/app/utils/dateUtils';
import { repeatText } from '@/app/utils/events';

const DAY_MINUTES = 24 * 60;

/** Minutes since midnight of a "HH:MM[:SS]" time. */
export const timeToMinutes = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

/**
 * The part of a timed occurrence that falls on `dateStr`, in minutes since
 * that day's midnight. An event past midnight is split: its first day runs to
 * midnight (1440) and the next day starts at 0. Null for an all-day event or a
 * day it doesn't touch.
 */
export function occurrenceSpanOn(o: EventOccurrence, dateStr: string): { start: number; end: number } | null {
  if (o.all_day || o.start_time == null || o.end_time == null) return null;
  if (dateStr < o.date || dateStr > o.end_date) return null;
  const start = dateStr === o.date ? timeToMinutes(o.start_time) : 0;
  const end = dateStr === o.end_date ? timeToMinutes(o.end_time) : DAY_MINUTES;
  return end > start ? { start, end } : null;
}

/** Minutes of a timed occurrence on `dateStr`; 0 for an all-day event. */
export const occurrenceMinutesOn = (o: EventOccurrence, dateStr: string): number => {
  const span = occurrenceSpanOn(o, dateStr);
  return span ? span.end - span.start : 0;
};

/**
 * The occurrences that start on `dateStr`. The daily brief shows only these,
 * leaving out last night's event that runs past midnight into the day.
 */
export const occurrencesStartingOn = (occurrences: EventOccurrence[] | undefined, dateStr: string): EventOccurrence[] =>
  (occurrences ?? []).filter(o => o.date === dateStr);

/** The occurrence's whole length in minutes; 0 for an all-day event. */
export const occurrenceMinutes = (o: EventOccurrence): number =>
  o.all_day ? 0 : Math.max(0, (new Date(o.ends_at).getTime() - new Date(o.starts_at).getTime()) / 60000);

/**
 * The local days an occurrence shows on: its own day, plus the next one for
 * an event that runs past midnight (unless it ends right at midnight).
 */
export function occurrenceDays(o: EventOccurrence): string[] {
  if (o.end_date <= o.date || o.all_day) return [o.date];
  return occurrenceSpanOn(o, o.end_date) ? [o.date, o.end_date] : [o.date];
}

/** Groups occurrences by the local days they show on (see occurrenceDays), each day in start order. */
export function occurrencesByDay(occurrences: EventOccurrence[]): Map<string, EventOccurrence[]> {
  const map = new Map<string, EventOccurrence[]>();
  for (const o of occurrences) {
    for (const day of occurrenceDays(o)) {
      const list = map.get(day);
      if (list) list.push(o);
      else map.set(day, [o]);
    }
  }
  return map;
}

/** A stable key for one occurrence. */
export const occurrenceKey = (o: Pick<EventOccurrence, 'event_id' | 'occurrence_date'>) => `${o.event_id}:${o.occurrence_date}`;

/**
 * "10:00 – 10:50 AM", "11:30 AM – 1:00 PM", or "All day". One that runs past
 * midnight reads as it does on its first day: "10:00 PM – 1:00 AM".
 */
export function formatEventTime(o: Pick<EventOccurrence, 'all_day' | 'start_time' | 'end_time'>): string {
  if (o.all_day || o.start_time == null || o.end_time == null) return 'All day';
  const start = formatTime12Hour(o.start_time);
  const end = formatTime12Hour(o.end_time);
  const sameHalf = start.slice(-2) === end.slice(-2);
  return `${sameHalf ? start.slice(0, -3) : start} – ${end}`;
}

/** "10 AM" or "10:30 AM": a time with no ":00" for whole hours. */
export const formatClock = (time: string) => formatTime12Hour(time).replace(':00 ', ' ');

/** How a series repeats, in words ("Weekly on Mon, Wed and Fri"), or the one day of a one-off. */
export function describeRepeat(e: Pick<CalendarEvent, 'repeat_days' | 'repeat_interval' | 'start_date'>): string {
  return repeatText(e)
    ?? parseLocalDate(e.start_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

/** "4h 40m", "50m" or "0m" for a number of minutes. */
export function formatEventMinutes(minutes: number): string {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Whether two spans in minutes overlap (touching ends don't). */
export const spansOverlap = (a: { start: number; end: number }, b: { start: number; end: number }) =>
  a.start < b.end && b.start < a.end;
