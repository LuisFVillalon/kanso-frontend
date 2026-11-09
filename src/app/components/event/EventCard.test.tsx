// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventOccurrence } from '@/app/types/event';
import type { Tag } from '@/app/types/task';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const work: Tag = { id: 1, name: 'Work', color: '#2563eb' };
const school: Tag = { id: 2, name: 'School', color: '#16a34a' };

const api = vi.hoisted(() => ({
  updateGoogleEventTags: vi.fn(),
  describeError: (_err: unknown, fallback: string) => fallback,
}));
vi.mock('@/app/lib/backend-api', () => api);
vi.mock('@/app/context/TagsContext', () => ({ useTagsContext: () => ({ tags: [work, school] }) }));
const showToast = vi.hoisted(() => vi.fn());
vi.mock('@/app/context/ToastContext', () => ({ useToast: () => showToast }));
const notifyEventsChanged = vi.hoisted(() => vi.fn());
vi.mock('@/app/hooks/useEventsVersion', () => ({ notifyEventsChanged }));

import EventCard from './EventCard';

let container: HTMLDivElement;
let root: Root;

const occurrence = (overrides: Partial<EventOccurrence> = {}): EventOccurrence => ({
  event_id: 5, occurrence_date: '2026-11-11', title: 'Team sync', description: 'Weekly', tags: [work], all_day: false,
  date: '2026-11-11', end_date: '2026-11-11', start_time: '10:00:00', end_time: '11:00:00',
  starts_at: '2026-11-11T18:00:00Z', ends_at: '2026-11-11T19:00:00Z', time_zone: 'America/Los_Angeles',
  repeat_days: [], repeat_interval: 1, reminder_minutes: null, edited: false, past: false, archived: false,
  ...overrides,
});
const google = (overrides: Partial<EventOccurrence> = {}) => occurrence({
  event_id: -5, source: 'google', html_link: 'https://www.google.com/calendar/event?eid=abc', ...overrides,
});

const render = (o: EventOccurrence) => {
  const noop = () => {};
  act(() => {
    root.render(
      <EventCard occurrence={o} past={false} anchor={new DOMRect(0, 0, 10, 10)} onClose={noop} onEdit={noop} onArchive={noop} onRestore={noop} onDelete={noop} />,
    );
  });
};
const buttons = () => [...document.body.querySelectorAll('button')];
const button = (name: string) => buttons().find(b => b.textContent?.trim() === name);
const click = async (el: Element | undefined) => {
  await act(async () => { el!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  api.updateGoogleEventTags.mockReset().mockResolvedValue(undefined);
  notifyEventsChanged.mockReset();
  showToast.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('EventCard for a kanso event', () => {
  it('still offers edit, archive and delete and no Google controls', () => {
    render(occurrence());
    expect(button('Edit')).toBeTruthy();
    expect(button('Archive')).toBeTruthy();
    expect(button('Delete')).toBeTruthy();
    expect(button('Use calendar default')).toBeUndefined();
    expect(document.body.textContent).not.toContain('From Google Calendar');
  });
});

describe('EventCard for an imported event', () => {
  it('offers no way to edit, archive or delete it', () => {
    render(google());
    expect(button('Edit')).toBeUndefined();
    expect(button('Archive')).toBeUndefined();
    expect(button('Restore')).toBeUndefined();
    expect(button('Delete')).toBeUndefined();
  });

  it('says where it came from and links to Google', () => {
    render(google());
    expect(document.body.textContent).toContain('From Google Calendar');
    const link = document.body.querySelector('a')!;
    expect(link.href).toBe('https://www.google.com/calendar/event?eid=abc');
    expect(link.rel).toContain('noopener');
  });

  it('has no link when Google gave none', () => {
    render(google({ html_link: null }));
    expect(document.body.querySelector('a')).toBeNull();
  });

  it('saves a picked tag alongside its current ones and reloads the calendars', async () => {
    render(google());
    await click(button('School'));
    expect(api.updateGoogleEventTags).toHaveBeenCalledWith(-5, [1, 2], false);
    expect(notifyEventsChanged).toHaveBeenCalledTimes(1);
    expect(button('School')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('sends an empty list when the last tag comes off, leaving it with no tags', async () => {
    render(google());
    await click(button('Work'));
    expect(api.updateGoogleEventTags).toHaveBeenCalledWith(-5, [], false);
  });

  it('shows a tag archived since it was given, so it can come off', async () => {
    render(google({ tags: [{ id: 9, name: 'Old', color: '#000000' }] }));
    expect(button('Old')!.getAttribute('aria-pressed')).toBe('true');
    await click(button('Old'));
    expect(api.updateGoogleEventTags).toHaveBeenCalledWith(-5, [], false);
  });

  it('returns to the calendar default', async () => {
    render(google());
    await click(button('Use calendar default'));
    expect(api.updateGoogleEventTags).toHaveBeenCalledWith(-5, [], true);
    expect(notifyEventsChanged).toHaveBeenCalledTimes(1);
  });

  it('shows the reloaded tags once they arrive', async () => {
    render(google());
    await click(button('School'));
    render(google({ tags: [school] }));
    expect(button('Work')!.getAttribute('aria-pressed')).toBe('false');
    expect(button('School')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('puts the tags back and says so when saving fails', async () => {
    api.updateGoogleEventTags.mockRejectedValue(new Error('nope'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(google());
    await click(button('School'));
    expect(button('School')!.getAttribute('aria-pressed')).toBe('false');
    expect(notifyEventsChanged).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith("Couldn't save the tags. Please try again.", 'error');
  });

  it('saves one change at a time', async () => {
    let finish: () => void = () => {};
    api.updateGoogleEventTags.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    render(google());
    await click(button('School'));
    expect(button('Work')!.disabled).toBe(true);
    expect(button('Use calendar default')!.disabled).toBe(true);
    await act(async () => { finish(); });
    expect(button('Work')!.disabled).toBe(false);
  });
});
