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

import MoodNudge from './MoodNudge';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const checkin = (mood: number): MoodCheckin => ({
  id: 1, period_kind: 'day', period_start: '2026-10-20', mood, energy: null, stress: null,
  workload: null, highlight: null, progress: null, word: null, note: null, tags: [],
  created_at: '2026-10-21T01:00:00Z', updated_at: '2026-10-21T01:00:00Z',
});

const profile = {
  dayStartTime: '08:00',
  shutoffTime: '18:00',
  restDays: [0, 6],
  moodCheckins: DEFAULT_MOOD_SETTINGS,
} as ProfileFields;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
  // Tuesday, past "Call it a day".
  vi.setSystemTime(new Date(2026, 9, 20, 18, 4));
  localStorage.clear();
  api.fetchMoodCheckins.mockResolvedValue([]);
  api.fetchMoodTags.mockResolvedValue({ defaults: [], custom: [] });
  api.fetchNoteTimeSpentForRange.mockResolvedValue({});
  api.saveMoodCheckin.mockImplementation(async (body: { mood: number }) => checkin(body.mood));
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

const render = async (props: Partial<React.ComponentProps<typeof MoodNudge>> = {}) => {
  await act(async () => {
    root.render(
      <ToastProvider>
        <MoodNudge profile={profile} profileLoaded tasks={[]} habits={[]} {...props} />
      </ToastProvider>,
    );
  });
};

const text = () => container.textContent ?? '';
const nudgeShown = () => text().includes('Calling it a day?');
const button = (name: string) =>
  [...document.body.querySelectorAll('button')].find(b => b.textContent?.trim() === name || b.getAttribute('aria-label') === name)!;
const click = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };

describe('MoodNudge', () => {
  it('stays hidden before "Call it a day" without asking the server', async () => {
    vi.setSystemTime(new Date(2026, 9, 20, 17, 30));
    await render();
    expect(nudgeShown()).toBe(false);
    expect(api.fetchMoodCheckins).not.toHaveBeenCalled();
  });

  it('appears after "Call it a day" once it knows the day is not logged', async () => {
    await render();
    expect(api.fetchMoodCheckins).toHaveBeenCalledWith('2026-10-20', '2026-10-20', ['day']);
    expect(nudgeShown()).toBe(true);
  });

  it('appears when the clock passes "Call it a day" while the dashboard is open', async () => {
    vi.setSystemTime(new Date(2026, 9, 20, 17, 59, 45));
    await render();
    expect(nudgeShown()).toBe(false);
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(nudgeShown()).toBe(true);
  });

  it('waits for the profile to load', async () => {
    await render({ profileLoaded: false });
    expect(nudgeShown()).toBe(false);
  });

  it('does not nudge on a rest day, but offers logging by hand', async () => {
    vi.setSystemTime(new Date(2026, 9, 24, 18, 4)); // Saturday
    await render();
    expect(nudgeShown()).toBe(false);
    expect(button('Log today’s mood')).toBeDefined();
  });

  it('shows the confirmation instead when the day is already logged', async () => {
    api.fetchMoodCheckins.mockResolvedValue([checkin(5)]);
    await render();
    expect(nudgeShown()).toBe(false);
    expect(text()).toContain('Logged today as Great');
  });

  it('hides after saving a check-in from a tapped face', async () => {
    await render();
    await click(button('Good'));
    expect(document.body.textContent).toContain('Daily check-in');

    await click(button('Save check-in'));
    expect(api.saveMoodCheckin).toHaveBeenCalledWith(expect.objectContaining({ period_start: '2026-10-20', mood: 4 }));
    expect(nudgeShown()).toBe(false);
    expect(text()).toContain('Logged today as Good');
  });

  it('hides after "Not today", for the rest of the day, leaving the chip', async () => {
    await render();
    await click(button('Not today'));
    expect(nudgeShown()).toBe(false);
    expect(button('Log today’s mood')).toBeDefined();

    // Remembered across a reload.
    act(() => root.unmount());
    root = createRoot(container);
    await render();
    expect(nudgeShown()).toBe(false);
  });

  it('hides after "Skip today" in the check-in', async () => {
    await render();
    await click(button('Okay'));
    await click(button('Skip today'));
    expect(api.saveMoodCheckin).not.toHaveBeenCalled();
    expect(nudgeShown()).toBe(false);
    expect(button('Log today’s mood')).toBeDefined();
  });

  it('comes back an hour after "In 1 hour"', async () => {
    await render();
    await click(button('In 1 hour'));
    expect(nudgeShown()).toBe(false);
    await act(async () => { vi.advanceTimersByTime(60 * 60 * 1000); });
    expect(nudgeShown()).toBe(true);
  });
});
