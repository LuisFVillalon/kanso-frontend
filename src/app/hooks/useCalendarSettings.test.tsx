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
const spring = { id: 1, title: 'Spring 2026', start_date: '2026-01-20', end_date: '2026-05-15', archived_at: '2026-05-20T00:00:00Z' };

beforeEach(async () => {
  vi.clearAllMocks();
  api.fetchCalendarSettings.mockResolvedValue(fall);
  api.fetchArchivedTerms.mockResolvedValue([spring]);
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
