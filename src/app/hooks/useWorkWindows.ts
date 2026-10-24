import { useCallback } from 'react';
import { useAppShell } from '@/app/context/AppShellContext';
import { DEFAULT_DAY_END, DEFAULT_DAY_START } from '@/app/lib/restDays';
import { parseTimeToMinutes, type WindowMinutes } from '@/app/utils/weekLayout';
import { toLocalDateStr } from '@/app/utils/dateUtils';

const toMinutesOr = (time: string, fallback: string): number =>
  parseTimeToMinutes(time) ?? parseTimeToMinutes(fallback)!;

/**
 * The profile's working days and hours, read from the app shell so they
 * follow changes there straight away, plus the current term (for "repeat until
 * the end of term"; the placeholder settings row, id 0, doesn't count).
 */
export function useWorkWindows(today: Date) {
  const shell = useAppShell();
  const { dayStartTime, shutoffTime, restDays, dayWindows } = shell.profileState.profile;
  const dayStartMinutes = toMinutesOr(dayStartTime, DEFAULT_DAY_START);
  const dayEndMinutes = toMinutesOr(shutoffTime, DEFAULT_DAY_END);
  const windowOn = useCallback((weekday: number): WindowMinutes => {
    const own = dayWindows?.[String(weekday)];
    return own
      ? [toMinutesOr(own.start, DEFAULT_DAY_START), toMinutesOr(own.end, DEFAULT_DAY_END)]
      : [dayStartMinutes, dayEndMinutes];
  }, [dayWindows, dayStartMinutes, dayEndMinutes]);
  const settings = shell.calendarSettingsState?.calendarSettings;
  const term = settings?.id && settings.end_date && settings.end_date >= toLocalDateStr(today)
    ? { title: settings.title, endDate: settings.end_date }
    : null;
  return { restDays, windowOn, dayStartMinutes, term };
}

export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
