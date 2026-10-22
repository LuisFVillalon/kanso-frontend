// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/app/context/ToastContext';
import type { ProfileFields } from '@/app/hooks/useProfile';
import { DEFAULT_MOOD_SETTINGS, type MoodCheckin } from '@/app/types/mood';

const api = vi.hoisted(() => ({
  fetchMoodCheckins: vi.fn(),
  saveMoodCheckin: vi.fn(),
  deleteMoodCheckin: vi.fn(),
  fetchMoodTags: vi.fn(),
  fetchNoteTimeSpentForRange: vi.fn(),
}));
vi.mock('@/app/lib/backend-api', () => ({ ...api, describeError: (_: unknown, fallback: string) => fallback }));

import PeriodMoodCheckins from './PeriodMoodCheckins';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const checkin = (mood: number, start = '2026-10-20'): MoodCheckin => ({
  id: 1, period_kind: 'day', period_start: start, mood, energy: null, stress: null,
  workload: null, highlight: null, progress: null, word: null, note: null, tags: [],
  created_at: '2026-10-21T01:00:00Z', updated_at: '2026-10-21T01:00:00Z',
});
const weekRow = (mood: number): MoodCheckin => ({ ...checkin(mood), id: 2, period_kind: 'week', period_start: '2026-10-19' });

const profile = (moodCheckins = { ...DEFAULT_MOOD_SETTINGS, weekly: true }) => ({
  dayStartTime: '08:00',
  shutoffTime: '18:00',
  restDays: [0, 6],
  moodCheckins,
}) as ProfileFields;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
  // Sunday Oct 25 ends the week of Mon Oct 19 — mid-afternoon, well before "Call it a day".
  vi.setSystemTime(new Date(2026, 9, 25, 14, 0));
  api.fetchMoodCheckins.mockResolvedValue([]);
  api.fetchMoodTags.mockResolvedValue({ defaults: [], custom: [] });
  api.saveMoodCheckin.mockImplementation(async (body: MoodCheckin) => ({ ...checkin(body.mood), ...body, id: 9 }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
  vi.useRealTimers();
});

const render = async (props: Partial<React.ComponentProps<typeof PeriodMoodCheckins>> = {}) => {
  await act(async () => {
    root.render(
      <ToastProvider>
        <PeriodMoodCheckins profile={profile()} profileLoaded tasks={[]} {...props} />
      </ToastProvider>,
    );
  });
};

const text = () => container.textContent ?? '';
const button = (name: string) =>
  [...document.body.querySelectorAll('button')].find(b => b.textContent?.trim() === name || b.getAttribute('aria-label') === name);
const inDialog = (name: string) =>
  [...document.body.querySelector('[role="dialog"]')!.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === name)!;
const click = async (el: Element | undefined) => { await act(async () => { (el as HTMLElement).click(); }); };

describe('PeriodMoodCheckins', () => {
  it('never prompts for the day: no "Calling it a day?" card, even past "Call it a day"', async () => {
    vi.setSystemTime(new Date(2026, 9, 20, 18, 4)); // Tuesday
    await render();
    expect(text()).toBe('');
    expect(api.fetchMoodCheckins).not.toHaveBeenCalled();
  });

  it('offers the weekly check-in all of Sunday, and saves it on the Monday', async () => {
    api.fetchMoodCheckins.mockResolvedValue([checkin(4, '2026-10-21')]);
    await render();
    expect(api.fetchMoodCheckins).toHaveBeenCalledWith('2026-10-19', '2026-10-25', ['day', 'week']);
    expect(text()).not.toContain('Calling it a day');

    await click(button('Log this week'));
    expect(document.body.textContent).toContain('Week of Oct 19–25');
    expect(document.body.textContent).toContain('Your days averaged Good (4.0)');
    expect(button('Skip')).toBeUndefined();
    await click(inDialog('Great'));
    await click(button('Save check-in'));

    expect(api.saveMoodCheckin).toHaveBeenCalledWith(expect.objectContaining({ period_kind: 'week', period_start: '2026-10-19', mood: 5 }));
    expect(document.body.textContent).toContain('Weekly check-in saved · Great');
    expect(text()).toContain('This week: Great');
  });

  it('shows the weekly check-in already logged, with Edit', async () => {
    api.fetchMoodCheckins.mockResolvedValue([weekRow(2)]);
    await render();
    expect(text()).toContain('This week: Low');
    expect(button('Log this week')).toBeUndefined();
    await click(button('Edit this week’s check-in'));
    expect(document.body.textContent).toContain('Save changes');
  });

  it('offers the monthly check-in on the last day of the month', async () => {
    vi.setSystemTime(new Date(2026, 8, 30, 14, 0)); // Wednesday
    await render({ profile: profile({ ...DEFAULT_MOOD_SETTINGS, weekly: true, monthly: true }) });
    expect(api.fetchMoodCheckins).toHaveBeenCalledWith('2026-09-01', '2026-09-30', ['day', 'month']);
    expect(button('Log this week')).toBeUndefined();

    await click(button('Log September'));
    await click(inDialog('Okay'));
    await click(button('Save check-in'));
    expect(api.saveMoodCheckin).toHaveBeenCalledWith(expect.objectContaining({ period_kind: 'month', period_start: '2026-09-01', mood: 3 }));
  });

  it('offers both when a Sunday ends the month', async () => {
    vi.setSystemTime(new Date(2026, 4, 31, 14, 0));
    await render({ profile: profile({ ...DEFAULT_MOOD_SETTINGS, weekly: true, monthly: true }) });
    expect(button('Log this week')).toBeDefined();
    expect(button('Log May')).toBeDefined();
  });

  it('offers nothing while weekly check-ins are off', async () => {
    await render({ profile: profile(DEFAULT_MOOD_SETTINGS) });
    expect(text()).toBe('');
    expect(api.fetchMoodCheckins).not.toHaveBeenCalled();
  });

  it('waits for the profile to load', async () => {
    await render({ profileLoaded: false });
    expect(text()).toBe('');
  });

  it('follows a day that runs past midnight into Monday', async () => {
    vi.setSystemTime(new Date(2026, 9, 26, 0, 45));
    await render({ profile: { ...profile(), dayStartTime: '09:00', shutoffTime: '00:30' } });
    expect(button('Log this week')).toBeDefined();
  });
});
