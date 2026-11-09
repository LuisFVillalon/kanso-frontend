import type { EventOccurrence } from '@/app/types/event';
import type { Tag } from '@/app/types/task';

/** An event imported from Google Calendar: shown and counted like any other, but only its kanso tags can change. */
export const isImportedEvent = (o: Pick<EventOccurrence, 'source'>): boolean => o.source === 'google';

/** The event's page in Google Calendar, or null without a usable https link. */
export function googleEventLink(o: Pick<EventOccurrence, 'html_link'>): string | null {
  return o.html_link && /^https:\/\//i.test(o.html_link) ? o.html_link : null;
}

/** The set of tags an occurrence has, to tell when a refetch has changed them. */
export const tagSignature = (tags: Pick<Tag, 'id'>[]): string => tags.map(t => t.id).sort((a, b) => a - b).join(',');
