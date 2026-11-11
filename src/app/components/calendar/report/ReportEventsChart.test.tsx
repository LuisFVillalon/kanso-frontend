// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarActivity } from '@/app/types/activity';
import type { EventOccurrence } from '@/app/types/event';
import { buildCalendarReport, periodContaining, shiftPeriod, type ReportPeriod } from '@/app/utils/calendarReport';
import type { WorkDaySettings } from '@/app/utils/dayReport';
import ReportActivityChart from './ReportActivityChart';

vi.hoisted(() => {
  process.env.TZ = 'America/Los_Angeles';
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cs = { id: 1, name: 'CS 460', color: '#2F6FD6' };
const work = { id: 2, name: 'Work', color: '#7A5AD0' };

const occurrence = (id: number, month: number, day: number, startHour: number, endHour: number, tags: EventOccurrence['tags'] = []): EventOccurrence => {
  const date = `2026-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return {
    event_id: id, occurrence_date: date, title: `Event ${id}`, description: null, tags, all_day: false,
    date, end_date: date, start_time: null, end_time: null,
    starts_at: new Date(2026, month, day, startHour).toISOString(), ends_at: new Date(2026, month, day, endHour).toISOString(),
    time_zone: 'America/Los_Angeles', repeat_days: [], repeat_interval: 1, reminder_minutes: null,
    edited: false, past: false, archived: false,
  };
};

const activityWith = (events: EventOccurrence[], start = '2026-11-09', end = '2026-11-15'): CalendarActivity => ({
  start_date: start, end_date: end, scheduled_tasks: [], completed_tasks: [], note_sessions: [], habit_completions: [], events,
});

const workDays: WorkDaySettings = { restDays: [0, 6], dayStartTime: '09:00', shutoffTime: '17:00', dayWindows: {} };

// The week of Mon Nov 9; Monday 9–12 under CS 460, Tuesday 10–11 at Work, Thursday 9–10 untagged (still to come).
const weekEvents = [
  occurrence(1, 10, 9, 9, 12, [cs]),
  occurrence(2, 10, 10, 10, 11, [work]),
  occurrence(3, 10, 12, 9, 10),
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // Tuesday Nov 10 2026, 1 PM.
  vi.setSystemTime(new Date(2026, 10, 10, 13));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const render = async (period: ReportPeriod, activity: CalendarActivity) => {
  const { buckets } = buildCalendarReport(activity, period, []);
  await act(async () => {
    root.render(<ReportActivityChart period={period} buckets={buckets} activity={activity} workDays={workDays} />);
  });
};

const button = (name: string) => {
  const found = [...container.querySelectorAll('button')].find(b => b.textContent === name);
  if (!found) throw new Error(`no button ${name}`);
  return found;
};

const click = async (name: string) => {
  await act(async () => button(name).click());
};

const text = () => container.textContent ?? '';
const legend = () => [...container.querySelectorAll('.ml-auto span.inline-flex')].map(s => s.textContent);

describe('Activity card › Events', () => {
  it('outlines each workday’s hours and offers a chip per tag', async () => {
    await render(periodContaining('week', new Date()), activityWith(weekEvents));
    await click('Events');
    expect(button('Events').getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelectorAll('[data-testid="work-hours"]')).toHaveLength(5);
    const chips = [...container.querySelectorAll('[aria-label="Show a tag"] button')].map(b => b.textContent);
    expect(chips).toEqual(['All events', 'CS 460', 'Work', 'Untagged']);
    expect(legend()).toEqual(['In work hours', 'Outside', 'Work hours']);
    expect(container.querySelector('[data-part="in-upcoming"]')).not.toBeNull();
    expect(container.querySelector('[title^="Monday, November 9"]')?.getAttribute('title'))
      .toBe('Monday, November 9: 3h in events · 3h of 8h work hours');
    expect(container.querySelector('[title^="Saturday, November 14"]')?.getAttribute('title'))
      .toBe('Saturday, November 14: 0m in events · rest day');
  });

  it('names the most booked day', async () => {
    await render(periodContaining('week', new Date()), activityWith(weekEvents));
    await click('Events');
    expect(text()).toContain('Most booked: Mon, 3h of 8h work hours (38%)');
  });

  it('recolors the bars by a picked tag and clears it with All events', async () => {
    await render(periodContaining('week', new Date()), activityWith(weekEvents));
    await click('Events');
    await click('CS 460');
    expect(legend()).toEqual(['CS 460', 'Other events', 'Work hours']);
    expect(text()).toContain('CS 460: 3h · 60% of event time · 3h in work hours');
    expect(container.querySelector('[data-part="tag-past"]')).not.toBeNull();
    await click('All events');
    expect(legend()).toEqual(['In work hours', 'Outside', 'Work hours']);
    expect(text()).not.toContain('of event time');
  });

  it('keeps a picked tag to the period it was picked in', async () => {
    const week = periodContaining('week', new Date());
    const activity = activityWith([...weekEvents, occurrence(4, 10, 3, 10, 11, [work])], '2026-11-02', '2026-11-15');
    await render(week, activity);
    await click('Events');
    await click('Work');
    expect(text()).toContain('Work: 1h');
    await render(shiftPeriod(week, -1), activity);
    expect(button('All events').getAttribute('aria-pressed')).toBe('true');
    expect(text()).not.toContain('of event time');
  });

  it('says so when a period has no event time', async () => {
    await render(periodContaining('week', new Date()), activityWith([]));
    await click('Events');
    expect(text()).toContain('No time in events in this period');
    expect(legend()).toEqual(['In work hours', 'Outside', 'Work hours']);
    expect(container.querySelector('[aria-label="Show a tag"]')).toBeNull();
  });

  it('counts a year’s busy months in round 50-hour ticks', async () => {
    // 130 hours of events in March, under months of ~170 work hours.
    const events = Array.from({ length: 13 }, (_, i) => occurrence(10 + i, 2, i + 2, 8, 18));
    await render(periodContaining('year', new Date()), activityWith(events, '2026-01-01', '2026-12-31'));
    await click('Events');
    const ticks = [...container.querySelectorAll('.tabular-nums')].map(t => t.textContent);
    expect(ticks).toEqual(['0', '50h', '100h', '150h', '200h']);
  });
});
