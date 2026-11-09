import { useEffect, useState } from 'react';
import { fetchGoogleCalendarStatus } from '@/app/lib/backend-api';
import type { GoogleCalendarStatus } from '@/app/types/googleCalendar';

/**
 * The Google Calendar status, loaded each time Settings opens and again when
 * `connectionsFinished` goes up while it's open. Any failure
 * (a server that doesn't have these routes yet, or one refusing this account)
 * counts the same as Google Calendar not being set up, so Settings just
 * doesn't offer it. `settled` is true once the first answer is in.
 */
export function useGoogleCalendarStatus(active: boolean, connectionsFinished: number) {
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    fetchGoogleCalendarStatus().then(
      next => { if (!cancelled) { setStatus(next); setSettled(true); } },
      () => { if (!cancelled) { setStatus(null); setSettled(true); } },
    );
    return () => { cancelled = true; };
  }, [active, connectionsFinished]);

  return { status, settled, setStatus };
}
