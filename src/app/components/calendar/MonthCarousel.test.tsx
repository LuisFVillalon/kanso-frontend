// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MoodCheckin, MoodPeriodKind } from '@/app/types/mood';
import { announceMoodCheckin } from '@/app/utils/moodCheckinSync';

const api = vi.hoisted(() => ({ fetchMoodCheckins: vi.fn() }));
vi.mock('@/app/lib/backend-api', () => api);

import MonthCarousel from './MonthCarousel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const checkin = (mood: number, date: string, kind: MoodPeriodKind = 'day'): MoodCheckin => ({
  id: 3, period_kind: kind, period_start: date, mood, energy: null, stress: null,
  workload: null, highlight: null, progress: null, word: null, note: null, tags: [],
  created_at: '2026-10-19T22:00:00Z', updated_at: '2026-10-19T22:00:00Z',
});

const render = (month: number) => act(async () => root.render(
  <MonthCarousel
    year={2026}
    month={month}
    onChangeMonth={() => {}}
    dayData={new Map()}
    todayStr="2026-10-21"
    onSelectDay={() => {}}
    selectedDate={null}
    onNavigate={() => {}}
  />,
));
const cell = (date: string) => container.querySelector<HTMLButtonElement>(`button[data-date="${date}"]`)!;
const face = (date: string) => cell(date).querySelector<HTMLElement>('[data-mood-face]');
const announce = (date: string, row: MoodCheckin | null, kind: MoodPeriodKind = 'day') =>
  act(() => announceMoodCheckin({ kind, start: date, row }));

beforeEach(() => {
  api.fetchMoodCheckins.mockReset().mockResolvedValue([]);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('MonthCarousel moods', () => {
  it("shows each day's daily check-in as its face and names it for screen readers", async () => {
    api.fetchMoodCheckins.mockResolvedValue([checkin(4, '2026-10-14')]);
    await render(9);

    expect(api.fetchMoodCheckins).toHaveBeenCalledWith('2026-10-01', '2026-10-31', ['day']);
    expect(face('2026-10-14')!.style.color).toBe('var(--tm-mood-4)');
    expect(cell('2026-10-14').getAttribute('aria-label')).toContain('Mood: Good');
  });

  it('shows nothing on a day without a daily check-in', async () => {
    api.fetchMoodCheckins.mockResolvedValue([checkin(4, '2026-10-14')]);
    await render(9);

    expect(face('2026-10-15')).toBeNull();
    expect(cell('2026-10-15').getAttribute('aria-label')).not.toContain('Mood');
  });

  it('does not put weekly or monthly check-ins on a day', async () => {
    api.fetchMoodCheckins.mockResolvedValue([checkin(2, '2026-10-12', 'week'), checkin(3, '2026-10-01', 'month')]);
    await render(9);
    announce('2026-10-19', checkin(5, '2026-10-19', 'week'), 'week');

    expect(container.querySelector('[data-mood-face]')).toBeNull();
  });

  it('follows a log, an edit and a delete without reloading', async () => {
    await render(9);
    expect(face('2026-10-14')).toBeNull();

    announce('2026-10-14', checkin(2, '2026-10-14'));
    expect(face('2026-10-14')!.style.color).toBe('var(--tm-mood-2)');

    announce('2026-10-14', checkin(5, '2026-10-14'));
    expect(face('2026-10-14')!.style.color).toBe('var(--tm-mood-5)');
    expect(cell('2026-10-14').getAttribute('aria-label')).toContain('Mood: Great');

    announce('2026-10-14', null);
    expect(face('2026-10-14')).toBeNull();
    expect(api.fetchMoodCheckins).toHaveBeenCalledTimes(1);
  });

  it('keeps a save made while the month is still loading', async () => {
    let answer: (rows: MoodCheckin[]) => void = () => {};
    api.fetchMoodCheckins.mockReturnValue(new Promise<MoodCheckin[]>(resolve => { answer = resolve; }));
    await render(9);

    announce('2026-10-14', checkin(5, '2026-10-14'));
    announce('2026-10-15', null);
    await act(async () => answer([checkin(1, '2026-10-14'), checkin(3, '2026-10-15')]));

    expect(face('2026-10-14')!.style.color).toBe('var(--tm-mood-5)');
    expect(face('2026-10-15')).toBeNull();
  });

  it('loads the month it pages to and ignores a late answer for the last one', async () => {
    let answerOctober: (rows: MoodCheckin[]) => void = () => {};
    api.fetchMoodCheckins.mockReturnValueOnce(new Promise<MoodCheckin[]>(resolve => { answerOctober = resolve; }));
    await render(9);

    api.fetchMoodCheckins.mockResolvedValueOnce([checkin(3, '2026-11-02')]);
    await render(10);
    await act(async () => answerOctober([checkin(1, '2026-11-02')]));

    expect(api.fetchMoodCheckins).toHaveBeenLastCalledWith('2026-11-01', '2026-11-30', ['day']);
    expect(face('2026-11-02')!.style.color).toBe('var(--tm-mood-3)');
  });

  it('shows no faces when the check-ins cannot load', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    api.fetchMoodCheckins.mockRejectedValue(new Error('down'));
    await render(9);

    expect(container.querySelector('[data-mood-face]')).toBeNull();
    expect(cell('2026-10-14')).not.toBeNull();
    error.mockRestore();
  });
});
