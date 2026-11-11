import type { EventOccurrence } from '@/app/types/event';
import type { Tag } from '@/app/types/task';

/**
 * An event imported from Google Calendar: shown, counted and changed like any
 * other, except that the changes stay in kanso and Google Calendar keeps its own.
 */
export const isImportedEvent = (o: Pick<EventOccurrence, 'source'>): boolean => o.source === 'google';

/** An event id that names an imported Google event: those are negative. */
export const isImportedEventId = (id: number): boolean => id < 0;

/**
 * Whether the occurrence is one of several, so a change asks which ones it
 * applies to: a kanso event by its repeat days, an imported one by `repeating`.
 */
export const repeatsOccurrence = (o: Pick<EventOccurrence, 'source' | 'repeat_days' | 'repeating'>): boolean =>
  isImportedEvent(o) ? !!o.repeating : o.repeat_days.length > 0;

/** What an imported event's card and form say about where its changes go. */
export const IMPORTED_EDIT_NOTE = 'Changes stay in kanso. Google Calendar isn\u2019t changed.';

/** The event's page in Google Calendar, or null without a usable https link. */
export function googleEventLink(o: Pick<EventOccurrence, 'html_link'>): string | null {
  return o.html_link && /^https:\/\//i.test(o.html_link) ? o.html_link : null;
}

/** The set of tags an occurrence has, to tell when a refetch has changed them. */
export const tagSignature = (tags: Pick<Tag, 'id'>[]): string => tags.map(t => t.id).sort((a, b) => a - b).join(',');
