// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/app/context/ToastContext';
import { DEFAULT_MOOD_SETTINGS, type MoodCheckin } from '@/app/types/mood';
import type { ProfileFields } from '@/app/hooks/useProfile';
import { announceMoodCheckin } from '@/app/utils/moodCheckinSync';

const api = vi.hoisted(() => ({
  fetchMoodCheckins: vi.fn(),
  saveMoodCheckin: vi.fn(),
  deleteMoodCheckin: vi.fn(),
  fetchMoodTags: vi.fn(),
}));
vi.mock('@/app/lib/backend-api', () => ({ ...api, describeError: (_: unknown, fallback: string) => fallback }));

import { DayClosedMoodReminder, DayMoodCheckinModal } from '@/app/components/mood/DayMoodCheckin';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const checkin = (mood: number, date: string): MoodCheckin => ({
  id: 3, period_kind: 'day', period_start: date, mood, energy: null, stress: null,
  workload: null, highlight: null, progress: null, word: null, note: null, tags: [],
  created_at: '2026-10-19T22:00:00Z', updated_at: '2026-10-19T22:00:00Z',
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 21, 12, 0)); // Wednesday
  api.fetchMoodCheckins.mockResolvedValue([]);
  api.fetchMoodTags.mockResolvedValue({ defaults: [], custom: [] });
  api.saveMoodCheckin.mockImplementation(async (body: { mood: number; period_start: string }) => checkin(body.mood, body.period_start));
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

const onClose = vi.fn();
const render = async (date: string) => {
  await act(async () => {
    root.render(
      <ToastProvider>
        <DayMoodCheckinModal date={date} onClose={onClose} />
      </ToastProvider>,
    );
  });
};

const byText = (name: string) => [...document.body.querySelectorAll('button')].find(b => b.textContent?.trim() === name)!;
const click = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };
const dialogTitle = () => document.getElementById('mood-checkin-title')?.textContent;

describe('DayMoodCheckinModal', () => {
  it('opens a new check-in for a day without one', async () => {
    await render('2026-10-19');
    expect(dialogTitle()).toBe('Daily check-in');
  });

  it("opens the day's saved check-in to edit, and closes once saved", async () => {
    api.fetchMoodCheckins.mockResolvedValue([checkin(2, '2026-10-19')]);
    await render('2026-10-19');
    expect(dialogTitle()).toBe('Edit check-in · Mon, Oct 19');
    await click(byText('Save changes'));
    expect(api.saveMoodCheckin).toHaveBeenCalledWith(expect.objectContaining({ period_start: '2026-10-19', mood: 2 }));
    expect(onClose).toHaveBeenCalled();
    expect(document.body.textContent).toContain('Check-in updated.');
  });

  it('leaves a check-in edited elsewhere alone when the older "Saved" toast\'s Undo is clicked', async () => {
    await render('2026-10-19');
    await click(byText('Good'));
    await click(byText('Save check-in'));
    expect(document.body.textContent).toContain('Saved · Good');

    act(() => announceMoodCheckin({ kind: 'day', start: '2026-10-19', row: checkin(5, '2026-10-19') }));
    await click(byText('Undo'));
    expect(api.deleteMoodCheckin).not.toHaveBeenCalled();
  });

  it("deletes a new check-in from the \"Saved\" toast's Undo", async () => {
    api.deleteMoodCheckin.mockResolvedValue(undefined);
    await render('2026-10-19');
    await click(byText('Good'));
    await click(byText('Save check-in'));
    await click(byText('Undo'));
    expect(api.deleteMoodCheckin).toHaveBeenCalledWith(3);
  });

  it("closes with a message when the day's check-in can't load", async () => {
    api.fetchMoodCheckins.mockRejectedValue(new Error('offline'));
    await render('2026-10-19');
    expect(dialogTitle()).toBeUndefined();
    expect(onClose).toHaveBeenCalled();
    expect(document.body.textContent).toContain("Couldn't open your check-in.");
  });
});

describe('DayClosedMoodReminder', () => {
  const profile = {
    dayStartTime: '08:00',
    shutoffTime: '18:00',
    moodCheckins: DEFAULT_MOOD_SETTINGS,
  } as unknown as ProfileFields;

  const renderReminder = async (props: { profile?: ProfileFields; profileLoaded?: boolean } = {}) => {
    await act(async () => {
      root.render(
        <ToastProvider>
          <DayClosedMoodReminder profile={props.profile ?? profile} profileLoaded={props.profileLoaded ?? true} tasks={[]} habits={[]} />
        </ToastProvider>,
      );
    });
  };
  const reminder = () => [...document.body.querySelectorAll('[role="status"]')].find(el => el.textContent?.includes('called it a day')) ?? null;
  const logButton = () => [...document.body.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Log today’s mood now');

  it('stays hidden before Call it a day, without loading the check-in', async () => {
    vi.setSystemTime(new Date(2026, 9, 21, 17, 59));
    await renderReminder();
    expect(reminder()).toBeNull();
    expect(api.fetchMoodCheckins).not.toHaveBeenCalled();
  });

  it("reminds once the day is called off and today's mood isn't logged", async () => {
    vi.setSystemTime(new Date(2026, 9, 21, 18, 0));
    await renderReminder();
    expect(api.fetchMoodCheckins).toHaveBeenCalledWith('2026-10-21', '2026-10-21', ['day']);
    expect(reminder()?.textContent).toContain('How did today feel?');
    expect(logButton()).toBeDefined();
  });

  it('opens the check-in form and is gone once the mood is logged', async () => {
    vi.setSystemTime(new Date(2026, 9, 21, 20, 0));
    await renderReminder();
    await click(logButton()!);
    expect(dialogTitle()).toBe('Daily check-in');
    await click(byText('Good'));
    await click(byText('Save check-in'));
    expect(api.saveMoodCheckin).toHaveBeenCalledWith(expect.objectContaining({ period_kind: 'day', period_start: '2026-10-21', mood: 4 }));
    expect(dialogTitle()).toBeUndefined();
    expect(reminder()).toBeNull();
  });

  it('hides when the mood is logged elsewhere', async () => {
    vi.setSystemTime(new Date(2026, 9, 21, 20, 0));
    await renderReminder();
    expect(reminder()).not.toBeNull();
    act(() => announceMoodCheckin({ kind: 'day', start: '2026-10-21', row: checkin(3, '2026-10-21') }));
    expect(reminder()).toBeNull();
  });

  it('stays hidden when the mood is already logged', async () => {
    vi.setSystemTime(new Date(2026, 9, 21, 20, 0));
    api.fetchMoodCheckins.mockResolvedValue([checkin(4, '2026-10-21')]);
    await renderReminder();
    expect(reminder()).toBeNull();
  });

  it("reminds about yesterday in the small hours after a day called off past midnight", async () => {
    vi.setSystemTime(new Date(2026, 9, 22, 1, 0));
    await renderReminder({ profile: { ...profile, dayStartTime: '09:00', shutoffTime: '00:30' } });
    expect(api.fetchMoodCheckins).toHaveBeenCalledWith('2026-10-21', '2026-10-21', ['day']);
    expect(reminder()?.textContent).toContain('How did Wednesday feel?');
  });

  it('stays hidden while daily check-ins are off, and until the profile loads', async () => {
    vi.setSystemTime(new Date(2026, 9, 21, 20, 0));
    await renderReminder({ profile: { ...profile, moodCheckins: { ...DEFAULT_MOOD_SETTINGS, daily: false } } });
    expect(reminder()).toBeNull();
    await renderReminder({ profileLoaded: false });
    expect(reminder()).toBeNull();
    expect(api.fetchMoodCheckins).not.toHaveBeenCalled();
  });
});
