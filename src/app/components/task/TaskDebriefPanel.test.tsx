// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/app/context/ToastContext';
import { NotificationsContext, type NotificationsContextValue } from '@/app/context/NotificationsContextValue';
import type { ProfileFields } from '@/app/hooks/useProfile';
import type { DailyDebriefReport } from '@/app/types/debrief';
import type { Task } from '@/app/types/task';
import type { EventOccurrence } from '@/app/types/event';
import { notifyEventsChanged } from '@/app/hooks/useEventsVersion';
import { DEFAULT_MOOD_SETTINGS, type MoodCheckin } from '@/app/types/mood';

const api = vi.hoisted(() => ({
  fetchTaskDebrief: vi.fn(),
  fetchMoodCheckins: vi.fn(),
  saveMoodCheckin: vi.fn(),
  deleteMoodCheckin: vi.fn(),
  fetchMoodTags: vi.fn(),
}));
vi.mock('@/app/lib/backend-api', () => ({ ...api, describeError: (_: unknown, fallback: string) => fallback }));

import TaskDebriefPanel from './TaskDebriefPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const checkin = (mood: number, date = '2026-10-24'): MoodCheckin => ({
  id: 7, period_kind: 'day', period_start: date, mood, energy: null, stress: null,
  workload: null, highlight: null, progress: null, word: null, note: null, tags: [],
  created_at: '2026-10-24T15:00:00Z', updated_at: '2026-10-24T15:00:00Z',
});

const debrief: DailyDebriefReport = {
  report_date: '2026-10-24',
  overdue_tasks: [],
  due_today_tasks: [],
  completed_today_tasks: [],
  notes_worked_today: [],
  habit_status: [],
  workload: { is_rest_day: true, available_minutes: null, committed_minutes: 0, utilization_pct: null, is_overcommitted: false },
  focus_next: [],
};

const profile = {
  dayStartTime: '08:00',
  shutoffTime: '18:00',
  restDays: [0, 6],
  dailyBriefCollapsed: null,
  moodCheckins: DEFAULT_MOOD_SETTINGS,
} as unknown as ProfileFields;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // A Saturday (a rest day) morning, long before "Call it a day".
  vi.setSystemTime(new Date(2026, 9, 24, 10, 0));
  localStorage.clear();
  api.fetchTaskDebrief.mockResolvedValue(debrief);
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

/** The notification settings as far as daily mood reads them; null renders outside the provider. */
const notificationsWith = (
  preferences: { types: Record<string, boolean> } | null,
  status: NotificationsContextValue['status'] = 'ready',
) => ({ status, preferences, preferencesError: false }) as unknown as NotificationsContextValue;

const render = async (
  props: Partial<React.ComponentProps<typeof TaskDebriefPanel>> = {},
  notifications: NotificationsContextValue | null = null,
) => {
  const panel = (
    <TaskDebriefPanel
      profile={profile}
      profileLoaded
      onSaveProfile={vi.fn(async () => ({ ok: true }))}
      tasks={[]}
      habits={[]}
      completionSyncToken={0}
      {...props}
    />
  );
  await act(async () => {
    root.render(
      <ToastProvider>
        {notifications ? <NotificationsContext.Provider value={notifications}>{panel}</NotificationsContext.Provider> : panel}
      </ToastProvider>,
    );
  });
};

const text = () => document.body.textContent ?? '';
const button = (name: string) =>
  [...document.body.querySelectorAll('button')].find(b => b.textContent?.trim() === name || b.getAttribute('aria-label') === name)!;
const click = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };
const dialogTitle = () => document.getElementById('mood-checkin-title')?.textContent;

const cardWithHeading = (heading: string) =>
  [...document.body.querySelectorAll('span')].find(el => el.textContent === heading)?.closest('.rounded-md');
const activityLogCard = () => cardWithHeading("Today's Activity Log");
const focusNextCard = () => cardWithHeading('Focus Next');

describe('TaskDebriefPanel mood chip', () => {
  it("offers to log today's mood at any time, even on a rest day", async () => {
    await render();
    expect(api.fetchMoodCheckins).toHaveBeenCalledWith('2026-10-24', '2026-10-24', ['day']);
    await click(button('Log today’s mood'));
    expect(dialogTitle()).toBe('Daily check-in');
  });

  it('logs the day and then offers Edit in its place', async () => {
    await render();
    await click(button('Log today’s mood'));
    await click(button('Good'));
    await click(button('Save check-in'));
    expect(api.saveMoodCheckin).toHaveBeenCalledWith(expect.objectContaining({ period_kind: 'day', period_start: '2026-10-24', mood: 4 }));
    expect(dialogTitle()).toBeUndefined();
    expect(text()).toContain('Today’s mood: Good');
    expect(button('Log today’s mood')).toBeUndefined();
    expect(button('Edit today’s mood')).toBeDefined();
  });

  it('opens the saved check-in prefilled to edit it', async () => {
    api.fetchMoodCheckins.mockResolvedValue([checkin(2)]);
    await render();
    expect(text()).toContain('Today’s mood: Low');
    await click(button('Edit today’s mood'));
    expect(dialogTitle()).toBe('Edit check-in · Sat, Oct 24');
    expect(document.querySelector('[role="radio"][aria-label="Low"]')?.getAttribute('aria-checked')).toBe('true');
  });

  it("sits in Today's Activity Log's header while the brief is open", async () => {
    await render();
    expect(activityLogCard()?.contains(button('Log today’s mood'))).toBe(true);
    expect(focusNextCard()?.contains(button('Log today’s mood'))).toBe(false);
  });

  it("sits in Today's Activity Log's header on a work day, beside Overcommitted", async () => {
    api.fetchTaskDebrief.mockResolvedValue({
      ...debrief,
      completed_today_tasks: [{ id: 1, title: 'Draft', priority: null, due_date: null, due_time: null, category: null, estimated_time: 2, tags: [] }],
      workload: { is_rest_day: false, available_minutes: 60, committed_minutes: 120, utilization_pct: 200, is_overcommitted: true },
    });
    await render();
    const card = activityLogCard()!;
    expect(card.textContent).toContain('Overcommitted');
    expect(card.contains(button('Log today’s mood'))).toBe(true);
    expect(focusNextCard()?.contains(button('Log today’s mood'))).toBe(false);
  });

  it("still shows Today's Activity Log on a rest day, with a gentle reminder and no capacity", async () => {
    api.fetchTaskDebrief.mockResolvedValue({
      ...debrief,
      completed_today_tasks: [{ id: 1, title: 'Draft', priority: null, due_date: null, due_time: null, category: null, estimated_time: 2, tags: [{ id: 1, name: 'Writing', color: null }] }],
      workload: { is_rest_day: true, available_minutes: 60, committed_minutes: 0, utilization_pct: null, is_overcommitted: false },
    });
    await render();
    const card = activityLogCard()!.textContent ?? '';
    expect(card).toContain('Today is a rest day. Take it easy; anything you do still shows here.');
    expect(card).toContain('Writing');
    expect(card).not.toContain('capacity');
    expect(card).not.toContain('Overcommitted');
    expect(text()).not.toContain('no workload scheduled');
  });

  it('shows no rest-day reminder on a work day', async () => {
    api.fetchTaskDebrief.mockResolvedValue({
      ...debrief,
      workload: { is_rest_day: false, available_minutes: 480, committed_minutes: 0, utilization_pct: 0, is_overcommitted: false },
    });
    await render();
    expect(activityLogCard()?.textContent).not.toContain('rest day');
  });

  it('is hidden while the brief is collapsed, and shows once it opens', async () => {
    await render({ profile: { ...profile, dailyBriefCollapsed: true } });
    expect(button('Log today’s mood')).toBeUndefined();
    expect(text()).not.toContain('mood');
    await click(document.querySelector('h2')!.closest('button')!);
    expect(activityLogCard()?.contains(button('Log today’s mood'))).toBe(true);
  });

  it('is not shown when the brief fails to load', async () => {
    api.fetchTaskDebrief.mockRejectedValue(new Error('Brief unavailable'));
    await render();
    expect(text()).toContain('Brief unavailable');
    expect(button('Log today’s mood')).toBeUndefined();
  });

  it('keeps an open check-in form while the brief refreshes', async () => {
    await render();
    await click(button('Log today’s mood'));
    await click(button('Good'));
    api.fetchTaskDebrief.mockReturnValue(new Promise(() => {}));
    await render({ completionSyncToken: 1 });
    expect(api.fetchTaskDebrief).toHaveBeenCalledTimes(2);
    expect(dialogTitle()).toBe('Daily check-in');
    expect(document.querySelector('[role="radio"][aria-label="Good"]')?.getAttribute('aria-checked')).toBe('true');
    expect(activityLogCard()?.contains(button('Log today’s mood'))).toBe(true);
  });

  it('keeps the last brief and an open check-in form when a refresh fails', async () => {
    await render();
    await click(button('Log today’s mood'));
    await click(button('Good'));
    api.fetchTaskDebrief.mockRejectedValue(new Error('Brief unavailable'));
    await render({ completionSyncToken: 1 });
    expect(text()).toContain('Brief unavailable');
    expect(dialogTitle()).toBe('Daily check-in');
    expect(document.querySelector('[role="radio"][aria-label="Good"]')?.getAttribute('aria-checked')).toBe('true');
    expect(activityLogCard()?.contains(button('Log today’s mood'))).toBe(true);
  });

  it('is hidden while the mood check-in reminder is off, and until it and the profile load', async () => {
    await render({}, notificationsWith({ types: { mood_reminder: false } }));
    expect(button('Log today’s mood')).toBeUndefined();
    await render({}, notificationsWith(null, 'loading'));
    expect(button('Log today’s mood')).toBeUndefined();
    await render({ profileLoaded: false });
    expect(button('Log today’s mood')).toBeUndefined();
    expect(api.fetchMoodCheckins).not.toHaveBeenCalled();
    await render({}, notificationsWith({ types: { mood_reminder: true } }));
    expect(button('Log today’s mood')).toBeDefined();
  });

  it('shows nothing it could act on when the check-in fails to load', async () => {
    api.fetchMoodCheckins.mockRejectedValue(new Error('offline'));
    await render();
    expect(button('Log today’s mood')).toBeUndefined();
    expect(button('Edit today’s mood')).toBeUndefined();
  });

  it('keeps mood out of the AI brief request', async () => {
    await render();
    expect(api.fetchTaskDebrief).toHaveBeenCalledWith();
  });
});

describe('TaskDebriefPanel Slipped actions', () => {
  const slippedTask = {
    id: 5, title: 'File taxes', description: null, due_date: '2026-10-22', due_time: '17:00:00',
    priority: null, category: null, completed: false, completed_date: null, tags: [],
    created_date: '2026-10-01T00:00:00', estimated_time: null, parent_task_id: null, position: null,
  } as unknown as Task;
  const slippedDebrief: DailyDebriefReport = {
    ...debrief,
    overdue_tasks: [{
      id: 5, title: 'File taxes', category: null, priority: null,
      due_date: '2026-10-22', due_time: '17:00:00', estimated_time: null, tags: [],
    }],
  };
  const actions = () => ({
    onArchiveTask: vi.fn(async () => true),
    onDeleteTask: vi.fn(async () => true),
    onUpdateTask: vi.fn(async () => true),
  });
  const input = (label: string) => document.body.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;

  beforeEach(() => { api.fetchTaskDebrief.mockResolvedValue(slippedDebrief); });

  it('archives a slipped task and drops it from the list at once', async () => {
    const a = actions();
    await render({ tasks: [slippedTask], ...a });
    await click(button('Archive “File taxes”'));
    expect(a.onArchiveTask).toHaveBeenCalledWith(slippedTask, undefined);
    expect(text()).toContain('Nothing slipped.');
  });

  it('deletes a slipped task, and puts it back if the delete fails', async () => {
    const a = { ...actions(), onDeleteTask: vi.fn(async () => false) };
    await render({ tasks: [slippedTask], ...a });
    await click(button('Delete “File taxes”'));
    expect(a.onDeleteTask).toHaveBeenCalledWith(slippedTask, undefined);
    expect(text()).toContain('File taxes');
  });

  it('asks about linked tasks before deleting a task that has them', async () => {
    const a = actions();
    const child = { ...slippedTask, id: 6, title: 'Find W-2', parent_task_id: 5, due_date: null, due_time: null } as Task;
    await render({ tasks: [slippedTask, child], ...a });
    await click(button('Delete “File taxes”'));
    expect(a.onDeleteTask).not.toHaveBeenCalled();
    expect(text()).toContain('Find W-2');
  });

  it('reschedules with a quick pick and leaves Slipped', async () => {
    const a = actions();
    await render({ tasks: [slippedTask], ...a });
    await click(button('Change due date and time for “File taxes”'));
    await click(button('Tomorrow'));
    expect(a.onUpdateTask).toHaveBeenCalledWith(5, expect.objectContaining({ due_date: '2026-10-25', due_time: '09:00' }));
    expect(api.fetchTaskDebrief).toHaveBeenCalledTimes(2);
    expect(text()).toContain('Nothing slipped.');
  });

  it('reschedules to a custom date and time', async () => {
    const a = actions();
    await render({ tasks: [slippedTask], ...a });
    await click(button('Change due date and time for “File taxes”'));
    expect(input('New due date').value).toBe('2026-10-22');
    expect(input('New due time').value).toBe('17:00');
    await act(async () => {
      for (const [label, value] of [['New due date', '2026-10-30'], ['New due time', '08:15']]) {
        const el = input(label);
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await click(button('Save'));
    expect(a.onUpdateTask).toHaveBeenCalledWith(5, expect.objectContaining({ due_date: '2026-10-30', due_time: '08:15' }));
  });

  it('shows no actions without the handlers', async () => {
    await render({ tasks: [slippedTask] });
    expect(button('Archive “File taxes”')).toBeUndefined();
  });
});

describe('TaskDebriefPanel events', () => {
  const tag = (id: number, name: string, color: string) => ({ id, name, color });
  const cs = tag(1, 'CS 460', '#8b5cf6');
  const art = tag(2, 'Art', '#ec4899');
  const health = tag(3, 'Health', '#22c55e');
  const event = (title: string, start: string, end: string, tags: { id: number; name: string; color: string }[], extra: Partial<EventOccurrence> = {}): EventOccurrence => ({
    event_id: title.length, occurrence_date: '2026-10-23', title, description: null, tags, all_day: false,
    date: '2026-10-23', end_date: '2026-10-23', start_time: `${start}:00`, end_time: `${end}:00`,
    starts_at: `2026-10-23T${start}:00Z`, ends_at: `2026-10-23T${end}:00Z`, time_zone: 'America/Los_Angeles',
    repeat_days: [1, 3, 5], repeat_interval: 1, reminder_minutes: null, edited: false, past: false, archived: false,
    ...extra,
  });
  const gym = event('Gym', '07:00', '08:00', [health], { past: true });
  const lecture = event('CS 460 Lecture', '10:00', '10:50', [cs], { past: true });
  const yoga = event('Yoga', '09:00', '09:30', [health], { past: true, archived: true });
  const studio = event('ART 157 Studio', '13:00', '15:50', [art]);
  const prescription = {
    id: 9, title: 'Pick up prescription', category: null, priority: null,
    due_date: '2026-10-23', due_time: '13:00:00', estimated_time: 1, tags: [],
  };

  // Friday 11:40 AM, in a 10-hour work window (8 AM – 6 PM).
  const workday: DailyDebriefReport = {
    ...debrief,
    report_date: '2026-10-23',
    due_today_tasks: [prescription],
    workload: {
      is_rest_day: false, window_minutes: 600, event_minutes: 220, available_minutes: 380,
      committed_minutes: 60, free_minutes: 320, utilization_pct: 15.8, is_overcommitted: false,
    },
    events_today: [gym, yoga, lecture, studio],
    passed_events_today: [gym, lecture],
    event_minutes_by_tag: [
      { tag: art, minutes: 170, count: 1 }, { tag: health, minutes: 60, count: 1 }, { tag: cs, minutes: 50, count: 1 },
    ],
    passed_event_minutes_by_tag: [{ tag: health, minutes: 60, count: 1 }, { tag: cs, minutes: 50, count: 1 }],
  };

  const scheduleCard = () => document.querySelector('[data-brief-schedule]');

  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 9, 23, 11, 40));
    api.fetchTaskDebrief.mockResolvedValue(workday);
  });

  it("shows today's schedule under the Activity Log: what's next, the free time and the clashes", async () => {
    await render();
    const card = scheduleCard()!;
    expect(card).not.toBeNull();
    expect(activityLogCard()!.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.textContent).toContain('Next: ART 157 Studio at 1 PM · in 1h 20m');
    // The archived yoga class is drawn but left out of the counts.
    expect(card.querySelectorAll('[data-schedule-event]')).toHaveLength(4);
    expect(card.textContent).toContain('3 events · 4h 40m');
    expect(card.textContent).toContain('5h 20m free in your work window after events and tasks due');
    expect(card.textContent).toContain('Pick up prescription is due at 1:00 PM, during ART 157 Studio. Do it before 1 PM or after 3:50 PM.');
    expect(card.textContent).toContain('Gym (7:00 – 8:00 AM) is outside your work window, so it doesn’t count against today’s capacity.');
    expect(card.querySelector('[data-work-window]')).not.toBeNull();
    expect(card.querySelector('[data-schedule-now]')).not.toBeNull();
  });

  it("lists only the events that start today, all-day first, with its time, tags and whether it has passed", async () => {
    const fair = event('Career fair', '00:00', '00:00', [cs], { all_day: true, start_time: null, end_time: null });
    api.fetchTaskDebrief.mockResolvedValue({ ...workday, events_today: [gym, yoga, lecture, studio, fair] });
    await render();
    const rows = [...scheduleCard()!.querySelectorAll('[data-schedule-row]')].map(r => r.textContent);
    expect(rows).toEqual([
      'All dayCareer fairCS 460',
      '7:00 – 8:00 AMGymHealthPassed',
      '9:00 – 9:30 AMYogaHealthArchived',
      '10:00 – 10:50 AMCS 460 LectureCS 460Passed',
      '1:00 – 3:50 PMART 157 StudioArtUpcoming',
    ]);
    vi.setSystemTime(new Date(2026, 9, 23, 14, 0));
    await render({ completionSyncToken: 1 });
    expect(scheduleCard()!.querySelectorAll('[data-schedule-row]')[4].textContent).toContain('Now');
  });

  it("leaves last night's event past midnight out of the schedule, the Activity Log and the time allocation", async () => {
    const stars = event('Stargazing club', '22:00', '01:00', [tag(4, 'Astronomy', '#0ea5e9')], {
      occurrence_date: '2026-10-22', date: '2026-10-22', starts_at: '2026-10-23T05:00:00Z', ends_at: '2026-10-23T08:00:00Z', past: true,
    });
    api.fetchTaskDebrief.mockResolvedValue({ ...workday, events_today: [stars, ...workday.events_today!], passed_events_today: [stars, gym, lecture] });
    await render();
    expect(scheduleCard()!.querySelectorAll('[data-schedule-row]')).toHaveLength(4);
    expect(scheduleCard()!.textContent).not.toContain('Stargazing');
    expect(activityLogCard()!.textContent).not.toContain('Stargazing');
    expect(activityLogCard()!.textContent).not.toContain('Astronomy');
    expect(activityLogCard()!.textContent).toContain('Event: CS 460 Lecture');
    expect(cardWithHeading("Today's Time Allocation")!.textContent).not.toContain('Astronomy');
  });

  it('shows no schedule when the only event started yesterday', async () => {
    const stars = event('Stargazing club', '22:00', '01:00', [], { date: '2026-10-22', occurrence_date: '2026-10-22', past: true });
    api.fetchTaskDebrief.mockResolvedValue({ ...workday, events_today: [stars], passed_events_today: [stars] });
    await render();
    expect(scheduleCard()).toBeNull();
  });

  it('says what is on now during an event', async () => {
    vi.setSystemTime(new Date(2026, 9, 23, 14, 0));
    await render();
    expect(scheduleCard()!.textContent).toContain('Now: ART 157 Studio until 3:50 PM');
  });

  it("logs the events that have passed by their tags, against the whole work window", async () => {
    await render();
    const log = activityLogCard()!;
    expect(log.textContent).toContain('1h 50m / 10h');
    expect(log.textContent).toContain('18% of today\'s capacity used');
    expect(log.textContent).toContain('of your 10h work window');
    expect(log.textContent).toContain('Event: CS 460 Lecture');
    expect(log.textContent).toContain('Health');
    expect(log.textContent).not.toContain('Studio');
  });

  it('counts a finished event once against the work window', async () => {
    const meeting = event('Planning', '08:00', '12:00', [cs], { past: true });
    api.fetchTaskDebrief.mockResolvedValue({
      ...workday,
      completed_today_tasks: [{ id: 1, title: 'Draft', priority: null, due_date: null, due_time: null, category: null, estimated_time: 0.5, tags: [] }],
      workload: {
        is_rest_day: false, window_minutes: 480, event_minutes: 240, available_minutes: 240,
        committed_minutes: 0, free_minutes: 240, utilization_pct: 0, is_overcommitted: false,
      },
      events_today: [meeting],
      passed_events_today: [meeting],
    });
    await render();
    const log = activityLogCard()!.textContent ?? '';
    expect(log).toContain('4h 30m / 8h');
    expect(log).toContain('56% of today\'s capacity used');
    expect(log).not.toContain('Overcommitted');
  });

  it("puts today's live events in the time allocation bar by tag", async () => {
    await render();
    const allocation = cardWithHeading("Today's Time Allocation")!;
    expect(allocation.textContent).toContain('4h 40m total');
    expect(allocation.textContent).toContain('ART 157 Studio');
    expect(allocation.textContent).not.toContain('Yoga');
  });

  it('shows no schedule on a day without events', async () => {
    api.fetchTaskDebrief.mockResolvedValue({ ...workday, events_today: [], passed_events_today: [] });
    await render();
    expect(scheduleCard()).toBeNull();
  });

  it('reloads when an event changes', async () => {
    await render();
    expect(api.fetchTaskDebrief).toHaveBeenCalledTimes(1);
    await act(async () => notifyEventsChanged());
    expect(api.fetchTaskDebrief).toHaveBeenCalledTimes(2);
  });
});
