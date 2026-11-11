import { useContext } from 'react';
import { AppShellContext } from '@/app/context/AppShellContext';
import { workDayOn, type WorkWindow } from '@/app/utils/dayReport';

/**
 * The user's work day on `date` (Settings → Work day and rest): whether it's
 * a rest day, and its work window if not. Null outside the app shell.
 */
export function useWorkDay(date: Date): { rest: boolean; window: WorkWindow | null } | null {
  const profile = useContext(AppShellContext)?.profileState.profile;
  if (!profile) return null;
  return workDayOn(profile, date);
}
