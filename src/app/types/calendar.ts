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
