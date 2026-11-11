// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityTask, CalendarActivity } from '@/app/types/activity';
import type { MoodCheckin } from '@/app/types/mood';
import { periodContaining } from '@/app/utils/calendarReport';
import ReportWeekGlance, { bestAndHardest, describeChange } from './ReportWeekGlance';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // Tuesday Nov 10: the current week is Nov 9–15, and last week Nov 2–8.
  vi.setSystemTime(new Date(2026, 10, 10, 20, 0));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const day = (period_start: string, mood: number, energy: number | null = null, stress: number | null = null, tags: string[] = []): MoodCheckin => ({
  id: 1, period_kind: 'day', period_start, mood, energy, stress,
  workload: null, highlight: null, progress: null, word: null, note: null, tags,
  created_at: `${period_start}T20:00:00Z`, updated_at: `${period_start}T20:00:00Z`,
});

const weekly = (period_start: string, overrides: Partial<MoodCheckin> = {}): MoodCheckin => ({
  ...day(period_start, 4), period_kind: 'week', energy: null, stress: null, workload: 1, highlight: 'Finished the outline early', ...overrides,
});

const gym = { id: 1, name: 'Gym', color: '#4fb286' };
const work = { id: 2, name: 'Work', color: '#e0894a' };
const task = (id: number, date: Date, tags = [gym]): ActivityTask => ({
  id, title: 'Task', category: null, priority: null, due_date: null, due_time: null, estimated_time: null,
  completed: true, completed_date: date.toISOString(), parent_task_id: null, tags,
});
const activity = (completed_tasks: ActivityTask[] = []): CalendarActivity => ({
  start_date: '2026-11-02', end_date: '2026-11-08', scheduled_tasks: [], completed_tasks, note_sessions: [], habit_completions: [],
});

// Nov 2–8 with six check-ins and Wed Nov 4 empty.
const FULL = [
  day('2026-11-02', 2, 1, 4, ['Slept well', 'Exercised']),
  day('2026-11-03', 4, 2, 1, ['Social']),
  day('2026-11-05', 3, 2, 3),
  day('2026-11-06', 3, 3, 2),
  day('2026-11-07', 4, 5, 4),
  day('2026-11-08', 2, 2, 4),
];

const weekOf = (date: Date) => periodContaining('week', date);

interface Options {
  date?: Date;
  checkins?: MoodCheckin[];
  weeks?: MoodCheckin[];
  tasks?: ActivityTask[];
  weeklyOn?: boolean;
  month?: Date;
}

const render = ({ date = new Date(2026, 10, 4), checkins = FULL, weeks = [], tasks = [], weeklyOn = true, month }: Options = {}) => {
  const period = weekOf(date);
  const props = {
    onDay: vi.fn(),
    onWeek: vi.fn(),
    onMonth: vi.fn(),
  };
  act(() => {
    root.render(
      <ReportWeekGlance
        period={period}
        byDay={new Map(checkins.map(c => [c.period_start, c]))}
        weeks={weeks}
        activity={activity(tasks)}
        settings={{ weekly: weeklyOn, monthly: false }}
        scopeLabel="last week"
        month={month ?? period.end}
        {...props}
      />,
    );
  });
  return props;
};

const text = () => container.textContent ?? '';
const button = (pattern: RegExp) => [...container.querySelectorAll('button')].find(b => pattern.test(b.getAttribute('aria-label') ?? b.textContent ?? ''));
const click = (el: Element | undefined) => act(() => { (el as HTMLElement).click(); });

/** Check-ins on the first `n` days of October 2026, for the month link's counts. */
const october = (n: number) => Array.from({ length: n }, (_, i) => day(`2026-10-${String(i + 1).padStart(2, '0')}`, 3, 3, 3));

describe('ReportWeekGlance', () => {
  it('shows the average and how many days were logged', () => {
    render();
    expect(text()).toContain('How your week felt');
    expect(text()).toContain('6 days with a check-in last week');
    expect(text()).toContain('Okay 3.0');
    expect(text()).toContain('average · 6 of 7 days logged');
  });

  it('counts only the days so far in the current week', () => {
    render({ date: new Date(2026, 10, 10), checkins: [...FULL, day('2026-11-09', 4, 2, 4), day('2026-11-10', 3, 1, 2)] });
    expect(text()).toContain('average · 2 of 2 days logged');
    expect(text()).toContain('vs last week, so far');
    expect(text()).toContain('Best and hardest day show once the week has 3 check-ins.');
    // Wednesday on is still ahead: no button, no Log.
    expect(button(/^Tue Nov 10: Okay\. Open check-in$/)).toBeDefined();
    expect(button(/^Wed Nov 11/)).toBeUndefined();
  });

  it('compares mood, energy and stress with last week', () => {
    render({
      checkins: [
        ...FULL,
        // Oct 26–Nov 1: mood 3.0, energy 3.0, stress 3.2.
        day('2026-10-26', 3, 3, 3), day('2026-10-27', 3, 3, 4), day('2026-10-28', 3, 3, 3), day('2026-10-29', 3, 3, 3), day('2026-10-30', 3, 3, 3),
      ],
    });
    expect(text()).toContain('vs last week');
    expect(text()).not.toContain('vs last week, so far');
    expect(text()).toContain('Mood 3.0 · same as 3.0');
    expect(text()).toContain('Energy 2.5 · −0.5 from 3.0');
    expect(text()).toContain('Stress 3.0 · −0.2 from 3.2');
  });

  it('hides the comparison when last week has no daily check-ins', () => {
    render();
    expect(text()).not.toContain('vs last week');
  });

  it('describes changes from the values it shows', () => {
    expect(describeChange(3.04, 3.0)).toBe('same as 3.0');
    expect(describeChange(3.26, 3.0)).toBe('+0.3 from 3.0');
    expect(describeChange(2.8, 3.2)).toBe('−0.4 from 3.2');
  });

  it('picks the best and hardest day, with their tags and moments', () => {
    render({ tasks: [task(1, new Date(2026, 10, 3, 12), [gym, work]), task(2, new Date(2026, 10, 3, 15), [gym])] });
    expect(text()).toContain('Best day');
    // Tue 3 and Sat 7 are both Good; Tue's stress is lower.
    expect(text()).toContain('Tue 3 · Good, low energy, calm stress');
    expect(text()).toContain('Gym ×2');
    expect(text()).toContain('Social');
    // Mon 2 and Sun 8 are both Low; Mon's energy is lower.
    expect(text()).toContain('Hardest day');
    expect(text()).toContain('Mon 2 · Low, drained energy, high stress');
    expect(text()).toContain('Slept well');
  });

  it('breaks ties on the earlier day, and never names the same day twice', () => {
    const rows = (moods: number[]) => moods.map((mood, i) => ({ date: `2026-11-0${i + 2}`, checkin: day(`2026-11-0${i + 2}`, mood, 3, 3) }));
    expect(bestAndHardest(rows([4, 2, 4, 2]))).toEqual({ best: '2026-11-02', hardest: '2026-11-03' });
    expect(bestAndHardest(rows([3, 3, 3]))).toEqual({ best: '2026-11-02', hardest: null });
    expect(bestAndHardest(rows([3, 3]))).toBeNull();
  });

  it('shows only the best day when every logged day had the same mood', () => {
    render({ checkins: [day('2026-11-02', 3, 2, 2), day('2026-11-03', 3, 2, 1), day('2026-11-04', 3, 2, 3)] });
    expect(text()).toContain('Best day');
    expect(text()).toContain('Tue 3 · Okay');
    expect(text()).not.toContain('Hardest day');
  });

  it('opens a logged day, logs an empty one, and leaves the future alone', () => {
    const props = render();
    click(button(/^Mon Nov 2: Low\. Open check-in$/));
    expect(props.onDay).toHaveBeenCalledWith('2026-11-02', FULL[0]);
    click(button(/^Wed Nov 4: no check-in\. Log this day$/));
    expect(props.onDay).toHaveBeenCalledWith('2026-11-04', null);
  });

  it('with only a weekly check-in, offers to log every day', () => {
    const props = render({ checkins: [], weeks: [weekly('2026-11-02')] });
    expect(text()).toContain('No daily check-ins last week');
    expect(text()).toContain('Tap a day to log it, even after the fact.');
    expect(text()).not.toContain('Best and hardest');
    expect([...container.querySelectorAll('button')].filter(b => /Log this day$/.test(b.getAttribute('aria-label') ?? ''))).toHaveLength(7);
    click(button(/^Your weekly check-in: Good/));
    expect(props.onWeek).toHaveBeenCalledWith('2026-11-02', expect.objectContaining({ period_kind: 'week' }));
  });

  it('shows the weekly check-in, or a way to log it, or nothing when weekly check-ins are off', () => {
    render({ weeks: [weekly('2026-11-02')] });
    expect(text()).toContain('Your weekly check-in');
    expect(text()).toContain('workload about right');
    expect(text()).toContain('Best part: “Finished the outline early”');

    const props = render();
    expect(text()).toContain('None for this week.');
    click(button(/^Log this week$/));
    expect(props.onWeek).toHaveBeenCalledWith('2026-11-02', null);

    render({ date: new Date(2026, 10, 10), checkins: [], weeks: [] });
    expect(text()).toContain('None yet this week.');

    render({ weeklyOn: false });
    expect(text()).not.toContain('Your weekly check-in');
  });

  it('links to a month with enough check-ins for patterns', () => {
    const props = render({ date: new Date(2026, 9, 21), checkins: october(12), month: new Date(2026, 9, 25) });
    expect(text()).toContain('A week is too short to say what goes with your mood. October has 12 days with a check-in.');
    expect(button(/’s patterns$/)).toBeUndefined();
    click(button(/^See October/));
    expect(props.onMonth).toHaveBeenCalledWith(new Date(2026, 9, 25));
  });

  it('also links to the month before while the week’s month is thin', () => {
    const props = render({ date: new Date(2026, 10, 10), checkins: [...october(12), day('2026-11-02', 3), day('2026-11-09', 4)], month: new Date(2026, 10, 10) });
    expect(text()).toContain('November has 2 days with a check-in so far; its patterns fill in after about 10, and October’s are ready now.');
    click(button(/^See November/));
    expect(props.onMonth).toHaveBeenCalledWith(new Date(2026, 10, 10));
    click(button(/^October’s patterns$/));
    expect(props.onMonth).toHaveBeenCalledWith(new Date(2026, 9, 1));
  });

  it('links only the week’s month when the month before is thin too', () => {
    render({ date: new Date(2026, 10, 10), checkins: [...october(4), day('2026-11-09', 4)], month: new Date(2026, 10, 10) });
    expect(text()).toContain('November has 1 day with a check-in so far; its patterns fill in after about 10.');
    expect(button(/^See November/)).toBeDefined();
    expect(button(/’s patterns$/)).toBeUndefined();
  });
});
