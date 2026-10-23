// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const api = vi.hoisted(() => ({
  fetchCalendarSettings: vi.fn(),
  updateCalendarSettings: vi.fn(),
  fetchArchivedTerms: vi.fn(),
  archiveTerm: vi.fn(),
  deleteArchivedTerm: vi.fn(),
  fetchTermRollover: vi.fn(),
  updateTermRollover: vi.fn(),
  saveNextTerm: vi.fn(),
  deleteNextTerm: vi.fn(),
  archiveEndedTerm: vi.fn(),
  deleteEndedTerm: vi.fn(),
}));
vi.mock('@/app/lib/backend-api', () => api);

import { useCalendarSettings } from './useCalendarSettings';

let container: HTMLDivElement;
let root: Root;
let hook: ReturnType<typeof useCalendarSettings>;

const Probe: React.FC<{ user: User | null; onResult: (r: typeof hook) => void }> = ({ user, onResult }) => {
  onResult(useCalendarSettings(user));
  return null;
};
const renderProbe = () => act(async () => root.render(<Probe user={user} onResult={r => { hook = r; }} />));

const user = { id: 'user-1' } as User;
const fall = { id: 3, title: 'Fall 2026', start_date: '2026-08-24', end_date: '2026-12-18' };
const noRollover = { auto_archive: false, next_term: null, ended_term: null };
const spring27 = { title: 'Spring 2027', start_date: '2027-01-19', end_date: '2027-05-14' };
const spring = { id: 1, title: 'Spring 2026', start_date: '2026-01-20', end_date: '2026-05-15', archived_at: '2026-05-20T00:00:00Z' };

beforeEach(async () => {
  vi.clearAllMocks();
  api.fetchCalendarSettings.mockResolvedValue(fall);
  api.fetchArchivedTerms.mockResolvedValue([spring]);
  api.fetchTermRollover.mockResolvedValue(noRollover);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await renderProbe();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('useCalendarSettings terms', () => {
  it('draws the archived terms and the current term', () => {
    expect(hook.terms.map(t => [t.title, t.archived])).toEqual([['Spring 2026', true], ['Fall 2026', false]]);
  });

  it('keeps an archived term on the calendars and drops the current one', async () => {
    api.archiveTerm.mockResolvedValue({ ...fall, id: 9, archived_at: '2026-12-19T00:00:00Z' });
    api.fetchCalendarSettings.mockResolvedValue(null);
    await act(async () => { await hook.archiveCurrentTerm(); });
    expect(hook.calendarSettings.id).toBe(0);
    expect(hook.archivedTerms.map(t => t.id)).toEqual([1, 9]);
    expect(hook.terms.map(t => [t.title, t.archived])).toEqual([['Spring 2026', true], ['Fall 2026', true]]);
  });

  it("forgets a replaced term that wasn't archived", async () => {
    api.updateCalendarSettings.mockResolvedValue({ ...fall, title: 'Spring 2027', start_date: '2027-01-19', end_date: '2027-05-14' });
    await act(async () => { await hook.saveCalendarSettings({ title: 'Spring 2027', start_date: '2027-01-19', end_date: '2027-05-14' }); });
    expect(hook.terms.map(t => t.title)).toEqual(['Spring 2026', 'Spring 2027']);
  });

  it('removes a deleted archived term', async () => {
    api.deleteArchivedTerm.mockResolvedValue(spring);
    await act(async () => { await hook.removeArchivedTerm(1); });
    expect(api.deleteArchivedTerm).toHaveBeenCalledWith(1);
    expect(hook.terms.map(t => t.title)).toEqual(['Fall 2026']);
  });

  it('still loads the current term when the archived terms fail to load', async () => {
    api.fetchArchivedTerms.mockRejectedValue(new Error('offline'));
    act(() => root.unmount());
    root = createRoot(container);
    await renderProbe();
    expect(hook.terms.map(t => t.title)).toEqual(['Fall 2026']);
  });
});

describe('useCalendarSettings rollover', () => {
  const rerender = async () => {
    act(() => root.unmount());
    root = createRoot(container);
    await renderProbe();
  };

  it('loads the queued next term and the auto-archive switch', async () => {
    api.fetchTermRollover.mockResolvedValue({ auto_archive: true, next_term: spring27, ended_term: null });
    await rerender();
    expect(hook.rollover).toEqual({ auto_archive: true, next_term: spring27, ended_term: null });
    // The queued term isn't drawn on the calendars until it's the current one.
    expect(hook.terms.map(t => t.title)).toEqual(['Spring 2026', 'Fall 2026']);
  });

  it('queues the next term and reads the term again, in case the current one already ended', async () => {
    api.saveNextTerm.mockResolvedValue({ ...noRollover, next_term: spring27 });
    const calls = api.fetchCalendarSettings.mock.calls.length;
    await act(async () => { await hook.saveQueuedNextTerm(spring27); });
    expect(api.saveNextTerm).toHaveBeenCalledWith(spring27);
    expect(api.fetchCalendarSettings.mock.calls.length).toBe(calls + 1);
  });

  it('lets the queued next term take over when the current term is archived', async () => {
    api.fetchTermRollover.mockResolvedValue({ ...noRollover, next_term: spring27 });
    await rerender();
    api.archiveTerm.mockResolvedValue({ ...fall, id: 9, archived_at: '2026-12-19T00:00:00Z' });
    api.fetchCalendarSettings.mockResolvedValue({ id: 3, ...spring27 });
    api.fetchArchivedTerms.mockResolvedValue([spring, { ...fall, id: 9, archived_at: '2026-12-19T00:00:00Z' }]);
    api.fetchTermRollover.mockResolvedValue(noRollover);
    await act(async () => { await hook.archiveCurrentTerm(); });
    expect(hook.calendarSettings.title).toBe('Spring 2027');
    expect(hook.rollover?.next_term).toBeNull();
    expect(hook.terms.map(t => [t.title, t.archived])).toEqual([['Spring 2026', true], ['Fall 2026', true], ['Spring 2027', false]]);
  });

  it('removes the next term, switches auto-archive and settles the ended term', async () => {
    api.deleteNextTerm.mockResolvedValue(noRollover);
    await act(async () => { await hook.removeNextTerm(); });
    expect(hook.rollover).toEqual(noRollover);

    api.updateTermRollover.mockResolvedValue({ ...noRollover, auto_archive: true });
    // Turned on, it's read again: a term that already ended is archived right away.
    api.fetchTermRollover.mockResolvedValue({ ...noRollover, auto_archive: true });
    const calls = api.fetchCalendarSettings.mock.calls.length;
    await act(async () => { await hook.setAutoArchive(true); });
    expect(api.updateTermRollover).toHaveBeenCalledWith(true);
    expect(hook.rollover?.auto_archive).toBe(true);
    expect(api.fetchCalendarSettings.mock.calls.length).toBe(calls + 1);

    const summer = { title: 'Summer 2026', start_date: '2026-06-01', end_date: '2026-08-14' };
    api.fetchTermRollover.mockResolvedValue({ ...noRollover, ended_term: summer });
    await rerender();
    api.archiveEndedTerm.mockResolvedValue({ ...summer, id: 5, archived_at: '2026-08-15T00:00:00Z' });
    await act(async () => { await hook.archiveReplacedTerm(); });
    expect(hook.rollover?.ended_term).toBeNull();
    expect(hook.terms.map(t => [t.title, t.archived])).toEqual([['Spring 2026', true], ['Summer 2026', true], ['Fall 2026', false]]);

    await rerender();
    api.deleteEndedTerm.mockResolvedValue(noRollover);
    await act(async () => { await hook.dropReplacedTerm(); });
    expect(hook.rollover?.ended_term).toBeNull();
  });

  it('reads the term again on a new day, so an ended term rolls over without the user doing anything', async () => {
    act(() => root.unmount());
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    try {
      vi.setSystemTime(new Date(2026, 11, 18, 22, 0));
      root = createRoot(container);
      await renderProbe();
      expect(hook.calendarSettings.title).toBe('Fall 2026');
      api.fetchCalendarSettings.mockResolvedValue({ id: 3, ...spring27 });
      await act(async () => { await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1000); });
      expect(hook.calendarSettings.title).toBe('Spring 2027');
    } finally {
      vi.useRealTimers();
    }
  });
});
