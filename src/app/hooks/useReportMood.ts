import { useCallback, useEffect, useState } from 'react';
import { fetchMoodCheckins } from '@/app/lib/backend-api';
import type { MoodCheckin, MoodPeriodKind } from '@/app/types/mood';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import type { ReportPeriod } from '@/app/utils/calendarReport';
import { moodFetchRanges } from '@/app/utils/moodReport';

interface Fetched {
  key: string;
  checkins: MoodCheckin[];
}

/**
 * Loads the mood check-ins a report period needs — daily, weekly and
 * monthly — whose first day falls in moodFetchRanges (the period before it
 * too, which the Mood over time summary compares with). Saving or
 * deleting a check-in from the report patches the loaded list in place.
 */
export function useReportMood(period: ReportPeriod) {
  const key = moodFetchRanges(period)
    .map(r => `${toLocalDateStr(r.start)}:${toLocalDateStr(r.end)}`)
    .join(',');

  const [fetched, setFetched] = useState<Fetched | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all(key.split(',').map(range => {
      const [startStr, endStr] = range.split(':');
      return fetchMoodCheckins(startStr, endStr);
    }))
      .then(parts => {
        if (!cancelled) setFetched({ key, checkins: parts.flat() });
      })
      .catch(err => {
        console.error('[useReportMood] Failed to fetch mood check-ins:', err);
        if (!cancelled) setError({ key, message: 'Couldn’t load your mood check-ins.' });
      });
    return () => {
      cancelled = true;
      setError(null);
    };
  }, [key, attempt]);

  const ready = fetched?.key === key ? fetched.checkins : null;
  const failed = !ready && error?.key === key ? error.message : null;

  /**
   * Puts a saved check-in in place of its period's old one, or removes the
   * period's check-in (`saved` null). A week shares its Monday with that
   * day's check-in, so the kind is part of the key.
   */
  const replaceDay = useCallback((date: string, saved: MoodCheckin | null, kind: MoodPeriodKind = 'day') => {
    setFetched(prev => {
      if (!prev) return prev;
      const rest = prev.checkins.filter(c => c.period_kind !== kind || c.period_start !== date);
      return { ...prev, checkins: saved ? [...rest, saved] : rest };
    });
  }, []);

  const retry = useCallback(() => setAttempt(a => a + 1), []);

  return {
    checkins: ready,
    loading: !ready && !failed,
    error: failed,
    retry,
    replaceDay,
  };
}
