export interface CalendarSettings {
  id: number;
  title: string;
  start_date: string;
  end_date: string;
}

/** A term the user archived: it keeps showing on the month calendars after a new term replaces it. */
export interface ArchivedTerm {
  id: number;
  title: string;
  start_date: string;
  end_date: string;
  archived_at: string;
}

/** A term period drawn on the month calendars: the current term, or an archived one. */
export interface TermPeriod {
  title: string;
  start_date: string;
  end_date: string;
  archived: boolean;
}

/** A term's name and dates, without an id: the queued next term, or an ended one waiting to be archived. */
export interface TermDates {
  title: string;
  start_date: string;
  end_date: string;
}

/**
 * What happens when the current term ends. `next_term` becomes the current
 * term once the current one has ended; `auto_archive` archives the ended term
 * then. An ended term that was replaced without being archived waits in
 * `ended_term` until the user archives or drops it.
 */
export interface TermRollover {
  auto_archive: boolean;
  next_term: TermDates | null;
  ended_term: TermDates | null;
}
