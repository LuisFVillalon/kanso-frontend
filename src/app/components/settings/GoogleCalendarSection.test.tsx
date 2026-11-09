// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoogleCalendarEntry, GoogleCalendarStatus } from '@/app/types/googleCalendar';
import type { Tag } from '@/app/types/task';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const work: Tag = { id: 1, name: 'Work', color: '#2563eb' };
const school: Tag = { id: 2, name: 'School', color: '#16a34a' };

const api = vi.hoisted(() => ({
  connectGoogleCalendar: vi.fn(),
  disconnectGoogleCalendar: vi.fn(),
  fetchGoogleCalendars: vi.fn(),
  syncGoogleCalendar: vi.fn(),
  updateGoogleCalendar: vi.fn(),
  describeError: (_err: unknown, fallback: string) => fallback,
}));
vi.mock('@/app/lib/backend-api', () => api);
vi.mock('@/app/context/TagsContext', () => ({ useTagsContext: () => ({ tags: [work, school] }) }));
const notifyEventsChanged = vi.hoisted(() => vi.fn());
vi.mock('@/app/hooks/useEventsVersion', () => ({ notifyEventsChanged }));

import GoogleCalendarSection from './GoogleCalendarSection';
import { AppShellContext, type AppShellValue } from '@/app/context/AppShellContext';
import type { IntegrationNoticeValue } from './IntegrationParts';

let container: HTMLDivElement;
let root: Root;

const notConnected: GoogleCalendarStatus = { configured: true, connected: false, email: null, last_synced_at: null, last_error: null };
const connected: GoogleCalendarStatus = { ...notConnected, connected: true, email: 'maya@gmail.com', last_synced_at: '2026-11-09T18:00:00Z' };
const personal: GoogleCalendarEntry = { id: 'maya@gmail.com', name: 'Personal', color: '#7986cb', selected: true, default_tag: null };
const holidays: GoogleCalendarEntry = { id: 'en.usa#holiday@group.v.calendar.google.com', name: 'Holidays', color: '#33b679', selected: false, default_tag: work };

function Harness({ initial, isDemo }: { initial: GoogleCalendarStatus | null; isDemo: boolean }) {
  const [status, setStatus] = useState(initial);
  return <GoogleCalendarSection isDemo={isDemo} status={status} onStatusChange={setStatus} />;
}

const render = async (status: GoogleCalendarStatus | null, isDemo = false) => {
  await act(async () => { root.render(<Harness initial={status} isDemo={isDemo} />); });
};
const button = (name: string) => [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === name);
const click = async (el: Element | undefined | null) => {
  await act(async () => { el!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};
const row = (id: string) => container.querySelector(`[data-google-calendar="${CSS.escape(id)}"]`)!;
const change = async (el: HTMLSelectElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  for (const fn of [api.connectGoogleCalendar, api.disconnectGoogleCalendar, api.syncGoogleCalendar, api.updateGoogleCalendar]) fn.mockReset();
  api.fetchGoogleCalendars.mockReset().mockResolvedValue([personal, holidays]);
  api.disconnectGoogleCalendar.mockResolvedValue(undefined);
  api.updateGoogleCalendar.mockResolvedValue(undefined);
  notifyEventsChanged.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('when the server has no Google keys', () => {
  it('shows no connect control and nothing broken', async () => {
    await render({ ...notConnected, configured: false });
    expect(container.querySelector('button')).toBeNull();
    expect(container.textContent).toBe('');
    expect(api.fetchGoogleCalendars).not.toHaveBeenCalled();
  });
});

describe('in the demo', () => {
  it('says it needs a real account and offers no connect control', async () => {
    await render(notConnected, true);
    expect(container.textContent).toContain("isn't available in the demo");
    expect(button('Connect Google Calendar')).toBeUndefined();
  });
});

describe('connecting', () => {
  it('sends the browser to the consent page', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, href: window.location.href, search: '', assign });
    api.connectGoogleCalendar.mockResolvedValue({ authorization_url: 'https://accounts.google.com/o/oauth2/auth?x=1' });
    await render(notConnected);
    await click(button('Connect Google Calendar'));
    expect(assign).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/auth?x=1');
  });

  it('says so when connecting cannot start', async () => {
    api.connectGoogleCalendar.mockRejectedValue(new Error('nope'));
    await render(notConnected);
    await click(button('Connect Google Calendar'));
    expect(container.querySelector('[role="alert"]')!.textContent).toContain("Couldn't start connecting");
    expect(button('Connect Google Calendar')!.disabled).toBe(false);
  });

  const clearNotice = vi.fn();
  const renderInShell = async (notice: IntegrationNoticeValue | null) => {
    await act(async () => {
      root.render(
        <AppShellContext.Provider value={{ googleCalendarNotice: notice, clearGoogleCalendarNotice: clearNotice } as Partial<AppShellValue> as AppShellValue}>
          <Harness initial={notConnected} isDemo={false} />
        </AppShellContext.Provider>,
      );
    });
  };
  const failed: IntegrationNoticeValue = { tone: 'error', text: "It didn't connect." };

  it('shows how coming back from Google went', async () => {
    await renderInShell(failed);
    expect(container.querySelector('[role="alert"]')!.textContent).toBe("It didn't connect.");
  });

  it('shows how it went when the answer arrives with the page already open', async () => {
    await renderInShell(null);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await renderInShell(failed);
    expect(container.querySelector('[role="alert"]')!.textContent).toBe("It didn't connect.");
  });

  it('drops the return notice for good once something on the page replaces it', async () => {
    clearNotice.mockReset();
    api.connectGoogleCalendar.mockRejectedValue(new Error('nope'));
    await renderInShell(failed);
    await click(button('Connect Google Calendar'));
    expect(clearNotice).toHaveBeenCalled();
  });

  it('puts the return notice over an older one from the page', async () => {
    api.connectGoogleCalendar.mockRejectedValue(new Error('nope'));
    await renderInShell(null);
    await click(button('Connect Google Calendar'));
    expect(container.querySelector('[role="alert"]')!.textContent).toContain("Couldn't start connecting");
    await renderInShell(failed);
    expect(container.querySelector('[role="alert"]')!.textContent).toBe("It didn't connect.");
  });
});

describe('connected', () => {
  it('shows the account, the last sync and each calendar', async () => {
    await render(connected);
    expect(container.textContent).toContain('maya@gmail.com');
    expect(container.textContent).toContain('Last sync');
    expect(container.textContent).not.toContain('Not yet');
    expect(row(personal.id).querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
    expect(row(holidays.id).querySelector('select')!.value).toBe('1');
  });

  it('says calmly when the last sync failed, without the raw error', async () => {
    await render({ ...connected, last_error: 'invalid_grant: token revoked' });
    expect(container.textContent).toContain("couldn't reach Google");
    expect(container.textContent).not.toContain('invalid_grant');
  });

  it('syncs, updates the status and reloads the calendars', async () => {
    api.syncGoogleCalendar.mockResolvedValue({ ...connected, last_synced_at: '2026-11-09T20:00:00Z' });
    await render(connected);
    await click(button('Sync now'));
    expect(notifyEventsChanged).toHaveBeenCalledTimes(1);
    expect(api.fetchGoogleCalendars).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role="status"]')!.textContent).toContain('Synced');
  });

  it('shows the warning, not a success, when a sync reports a problem', async () => {
    api.syncGoogleCalendar.mockResolvedValue({ ...connected, last_error: 'boom' });
    await render(connected);
    await click(button('Sync now'));
    expect(container.textContent).not.toContain('Synced with Google');
    expect(container.textContent).toContain("couldn't reach Google");
  });

  it('asks before disconnecting and changes nothing on Cancel', async () => {
    await render(connected);
    await click(button('Disconnect'));
    expect(container.textContent).toContain('Disconnect Google Calendar?');
    expect(api.disconnectGoogleCalendar).not.toHaveBeenCalled();
    await click(button('Cancel'));
    expect(container.textContent).not.toContain('Disconnect Google Calendar?');
    expect(api.disconnectGoogleCalendar).not.toHaveBeenCalled();
  });

  it('disconnects after confirming and goes back to Connect', async () => {
    await render(connected);
    await click(button('Disconnect'));
    await click(button('Disconnect'));
    expect(api.disconnectGoogleCalendar).toHaveBeenCalledTimes(1);
    expect(notifyEventsChanged).toHaveBeenCalledTimes(1);
    expect(button('Connect Google Calendar')).toBeTruthy();
    expect(container.textContent).toContain('disconnected');
  });

  it('shows or hides a calendar and reloads the calendars', async () => {
    await render(connected);
    await click(row(holidays.id).querySelector('input[type="checkbox"]'));
    expect(api.updateGoogleCalendar).toHaveBeenCalledWith(holidays.id, { selected: true });
    expect(notifyEventsChanged).toHaveBeenCalledTimes(1);
    expect(row(holidays.id).querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
  });

  it('sets and clears a default tag', async () => {
    await render(connected);
    await change(row(personal.id).querySelector('select')!, '2');
    expect(api.updateGoogleCalendar).toHaveBeenCalledWith(personal.id, { default_tag_id: 2 });
    expect(row(personal.id).querySelector('select')!.value).toBe('2');
    await change(row(holidays.id).querySelector('select')!, '');
    expect(api.updateGoogleCalendar).toHaveBeenCalledWith(holidays.id, { default_tag_id: null });
  });

  it('goes back and says so when a calendar change fails', async () => {
    api.updateGoogleCalendar.mockRejectedValue(new Error('nope'));
    await render(connected);
    await click(row(personal.id).querySelector('input[type="checkbox"]'));
    expect(row(personal.id).querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
    expect(notifyEventsChanged).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')!.textContent).toContain("Couldn't save that");
  });

  it('keeps a default tag that has since been archived on show', async () => {
    const old: Tag = { id: 9, name: 'Old', color: '#000000' };
    api.fetchGoogleCalendars.mockResolvedValue([{ ...personal, default_tag: old }]);
    await render(connected);
    expect(row(personal.id).querySelector('select')!.value).toBe('9');
  });

  it('offers a retry when the calendars cannot load', async () => {
    api.fetchGoogleCalendars.mockRejectedValueOnce(new Error('nope'));
    await render(connected);
    expect(container.textContent).toContain("Couldn't load your calendars.");
    await click(button('Try again'));
    expect(row(personal.id)).toBeTruthy();
  });
});
