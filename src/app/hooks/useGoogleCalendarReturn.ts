import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import type { IntegrationNoticeValue } from '@/app/components/settings/IntegrationParts';
import { useToast } from '@/app/context/ToastContext';
import { notifyEventsChanged } from '@/app/hooks/useEventsVersion';
import { ApiError, completeGoogleCalendar } from '@/app/lib/backend-api';

/** The query value Google's consent screen comes back with: "complete", or "error" for a failure. */
const RESULT_PARAM = 'google_calendar';

type GoogleCalendarReturn = { code: string; state: string } | 'failed';

// Outside React on purpose: the shell can remount before the session is known,
// and the address no longer holds this by then.
let pending: GoogleCalendarReturn | null = null;

const CONNECTED: IntegrationNoticeValue = { tone: 'success', text: 'Google Calendar connected. Your events will appear on your calendars shortly.' };
const FAILED: IntegrationNoticeValue = { tone: 'error', text: "Google Calendar didn't connect. Nothing was saved, so you can try again." };
const WRONG_ACCOUNT: IntegrationNoticeValue = {
  tone: 'error',
  text: 'A different kanso account started this connection, so nothing was saved. Connect again from the account you want to use.',
};

/**
 * Reads what Google's consent screen sent back and takes it out of the
 * address at once, so the one-time code doesn't linger in the address bar or
 * history. Null when the page didn't just come back from Google.
 */
function takeGoogleCalendarReturn(): GoogleCalendarReturn | null {
  const url = new URL(window.location.href);
  const result = url.searchParams.get(RESULT_PARAM);
  if (result === null) return null;
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  for (const param of [RESULT_PARAM, 'code', 'state']) url.searchParams.delete(param);
  window.history.replaceState(window.history.state, '', url);
  return result === 'complete' && code && state ? { code, state } : 'failed';
}

async function finishConnecting(result: GoogleCalendarReturn): Promise<IntegrationNoticeValue> {
  if (result === 'failed') return FAILED;
  try {
    await completeGoogleCalendar(result.code, result.state);
    notifyEventsChanged();
    return CONNECTED;
  } catch (err) {
    // Not logged: nothing about this request belongs in the console.
    return err instanceof ApiError && err.status === 403 ? WRONG_ACCOUNT : FAILED;
  }
}

/**
 * Finishes a Google Calendar connection when the page comes back from
 * Google's consent screen. The address is cleaned as the page first commits,
 * signed in or not; the code then goes to the server once, after the session
 * is known. Clearing `pending` before sending is what keeps a re-render,
 * remount or Strict Mode's repeated effect from sending it twice, and there's
 * no cleanup to cancel it, or that repeat would throw the answer away.
 *
 * `notice` says how it went, once it has; `clearNotice` drops it.
 * `connectionsFinished` counts the attempts that have ended, and isn't lowered
 * by clearing the notice.
 */
export function useGoogleCalendarReturn(signedIn: boolean) {
  const showToast = useToast();
  const [notice, setNotice] = useState<IntegrationNoticeValue | null>(null);
  const [connectionsFinished, setConnectionsFinished] = useState(0);

  useLayoutEffect(() => {
    const result = takeGoogleCalendarReturn();
    if (result) pending = result;
  }, []);

  useEffect(() => {
    const result = pending;
    if (!signedIn || !result) return;
    pending = null;
    const dismiss = result === 'failed' ? null : showToast('Finishing connecting Google Calendar…', 'info');
    void finishConnecting(result).then(next => {
      dismiss?.();
      setNotice(next);
      setConnectionsFinished(n => n + 1);
    });
  }, [signedIn, showToast]);

  const clearNotice = useCallback(() => setNotice(null), []);
  return { notice, connectionsFinished, clearNotice };
}
