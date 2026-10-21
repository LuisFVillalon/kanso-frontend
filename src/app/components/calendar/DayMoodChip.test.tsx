// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/app/context/ToastContext';
import type { MoodCheckin } from '@/app/types/mood';
import { announceMoodCheckin } from '@/app/utils/moodCheckinSync';

const api = vi.hoisted(() => ({
  fetchMoodCheckins: vi.fn(),
  saveMoodCheckin: vi.fn(),
  deleteMoodCheckin: vi.fn(),
  fetchMoodTags: vi.fn(),
}));
vi.mock('@/app/lib/backend-api', () => ({ ...api, describeError: (_: unknown, fallback: string) => fallback }));

import DayMoodChip from './DayMoodChip';

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

const render = async (date: Date) => {
  await act(async () => {
    root.render(
      <ToastProvider>
        <DayMoodChip date={date} data={undefined} totalHabits={2} />
      </ToastProvider>,
    );
  });
};

const button = (label: string) => document.body.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
const byText = (name: string) => [...document.body.querySelectorAll('button')].find(b => b.textContent?.trim() === name)!;
const click = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };
const dialogTitle = () => document.getElementById('mood-checkin-title')?.textContent;

describe('DayMoodChip', () => {
  it('logs a past day without a check-in', async () => {
    await render(new Date(2026, 9, 19));
    expect(api.fetchMoodCheckins).toHaveBeenCalledWith('2026-10-19', '2026-10-19', ['day']);
    await click(button('Log mood for Monday, October 19')!);
    expect(dialogTitle()).toBe('Daily check-in');
    await click(byText('Okay'));
    await click(byText('Save check-in'));
    expect(api.saveMoodCheckin).toHaveBeenCalledWith(expect.objectContaining({ period_start: '2026-10-19', mood: 3 }));
    expect(container.textContent).toContain('Okay');
    expect(button('Edit mood for Monday, October 19')).not.toBeNull();
  });

  it("shows a logged day's mood and edits it", async () => {
    api.fetchMoodCheckins.mockResolvedValue([checkin(5, '2026-10-19')]);
    await render(new Date(2026, 9, 19));
    expect(container.textContent).toContain('Great');
    expect(button('Log mood for Monday, October 19')).toBeNull();
    await click(button('Edit mood for Monday, October 19')!);
    expect(dialogTitle()).toBe('Edit check-in · Mon, Oct 19');
  });

  it('follows a check-in saved elsewhere in the app', async () => {
    await render(new Date(2026, 9, 21));
    expect(button('Log mood for Wednesday, October 21')).not.toBeNull();
    act(() => announceMoodCheckin({ kind: 'day', start: '2026-10-21', row: checkin(4, '2026-10-21') }));
    expect(container.textContent).toContain('Good');
    act(() => announceMoodCheckin({ kind: 'day', start: '2026-10-21', row: null }));
    expect(button('Log mood for Wednesday, October 21')).not.toBeNull();
  });

  it('has nothing for a day still to come', async () => {
    await render(new Date(2026, 9, 22));
    expect(container.textContent).toBe('');
    expect(api.fetchMoodCheckins).not.toHaveBeenCalled();
  });
});
