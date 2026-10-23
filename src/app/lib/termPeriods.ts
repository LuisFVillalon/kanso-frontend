import type { ArchivedTerm, CalendarSettings, TermPeriod } from '@/app/types/calendar';
import { parseLocalDate } from '@/app/utils/dateUtils';

/**
 * The term periods the month calendars draw: every archived term, plus the
 * current term once the user has saved one (id 0 is the placeholder shown
 * before that). A term that was replaced without archiving is simply gone.
 */
export function calendarTermPeriods(current: CalendarSettings, archived: ArchivedTerm[]): TermPeriod[] {
  const periods: TermPeriod[] = archived.map(t => ({
    title: t.title, start_date: t.start_date, end_date: t.end_date, archived: true,
  }));
  if (current.id && current.start_date && current.end_date) {
    periods.push({ title: current.title, start_date: current.start_date, end_date: current.end_date, archived: false });
  }
  return periods;
}

/** The term covering `dateStr` ("YYYY-MM-DD"), preferring the current term where terms overlap. */
export function termOnDay(terms: TermPeriod[], dateStr: string): TermPeriod | undefined {
  let found: TermPeriod | undefined;
  for (const t of terms) {
    if (t.start_date > dateStr || t.end_date < dateStr) continue;
    if (!t.archived) return t;
    found ??= t;
  }
  return found;
}

/** The terms that cover at least one day between `startStr` and `endStr`, inclusive. */
export function termsInRange(terms: TermPeriod[], startStr: string, endStr: string): TermPeriod[] {
  return terms.filter(t => t.start_date <= endStr && t.end_date >= startStr);
}

/** The color a term's days are marked with: the accent for the current term, a muted tone for archived ones. */
export const termColor = (term: TermPeriod): string => (term.archived ? 'var(--tm-text-muted)' : 'var(--tm-accent)');

/** "Aug 24 – Dec 18, 2026", or with both years when the term spans two. */
export function formatTermRange(term: Pick<TermPeriod, 'start_date' | 'end_date'>): string {
  const start = parseLocalDate(term.start_date);
  const end = parseLocalDate(term.end_date);
  const short = { month: 'short', day: 'numeric' } as const;
  const sameYear = start.getFullYear() === end.getFullYear();
  const startText = start.toLocaleDateString('en-US', sameYear ? short : { ...short, year: 'numeric' });
  return `${startText} – ${end.toLocaleDateString('en-US', { ...short, year: 'numeric' })}`;
}
