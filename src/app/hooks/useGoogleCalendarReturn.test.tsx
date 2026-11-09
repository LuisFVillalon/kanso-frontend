// @vitest-environment jsdom
import React, { act, StrictMode } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const api = vi.hoisted(() => {
  class ApiError extends Error {
    constructor(readonly status: number, readonly detail: string) {
      super(detail);
    }
  }
  return { ApiError, completeGoogleCalendar: vi.fn() };
});
vi.mock('@/app/lib/backend-api', () => api);
const dismissToast = vi.hoisted(() => vi.fn());
const showToast = vi.hoisted(() => vi.fn());
vi.mock('@/app/context/ToastContext', () => ({ useToast: () => showToast }));
const notifyEventsChanged = vi.hoisted(() => vi.fn());
vi.mock('@/app/hooks/useEventsVersion', () => ({ notifyEventsChanged }));

import { useGoogleCalendarReturn } from './useGoogleCalendarReturn';

let container: HTMLDivElement;
let root: Root;
type Notice = ReturnType<typeof useGoogleCalendarReturn>['notice'];

function Probe({ signedIn }: { signedIn: boolean }) {
  const { notice, connectionsFinished } = useGoogleCalendarReturn(signedIn);
  return <output data-finished={connectionsFinished}>{JSON.stringify(notice)}</output>;
}

const shown = (): Notice => JSON.parse(container.querySelector('output')!.textContent || 'null');

const render = async (signedIn: boolean) => {
  await act(async () => { root.render(<StrictMode><Probe signedIn={signedIn} /></StrictMode>); });
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  api.completeGoogleCalendar.mockReset().mockResolvedValue({ configured: true, connected: true });
  notifyEventsChanged.mockReset();
  dismissToast.mockReset();
  showToast.mockReset().mockReturnValue(dismissToast);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

const complete = '/settings?google_calendar=complete&code=secret-code&state=secret-state';

describe('useGoogleCalendarReturn', () => {
  it('counts a connection attempt once it has ended, so the status can reload', async () => {
    window.history.replaceState(null, '', complete);
    await render(true);
    expect(container.querySelector('output')!.getAttribute('data-finished')).toBe('1');
  });

  it('does nothing on an ordinary page load', async () => {
    window.history.replaceState(null, '', '/settings?keep=1');
    await render(true);
    expect(api.completeGoogleCalendar).not.toHaveBeenCalled();
    expect(shown()).toBeNull();
    expect(window.location.search).toBe('?keep=1');
  });

  it('cleans the address at once, before there is a session, and sends nothing without one', async () => {
    window.history.replaceState(null, '', `${complete}&keep=1`);
    await render(false);
    expect(window.location.search).toBe('?keep=1');
    expect(api.completeGoogleCalendar).not.toHaveBeenCalled();
    expect(shown()).toBeNull();
    await render(true); // Hands the held return over, so it doesn't carry into the next test.
  });

  it('still sends the code when the shell remounts before the session is known', async () => {
    window.history.replaceState(null, '', complete);
    await render(false);
    act(() => root.unmount());
    root = createRoot(container);
    await render(true);
    expect(api.completeGoogleCalendar).toHaveBeenCalledTimes(1);
    expect(shown()?.tone).toBe('success');
  });

  it('says it is finishing while the server works', async () => {
    window.history.replaceState(null, '', complete);
    await render(true);
    expect(showToast).toHaveBeenCalledWith('Finishing connecting Google Calendar…', 'info');
  });

  it('sends the code once the session is known, once, through Strict Mode and re-renders', async () => {
    window.history.replaceState(null, '', complete);
    await render(false);
    await render(true);
    await render(true);
    expect(api.completeGoogleCalendar).toHaveBeenCalledTimes(1);
    expect(api.completeGoogleCalendar).toHaveBeenCalledWith('secret-code', 'secret-state');
  });

  it('sends it once when the session is already there on the first render', async () => {
    window.history.replaceState(null, '', complete);
    await render(true);
    expect(api.completeGoogleCalendar).toHaveBeenCalledTimes(1);
    expect(shown()?.tone).toBe('success');
  });

  it('reports success and reloads the calendars', async () => {
    window.history.replaceState(null, '', complete);
    await render(true);
    expect(shown()).toEqual(expect.objectContaining({ tone: 'success', text: expect.stringContaining('connected') }));
    expect(notifyEventsChanged).toHaveBeenCalledTimes(1);
    expect(dismissToast).toHaveBeenCalledTimes(1);
  });

  it('explains a 403 as a different kanso account', async () => {
    api.completeGoogleCalendar.mockRejectedValue(new api.ApiError(403, 'state mismatch'));
    window.history.replaceState(null, '', complete);
    await render(true);
    expect(shown()).toEqual(expect.objectContaining({ tone: 'error', text: expect.stringContaining('different kanso account') }));
    expect(notifyEventsChanged).not.toHaveBeenCalled();
  });

  it('says calmly when finishing fails, without the server detail', async () => {
    api.completeGoogleCalendar.mockRejectedValue(new api.ApiError(400, 'invalid_grant'));
    window.history.replaceState(null, '', complete);
    await render(true);
    expect(shown()?.tone).toBe('error');
    expect(shown()?.text).toContain("didn't connect");
    expect(shown()?.text).not.toContain('invalid_grant');
  });

  it('reports a failure from Google without calling the server', async () => {
    window.history.replaceState(null, '', '/settings?google_calendar=error');
    await render(true);
    expect(api.completeGoogleCalendar).not.toHaveBeenCalled();
    expect(shown()?.tone).toBe('error');
    expect(window.location.search).toBe('');
  });

  it('treats a return with no code as a failure and clears what came with it', async () => {
    window.history.replaceState(null, '', '/settings?google_calendar=complete&state=secret-state');
    await render(true);
    expect(api.completeGoogleCalendar).not.toHaveBeenCalled();
    expect(shown()?.tone).toBe('error');
    expect(window.location.search).toBe('');
  });

  it('never logs the code or state', async () => {
    const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map(level => vi.spyOn(console, level).mockImplementation(() => {}));
    api.completeGoogleCalendar.mockRejectedValue(new api.ApiError(400, 'bad'));
    window.history.replaceState(null, '', complete);
    await render(true);
    const logged = JSON.stringify(logs.flatMap(spy => spy.mock.calls));
    expect(logged).not.toContain('secret-code');
    expect(logged).not.toContain('secret-state');
  });
});
