// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileFields } from '@/app/hooks/useProfile';
import type { StatsData } from '@/app/types/task';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Each tile as a stub that names itself, so the test reads which tile is where.
vi.mock('@/app/components/calendar/BigPictureCalendar', () => ({ default: () => <div data-tile="TermTracker" />, BigPictureOverlay: () => null }));
vi.mock('@/app/components/calendar/CurrentMonthWidget', () => ({ default: () => <div data-tile="CurrentMonth" />, CurrentMonthOverlay: () => null }));
vi.mock('@/app/components/stats/TimersCard', () => ({ default: () => <div data-tile="Timers" />, TimersOverlay: () => null }));
vi.mock('@/app/components/stats/HabitsStatsCard', () => ({ default: () => <div data-tile="Habits" />, HabitsOverlay: () => null }));
vi.mock('@/app/components/stats/FocusTimerCard', () => ({ default: () => <div data-tile="Focus" />, FocusOverlay: () => null }));
vi.mock('@/app/components/stats/FreeTimeCard', () => ({ default: () => <div data-tile="FreeTime" />, FreeTimeOverlay: () => null }));
vi.mock('@/app/hooks/useDailyMood', () => ({ useDailyMood: () => true }));

import CalendarAndStats from './CalendarAndStats';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const stats = { total: { tasks: [] } } as unknown as StatsData;
const render = (layoutOrder: string[] | null) => act(() => root.render(
  <CalendarAndStats
    habits={[]}
    onToggleHabit={() => {}}
    onCreateHabit={() => {}}
    stats={stats}
    profile={{ layoutOrder } as unknown as ProfileFields}
    onSaveProfile={vi.fn() as never}
    calendarSettings={{} as never}
    calendarSettingsLoading={false}
  />,
));
const tiles = () => [...container.querySelectorAll('[data-tile]')].map(el => el.getAttribute('data-tile'));

describe('CalendarAndStats', () => {
  it("puts Focus in the Tasks slot and Free Time in the Notes slot", () => {
    render(null);
    expect(tiles()).toEqual(['TermTracker', 'Timers', 'Habits', 'Focus', 'FreeTime', 'CurrentMonth']);
  });

  it('keeps a layout saved with the old ids', () => {
    const saved = ['tasks', 'notes', 'calendar', 'timers', 'habits', 'reserved'];
    render(saved);
    expect(tiles()).toEqual(['Focus', 'FreeTime', 'TermTracker', 'Timers', 'Habits', 'CurrentMonth']);
  });

  it('keeps a layout saved in this browser with the old ids', () => {
    localStorage.setItem('tm-dashboard-grid-order', JSON.stringify(['notes', 'reserved', 'tasks', 'calendar', 'habits', 'timers']));
    render(null);
    expect(tiles()).toEqual(['FreeTime', 'CurrentMonth', 'Focus', 'TermTracker', 'Habits', 'Timers']);
  });
});
