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

const saveProfile = vi.fn<(next: ProfileFields) => Promise<{ ok: boolean }>>(async () => ({ ok: true }));

const render = async (props: Partial<React.ComponentProps<typeof MoodNudge>> = {}) => {
  await act(async () => {
    root.render(
      <ToastProvider>
        <MoodNudge profile={profile} profileLoaded tasks={[]} habits={[]} onSaveProfile={saveProfile} {...props} />
      </ToastProvider>,
    );
  });
};

const text = () => container.textContent ?? '';
const nudgeShown = () => text().includes('Calling it a day?');
const button = (name: string) =>
  [...document.body.querySelectorAll('button')].find(b => b.textContent?.trim() === name || b.getAttribute('aria-label') === name)!;
const inDialog = (name: string) =>
  [...document.body.querySelector('[role="dialog"]')!.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === name)!;
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

  it('keeps an edited check-in when the older "Saved" toast\'s Undo would delete it', async () => {
    await render();
    await click(button('Low'));
    await click(button('Save check-in'));
    expect(document.body.textContent).toContain('Saved · Low');

    await click(button('Edit'));
    await click(button('Great'));
    await click(button('Save changes'));
    expect(document.body.textContent).toContain('Check-in updated.');

    // The edit retires the stale "Saved" toast; had it stayed, its Undo would delete the edited row.
    expect(document.body.textContent).not.toContain('Saved · Low');
    expect(api.deleteMoodCheckin).not.toHaveBeenCalled();
    expect(text()).toContain('Logged today as Great');
  });

  it('saves to the day the check-in was opened for, even after midnight', async () => {
    vi.setSystemTime(new Date(2026, 9, 20, 23, 59, 45));
    await render();
    await click(button('Good'));
    await act(async () => { vi.advanceTimersByTime(30_000); });

    await click(button('Save check-in'));
    expect(api.saveMoodCheckin).toHaveBeenCalledWith(expect.objectContaining({ period_start: '2026-10-20', mood: 4 }));
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

  describe('on the day that ends a week or month', () => {
    // Sunday Oct 25 ends the week of Mon Oct 19. Only Saturday rests here.
    const sundayProfile = (moodCheckins = { ...DEFAULT_MOOD_SETTINGS, weekly: true }) =>
      ({ ...profile, restDays: [6], moodCheckins }) as ProfileFields;
    const weekRow = (mood: number): MoodCheckin => ({ ...checkin(mood), id: 2, period_kind: 'week', period_start: '2026-10-19' });

    beforeEach(() => {
      vi.setSystemTime(new Date(2026, 9, 25, 18, 4));
      api.saveMoodCheckin.mockImplementation(async (body: MoodCheckin) => ({ ...checkin(body.mood), ...body, id: 9 }));
    });

    it('adds the weekly check-in to the same card, and saves it on the Monday', async () => {
      api.fetchMoodCheckins.mockResolvedValue([{ ...checkin(4), period_start: '2026-10-21' }]);
      await render({ profile: sundayProfile() });
      expect(api.fetchMoodCheckins).toHaveBeenCalledWith('2026-10-19', '2026-10-25', ['day', 'week']);
      expect(nudgeShown()).toBe(true);
      expect(container.querySelectorAll('section')).toHaveLength(1);
      expect(text()).toContain('Weekly check-in');

      await click(button('Start'));
      expect(document.body.textContent).toContain('Week of Oct 19–25');
      expect(document.body.textContent).toContain('Your days averaged Good (4.0)');
      await click(inDialog('Great'));
      await click(button('Save check-in'));

      expect(api.saveMoodCheckin).toHaveBeenCalledWith(expect.objectContaining({ period_kind: 'week', period_start: '2026-10-19', mood: 5 }));
      expect(text()).toContain('Weekly check-in logged as Great');
      expect(nudgeShown()).toBe(true); // the day is still to log
    });

    it('shows the weekly check-in already logged', async () => {
      api.fetchMoodCheckins.mockResolvedValue([weekRow(2)]);
      await render({ profile: sundayProfile() });
      expect(text()).toContain('Weekly check-in logged as Low');
      expect(button('Start')).toBeUndefined();
    });

    it('adds the monthly check-in on the last day of the month', async () => {
      vi.setSystemTime(new Date(2026, 8, 30, 18, 4)); // Wednesday
      await render({ profile: sundayProfile({ ...DEFAULT_MOOD_SETTINGS, weekly: true, monthly: true }) });
      expect(api.fetchMoodCheckins).toHaveBeenCalledWith('2026-09-01', '2026-09-30', ['day', 'month']);
      expect(text()).toContain('Monthly check-in');
      expect(text()).not.toContain('Weekly check-in');

      await click(button('Start'));
      await click(inDialog('Okay'));
      await click(button('Save check-in'));
      expect(api.saveMoodCheckin).toHaveBeenCalledWith(expect.objectContaining({ period_kind: 'month', period_start: '2026-09-01', mood: 3 }));
    });

    it('does not nudge on a rest day, but offers logging the week by hand', async () => {
      await render({ profile: { ...sundayProfile(), restDays: [0, 6] } });
      expect(nudgeShown()).toBe(false);
      expect(text()).not.toContain('Weekly check-in');
      await click(button('Log this week'));
      expect(document.body.textContent).toContain('Week of Oct 19–25');
    });

    it('offers the week alone when the daily check-in is off', async () => {
      await render({ profile: sundayProfile({ ...DEFAULT_MOOD_SETTINGS, daily: false, weekly: true }) });
      expect(nudgeShown()).toBe(false);
      expect(button('Start')).toBeDefined();
    });

    it('hints once at turning weekly check-ins on, while they are off', async () => {
      await render({ profile: sundayProfile(DEFAULT_MOOD_SETTINGS) });
      expect(api.fetchMoodCheckins).toHaveBeenCalledWith('2026-10-25', '2026-10-25', ['day']);
      await click(button('Turn on weekly check-ins'));
      expect(saveProfile).toHaveBeenCalledWith(expect.objectContaining({
        moodCheckins: { ...DEFAULT_MOOD_SETTINGS, weekly: true },
      }));

      // Still there for the rest of the evening...
      act(() => root.unmount());
      root = createRoot(container);
      await render({ profile: sundayProfile(DEFAULT_MOOD_SETTINGS) });
      expect(text()).toContain('Turn on weekly check-ins');

      // ...but never on a later Sunday.
      act(() => root.unmount());
      root = createRoot(container);
      vi.setSystemTime(new Date(2026, 10, 1, 18, 4));
      await render({ profile: sundayProfile(DEFAULT_MOOD_SETTINGS) });
      expect(nudgeShown()).toBe(true);
      expect(text()).not.toContain('Turn on weekly check-ins');
    });

    it('skips just the weekly check-in, leaving its chip', async () => {
      await render({ profile: sundayProfile() });
      await click(button('Start'));
      await click(button('Skip'));
      expect(api.saveMoodCheckin).not.toHaveBeenCalled();
      expect(nudgeShown()).toBe(true);
      expect(button('Start')).toBeUndefined();
      expect(button('Log this week')).toBeDefined();
    });

    it('undoes only the weekly skip, keeping a "Not today" made since', async () => {
      await render({ profile: sundayProfile() });
      await click(button('Start'));
      await click(button('Skip'));
      await click(button('Not today'));
      expect(nudgeShown()).toBe(false);

      const weeklyToast = [...document.body.querySelectorAll('[role="status"]')].find(t => t.textContent?.includes('Skipped the weekly'))!;
      await click([...weeklyToast.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Undo')!);
      expect(nudgeShown()).toBe(false);
      expect(button('Log today’s mood')).toBeDefined();
    });
  });
});
