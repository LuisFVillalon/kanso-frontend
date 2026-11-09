import { useEffect, useState } from 'react';
import { fetchMoodCheckins } from '@/app/lib/backend-api';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import { onMoodCheckin } from '@/app/utils/moodCheckinSync';

type DayMoods = ReadonlyMap<string, number>;

interface Loaded {
  start: string;
  moods: DayMoods;
}

const NO_MOODS: DayMoods = new Map();

/**
 * The mood of each day in a month that has a daily check-in, by local day
 * ("YYYY-MM-DD"), kept current with saves made anywhere in the app
 * (utils/moodCheckinSync.ts). Empty until loaded; holds only later saves if it
 * can't load. While not `enabled`, stays empty and loads nothing.
 */
export function useMonthMoods(year: number, month: number, enabled: boolean): DayMoods {
  const start = toLocalDateStr(new Date(year, month, 1));
  const end = toLocalDateStr(new Date(year, month + 1, 0));
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // Saves since this month began loading: newer than anything the fetch returns.
    const changes = new Map<string, number | null>();
    const withChanges = (moods: Iterable<readonly [string, number]>): DayMoods => {
      const next = new Map(moods);
      changes.forEach((mood, day) => {
        if (mood === null) next.delete(day);
        else next.set(day, mood);
      });
      return next;
    };

    fetchMoodCheckins(start, end, ['day'])
      .then(rows => {
        if (cancelled) return;
        const days = rows.filter(r => r.period_kind === 'day').map(r => [r.period_start, r.mood] as const);
        setLoaded({ start, moods: withChanges(days) });
      })
      .catch(err => {
        console.error('[useMonthMoods] Failed to fetch mood check-ins:', err);
        if (!cancelled) setLoaded({ start, moods: withChanges([]) });
      });

    const unsubscribe = onMoodCheckin(({ kind, start: day, row }) => {
      if (kind !== 'day' || day < start || day > end) return;
      changes.set(day, row ? row.mood : null);
      setLoaded(prev => (prev?.start === start ? { start, moods: withChanges(prev.moods) } : prev));
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [start, end, enabled]);

  return enabled && loaded?.start === start ? loaded.moods : NO_MOODS;
}
