import { useContext } from 'react';
import { AppShellContext } from '@/app/context/AppShellContext';
import { DEFAULT_DAY_END, DEFAULT_DAY_START, dayWindowOn, isValidDayWindow } from '@/app/lib/restDays';
import { workWindowFrom, type WorkWindow } from '@/app/utils/dayReport';

/**
 * The user's work day on `date` (Settings → Work day and rest): whether it's
 * a rest day, and its work window if not. Null outside the app shell.
 */
export function useWorkDay(date: Date): { rest: boolean; window: WorkWindow | null } | null {
  const profile = useContext(AppShellContext)?.profileState.profile;
  if (!profile) return null;
  const weekday = date.getDay();
  if (profile.restDays.includes(weekday)) return { rest: true, window: null };
  const own = dayWindowOn(weekday, profile.dayStartTime, profile.shutoffTime, profile.dayWindows);
  const { start, end } = isValidDayWindow(own) ? own : { start: DEFAULT_DAY_START, end: DEFAULT_DAY_END };
  return { rest: false, window: workWindowFrom(start, end) };
}
