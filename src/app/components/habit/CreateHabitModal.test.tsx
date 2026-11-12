// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NewHabit } from '@/app/types/task';

// Usual-time suggestions read the calendar: an empty Wed–Tue with one Friday shift.
vi.mock('@/app/lib/backend-api', () => ({
  fetchCalendarActivity: vi.fn(async (start: string, end: string) => ({
    start_date: start, end_date: end, scheduled_tasks: [], completed_tasks: [], note_sessions: [], habit_completions: [],
    events: [{
      event_id: 1, occurrence_date: '2026-11-13', title: 'Shift at the library', description: null, tags: [], all_day: false,
      date: '2026-11-13', end_date: '2026-11-13', start_time: '08:00:00', end_time: '13:00:00', starts_at: '', ends_at: '',
      time_zone: 'UTC', repeat_days: [], repeat_interval: 1, reminder_minutes: null, edited: false, past: false, archived: false,
    }],
  })),
  describeError: (_: unknown, fallback: string) => fallback,
}));

import CreateHabitModal from './CreateHabitModal';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let latest: NewHabit;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 11, 11, 20)); // Wed Nov 11 2026
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
  vi.useRealTimers();
});

function Harness({ initial }: { initial: NewHabit }) {
  const [habit, setHabit] = useState(initial);
  const change = (next: NewHabit) => { latest = next; setHabit(next); };
  return (
    <CreateHabitModal isOpen onClose={() => {}} newHabit={habit} onHabitChange={change} onSubmit={e => e.preventDefault()}
      availableTags={[]} allTasks={[]} habits={[]} />
  );
}

const render = async (initial: NewHabit) => {
  latest = initial;
  await act(async () => root.render(<Harness initial={initial} />));
};

const text = () => document.body.textContent ?? '';
const chips = () => [...document.body.querySelectorAll<HTMLButtonElement>('[role="group"] button')];

const setGoal = async (value: string) => {
  const input = document.body.querySelector('input[type="number"]') as HTMLInputElement;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setValue.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('CreateHabitModal', () => {
  it('hides the usual time while there is no daily time goal (an all-day habit)', async () => {
    await render({ title: 'Stretch', tags: [], estimated_time: null });
    expect(text()).not.toContain('Usual time');
    expect(chips()).toEqual([]);
    expect(latest.planned_time).toBeUndefined();
  });

  it('suggests usual times free on most of the next work days once a goal is set, and picks the best', async () => {
    await render({ title: 'Read', tags: [], estimated_time: null });
    await setGoal('0.5');
    // The default work day is 8 AM – 10 PM; Friday's shift takes the morning.
    expect(chips().map(c => c.textContent)).toEqual(['1:00 PM', '3:00 PM', '5:00 PM', 'Other…', 'No set time']);
    expect(latest.planned_time).toBe('13:00');
    await act(async () => chips()[1].click());
    expect(text()).toContain('3:00 PM is free on 5 of your next 5 work days.');
    expect(latest.planned_time).toBe('15:00');
  });
});
