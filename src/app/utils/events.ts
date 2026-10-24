/**
 * Pure helpers behind events: how a repeat reads in words, the event form's
 * values and live summary and warnings, and turning the form into the API's
 * create and update bodies.
 */
import type { CalendarEvent, CalendarEventCreate, CalendarEventUpdate, EditScope, EventOccurrence } from '@/app/types/event';
import type { Tag } from '@/app/types/task';
import { parseLocalDate, toLocalDateStr } from './dateUtils';
import {
  addDays, formatMinutes, MINUTES_PER_DAY, minutesToTimeStr, parseTimeToMinutes, startOfWeek, type WindowMinutes,
} from './weekLayout';

/** An event without a tag: the warm gray the app uses for icons and dividers. */
export const EVENT_FALLBACK_COLOR = 'var(--tm-pencil)';

/** An event's color: its first tag's, like a calendar's color in Google Calendar. */
export const eventColor = (tags: Pick<Tag, 'color'>[]): string => tags[0]?.color || EVENT_FALLBACK_COLOR;

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** The day chips' letters, Sunday first like the week view. */
export const WEEKDAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** The furthest apart a repeat can be, in weeks (the API's limit). */
export const REPEAT_INTERVAL_MAX = 52;

/** "Mon", "Mon and Wed", "Mon, Wed and Fri". */
export const listJoin = (items: string[]): string =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

const sortedDays = (days: number[]) => [...new Set(days)].sort((a, b) => a - b);

/** "Mon, Wed and Fri", or "weekdays" / "every day" for the common sets. */
const daysText = (days: number[]): string => {
  const sorted = sortedDays(days);
  if (sorted.length === 7) return 'every day';
  if (sorted.join() === '1,2,3,4,5') return 'weekdays';
  return listJoin(sorted.map(d => WEEKDAY_SHORT[d]));
};

/** "Weekly on Mon, Wed and Fri" / "Every 2 weeks on Tue"; null for a one-off event. */
export function repeatText({ repeat_days, repeat_interval }: Pick<CalendarEvent, 'repeat_days' | 'repeat_interval'>): string | null {
  if (repeat_days.length === 0) return null;
  const days = daysText(repeat_days);
  if (repeat_interval <= 1) return days === 'every day' ? 'Every day' : `Weekly on ${days}`;
  return `Every ${repeat_interval} weeks on ${days}`;
}

/** "9:00 – 10:15 AM"-style range for minutes from midnight, saying when it runs into the next day. */
export function timeRangeText(startMin: number, endMin: number): string {
  const range = `${formatMinutes(startMin)} – ${formatMinutes(endMin % MINUTES_PER_DAY)}`;
  return endMin <= startMin ? `${range} the next day` : range;
}

/** The days a weekly rule lands on from `start` through `end` (inclusive "YYYY-MM-DD"), at most `limit`. */
export function repeatDates(
  { start, end, days, interval }: { start: string; end: string; days: number[]; interval: number },
  limit = 1000,
): string[] {
  const out: string[] = [];
  const first = parseLocalDate(start);
  const last = parseLocalDate(end);
  const firstWeek = startOfWeek(first).getTime();
  const step = Math.max(1, interval);
  for (let d = first; d <= last && out.length < limit; d = addDays(d, 1)) {
    if (!days.includes(d.getDay())) continue;
    // Weeks run Sunday to Saturday, counted from the week of the first day.
    const week = Math.round((startOfWeek(d).getTime() - firstWeek) / (7 * 86_400_000));
    if (week % step === 0) out.push(toLocalDateStr(d));
  }
  return out;
}

// ── The event form ────────────────────────────────────────────────────────────

/** How often the form's event repeats: not at all, every week, every other week, or every N weeks. */
export type RepeatChoice = 'none' | 'weekly' | 'biweekly' | 'custom';
/** When a repeating event stops: at the end of the current term, on a date, or never. */
export type RepeatEnd = 'term' | 'on' | 'never';

export interface EventFormValues {
  title: string;
  description: string;
  tags: Tag[];
  allDay: boolean;
  /** The day it happens on; for a new repeating event, the day it starts. */
  date: string;
  /** Editing a series: the day it first repeats on, which the summary counts from. */
  seriesStart?: string;
  /** "HH:MM"; an end before the start runs past midnight. */
  startTime: string;
  endTime: string;
  repeat: RepeatChoice;
  /** 0=Sun..6=Sat. */
  repeatDays: number[];
  /** Weeks between repeats, for 'custom'. */
  repeatInterval: number;
  endMode: RepeatEnd;
  /** The last day it can repeat on, for 'on'. */
  endDate: string;
  /** Minutes before to remind; null for no reminder. */
  reminderMinutes: number | null;
}

export const isRepeating = (form: Pick<EventFormValues, 'repeat'>) => form.repeat !== 'none';

/** The day the form's series first repeats on, which its end is judged against. */
export const formSeriesStart = (form: Pick<EventFormValues, 'date' | 'seriesStart'>) => form.seriesStart ?? form.date;

/** Weeks between repeats for the form's choice. */
export const formInterval = (form: Pick<EventFormValues, 'repeat' | 'repeatInterval'>): number =>
  form.repeat === 'biweekly' ? 2 : form.repeat === 'custom' ? Math.min(REPEAT_INTERVAL_MAX, Math.max(1, Math.round(form.repeatInterval) || 1)) : 1;

const repeatChoiceFor = (days: number[], interval: number): RepeatChoice =>
  days.length === 0 ? 'none' : interval <= 1 ? 'weekly' : interval === 2 ? 'biweekly' : 'custom';

const hhmm = (time: string | null | undefined) => (time ? time.slice(0, 5) : '');

/** A month after `date`, the "On a date" end a new series starts from when there's no term to end with. */
const monthAfter = (date: string) => {
  const d = parseLocalDate(date);
  return toLocalDateStr(new Date(d.getFullYear(), d.getMonth() + 1, d.getDate()));
};

/** The term end when the event can still end with it (it's on or after `date`), else null. */
export const usableTermEnd = (termEnd: string | null, date: string): string | null =>
  termEnd && termEnd >= date ? termEnd : null;

/** A new event's form: an hour from `startTime` on `date` unless given, repeating weekly on that day if `repeat`. */
export function blankEventForm(
  { date, startTime = '09:00', endTime, title = '', tags = [], repeat = false, termEnd = null }:
  { date: string; startTime?: string; endTime?: string; title?: string; tags?: Tag[]; repeat?: boolean; termEnd?: string | null },
): EventFormValues {
  const start = parseTimeToMinutes(startTime) ?? 9 * 60;
  const end = endTime ?? minutesToTimeStr(Math.min(MINUTES_PER_DAY - 1, start + 60));
  const termEndDate = usableTermEnd(termEnd, date);
  return {
    title, description: '', tags, allDay: false, date, startTime: minutesToTimeStr(start), endTime: end,
    repeat: repeat ? 'weekly' : 'none', repeatDays: [parseLocalDate(date).getDay()], repeatInterval: 3,
    endMode: termEndDate ? 'term' : 'never', endDate: termEndDate ?? monthAfter(date),
    reminderMinutes: null,
  };
}

/**
 * The form for editing `occurrence`: what it shows (its own title, times and
 * day, edits included) plus its series' repeat, end and reminder.
 */
export function eventFormFromOccurrence(occurrence: EventOccurrence, series: CalendarEvent, termEnd: string | null = null): EventFormValues {
  const repeat = repeatChoiceFor(series.repeat_days, series.repeat_interval);
  const endMode: RepeatEnd = series.end_date === null ? 'never' : termEnd && series.end_date === termEnd ? 'term' : 'on';
  return {
    title: occurrence.title,
    seriesStart: series.repeat_days.length ? series.start_date : undefined,
    description: occurrence.description ?? '',
    tags: occurrence.tags,
    allDay: occurrence.all_day,
    date: occurrence.date,
    startTime: hhmm(occurrence.start_time) || '09:00',
    endTime: hhmm(occurrence.end_time) || '10:00',
    repeat,
    repeatDays: series.repeat_days.length ? sortedDays(series.repeat_days) : [parseLocalDate(occurrence.date).getDay()],
    repeatInterval: repeat === 'custom' ? series.repeat_interval : 3,
    endMode,
    endDate: series.end_date ?? monthAfter(occurrence.date),
    reminderMinutes: series.reminder_minutes,
  };
}

/** The last day the form's series can repeat on, or null for no end (and for a one-off event). */
export function formEndDate(form: EventFormValues, termEnd: string | null): string | null {
  if (!isRepeating(form) || form.endMode === 'never') return null;
  const term = usableTermEnd(termEnd, formSeriesStart(form));
  if (form.endMode === 'term' && term) return term;
  return form.endDate || null;
}

/** The form as POST /create-event's body. */
export function eventFormToCreate(form: EventFormValues, timeZone: string, termEnd: string | null): CalendarEventCreate {
  const repeating = isRepeating(form);
  return {
    title: form.title.trim(),
    description: form.description.trim() || null,
    tags: form.tags.map(({ name, color }) => ({ name, color })),
    all_day: form.allDay,
    start_date: form.date,
    end_date: formEndDate(form, termEnd),
    start_time: form.allDay ? null : form.startTime,
    end_time: form.allDay ? null : form.endTime,
    time_zone: timeZone,
    repeat_days: repeating ? sortedDays(form.repeatDays) : [],
    repeat_interval: repeating ? formInterval(form) : 1,
    reminder_minutes: form.reminderMinutes,
  };
}

/** Problems that stop the form saving, as sentences; empty when it can save. */
export function eventFormErrors(form: EventFormValues, termEnd: string | null): string[] {
  const errors: string[] = [];
  if (!form.title.trim()) errors.push('Give the event a title.');
  if (!form.date) errors.push('Pick a date.');
  if (!form.allDay) {
    if (!form.startTime || !form.endTime) errors.push('Pick a start and end time, or make it all day.');
    else if (form.startTime === form.endTime) errors.push('The event has to end at a different time than it starts.');
  }
  if (isRepeating(form)) {
    if (form.repeatDays.length === 0) errors.push('Pick at least one day to repeat on.');
    const end = formEndDate(form, termEnd);
    if (form.endMode === 'on' && !form.endDate) errors.push('Pick the day it ends.');
    else if (end && form.date && end < formSeriesStart(form)) errors.push('The repeat ends before it starts.');
  }
  return errors;
}

/** The weekdays the form's event falls on. */
const formWeekdays = (form: EventFormValues): number[] =>
  isRepeating(form) ? sortedDays(form.repeatDays) : form.date ? [parseLocalDate(form.date).getDay()] : [];

/** "Every Mon, Wed and Fri · 5:00 – 6:00 PM · Oct 26 – Dec 11, 21 events", or the date and time of a one-off. */
export function eventFormSummary(form: EventFormValues, termEnd: string | null): string {
  if (!form.date) return '';
  const start = parseTimeToMinutes(form.startTime);
  const end = parseTimeToMinutes(form.endTime);
  const time = form.allDay ? 'All day' : start !== null && end !== null && start !== end ? timeRangeText(start, end) : '';
  const day = (d: string, withWeekday: boolean) => parseLocalDate(d).toLocaleDateString('en-US', {
    ...(withWeekday ? { weekday: 'short' as const } : {}), month: 'short', day: 'numeric',
  });
  if (!isRepeating(form)) return [day(form.date, true), time].filter(Boolean).join(' · ');
  const days = formWeekdays(form);
  if (days.length === 0) return '';
  const interval = formInterval(form);
  const which = daysText(days);
  const rule = interval > 1 ? `Every ${interval} weeks on ${which}` : which === 'every day' ? 'Every day' : `Every ${which}`;
  const endDate = formEndDate(form, termEnd);
  const first = formSeriesStart(form);
  let span: string;
  if (endDate && endDate >= first) {
    const count = repeatDates({ start: first, end: endDate, days, interval }).length;
    span = `${day(first, false)} – ${day(endDate, false)}, ${count} ${count === 1 ? 'event' : 'events'}`;
  } else {
    span = `from ${day(first, false)}, no end`;
  }
  return [rule, time, span].filter(Boolean).join(' · ');
}

interface WarningContext {
  restDays: number[];
  /** The work window on a weekday, 0=Sun..6=Sat. */
  windowOn: (weekday: number) => WindowMinutes;
  /** Occurrences on screen to check for overlaps, leaving out the event being edited. */
  others: EventOccurrence[];
}

/**
 * Things worth knowing that don't stop it saving: it falls on a rest day,
 * starts before the work window opens or runs past its close, or overlaps an
 * event on screen (on the same day, or for a repeating event the same weekdays).
 */
export function eventFormWarnings(form: EventFormValues, { restDays, windowOn, others }: WarningContext): string[] {
  const warnings: string[] = [];
  const weekdays = formWeekdays(form);
  const rest = weekdays.filter(d => restDays.includes(d));
  if (rest.length) {
    warnings.push(`${listJoin(rest.map(d => WEEKDAY_LONG[d]))} ${rest.length > 1 ? 'are rest days' : 'is a rest day'}.`);
  }
  if (form.allDay) return warnings;
  const start = parseTimeToMinutes(form.startTime);
  const end = parseTimeToMinutes(form.endTime);
  if (start === null || end === null || start === end) return warnings;
  const endOnDay = end < start ? MINUTES_PER_DAY + end : end;

  const workdays = weekdays.filter(d => !restDays.includes(d));
  const opensLate = workdays.map(windowOn).find(([open]) => start < open);
  if (opensLate) warnings.push(`Starts before your day opens (${formatMinutes(opensLate[0])}).`);
  const closesEarly = workdays.map(windowOn).find(([open, close]) => close > open && endOnDay > close);
  if (closesEarly) warnings.push(`Runs past your day's close (${formatMinutes(closesEarly[1])}).`);

  const clashes = new Map<string, Set<number>>();
  for (const o of others) {
    if (o.archived || o.all_day || !o.start_time || !o.end_time) continue;
    const day = parseLocalDate(o.date).getDay();
    if (isRepeating(form) ? !weekdays.includes(day) : o.date !== form.date) continue;
    const oStart = parseTimeToMinutes(o.start_time)!;
    const oEndRaw = parseTimeToMinutes(o.end_time)!;
    const oEnd = o.end_date > o.date ? MINUTES_PER_DAY + oEndRaw : oEndRaw;
    if (start < oEnd && oStart < endOnDay) {
      const set = clashes.get(o.title) ?? new Set<number>();
      set.add(day);
      clashes.set(o.title, set);
    }
  }
  for (const [title, days] of clashes) {
    const on = isRepeating(form) ? ` on ${listJoin(sortedDays([...days]).map(d => `${WEEKDAY_SHORT[d]}s`))}` : '';
    warnings.push(`Overlaps ${title}${on}.`);
  }
  return warnings;
}

// ── Saving an edit ────────────────────────────────────────────────────────────

/** What an edit changed, split by what each scope may send. */
export interface EventEdit {
  /** Changes to the occurrence's own fields (title, description, tags, all day, times), as sent for any scope. */
  occurrence: CalendarEventUpdate;
  /** The day it moved to, if it moved. */
  date: string | null;
  /** Changes to the series' fields (repeat, end, reminder). */
  series: CalendarEventUpdate;
  /** The event was repeating and is now a one-off, or the other way round. */
  repeatToggled: boolean;
}

const OCCURRENCE_KEYS = ['title', 'description', 'tags', 'all_day', 'start_time', 'end_time'] as const;
const SERIES_KEYS = ['end_date', 'repeat_days', 'repeat_interval', 'reminder_minutes'] as const;

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** What changed from `initial` to `next` (see EventEdit). */
export function eventFormEdit(initial: EventFormValues, next: EventFormValues, termEnd: string | null): EventEdit {
  const before = eventFormToCreate(initial, '', termEnd);
  const after = eventFormToCreate(next, '', termEnd);
  const occurrence: CalendarEventUpdate = {};
  const series: CalendarEventUpdate = {};
  for (const key of OCCURRENCE_KEYS) {
    if (!sameValue(before[key], after[key])) Object.assign(occurrence, { [key]: after[key] });
  }
  for (const key of SERIES_KEYS) {
    if (!sameValue(before[key], after[key])) Object.assign(series, { [key]: after[key] });
  }
  return {
    occurrence,
    date: next.date !== initial.date ? next.date : null,
    series,
    repeatToggled: isRepeating(initial) !== isRepeating(next),
  };
}

export const editIsEmpty = (edit: EventEdit) =>
  Object.keys(edit.occurrence).length === 0 && Object.keys(edit.series).length === 0 && edit.date === null;

/**
 * The scopes an edit of a repeating event can be saved with. A new date moves
 * one occurrence, so it allows only "this"; a change to the repeat, end or
 * reminder belongs to a run of the series, so it rules "this" out.
 */
export function allowedEditScopes(edit: EventEdit): EditScope[] {
  const seriesChanged = Object.keys(edit.series).length > 0 || edit.repeatToggled;
  if (edit.date !== null) return seriesChanged ? [] : ['this'];
  return seriesChanged ? ['following', 'all'] : ['this', 'following', 'all'];
}

/**
 * The body PUT /update-event sends for `edit` with `scope`. `wasRepeating`
 * says whether the event repeated before: a one-off moves with `date`, and
 * one that starts or stops repeating with "all" restarts on the form's day.
 */
export function editBody(edit: EventEdit, scope: EditScope, wasRepeating: boolean, form: EventFormValues): CalendarEventUpdate {
  if (scope === 'this') return { ...edit.occurrence, ...(edit.date ? { date: edit.date } : {}) };
  const body: CalendarEventUpdate = { ...edit.occurrence, ...edit.series };
  if (!wasRepeating) {
    // A one-off event: a new date moves it; starting to repeat starts there.
    if (edit.repeatToggled) body.start_date = form.date;
    else if (edit.date) body.date = edit.date;
  } else if (edit.repeatToggled && scope === 'all') {
    // A series becoming a one-off lands on the day the form shows.
    body.start_date = form.date;
  }
  return body;
}
