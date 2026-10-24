import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) } },
}));

import {
  ApiError, archiveTask, CanvasTaskExistsError, completeTaskWithLinked, connectCanvasFeed, createTask, deleteEvent,
  fetchCalendarActivity, fetchEventReport, fetchEvents, fetchTaskDebrief, purgeEvent, restoreEvent, setEventArchived, updateEvent,
  fetchCanvasCourses, fetchCanvasModules, fetchCanvasOverview, fetchCanvasPanelCourses, onDelete, syncCanvasLinkedTasks,
} from './backend-api';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const requestedUrl = (): URL => new URL(String(fetchMock.mock.calls[0][0]), 'http://api.test');
const requestedParams = (): URLSearchParams => requestedUrl().searchParams;

describe('fetchCalendarActivity', () => {
  it('leaves archived items out by default', async () => {
    await fetchCalendarActivity('2026-10-01', '2026-10-31');
    expect(requestedParams().has('include_archived')).toBe(false);
  });

  it('sends include_archived=true when asked', async () => {
    await fetchCalendarActivity('2026-10-01', '2026-10-31', { includeArchived: true });
    const params = requestedParams();
    expect(params.get('include_archived')).toBe('true');
    expect(params.get('start_date')).toBe('2026-10-01');
    expect(params.get('end_date')).toBe('2026-10-31');
  });
});

describe('events', () => {
  // A fresh body for each call, as several calls share one test.
  beforeEach(() => { fetchMock.mockImplementation(async () => new Response('{}', { status: 200 })); });

  it('sends the scope, and the occurrence date for this or following', async () => {
    await updateEvent(30, { title: 'CS 460 Midterm' }, 'this', '2026-10-21');
    expect(requestedUrl().pathname).toMatch(/\/update-event\/30$/);
    expect(Object.fromEntries(requestedParams())).toEqual({ scope: 'this', occurrence_date: '2026-10-21' });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'PUT', body: JSON.stringify({ title: 'CS 460 Midterm' }) });

    fetchMock.mockClear();
    await setEventArchived(30, true, 'following', '2026-10-21');
    expect(requestedUrl().pathname).toMatch(/\/archive-event\/30$/);
    expect(Object.fromEntries(requestedParams())).toEqual({ scope: 'following', occurrence_date: '2026-10-21' });
  });

  it('leaves the occurrence date out for all', async () => {
    await deleteEvent(30, 'all', '2026-10-21');
    expect(requestedUrl().pathname).toMatch(/\/del-event\/30$/);
    expect(Object.fromEntries(requestedParams())).toEqual({ scope: 'all' });

    fetchMock.mockClear();
    await setEventArchived(30, false);
    expect(requestedUrl().pathname).toMatch(/\/unarchive-event\/30$/);
    expect(Object.fromEntries(requestedParams())).toEqual({ scope: 'all' });
  });

  it('restores or purges a series, or one deleted occurrence of it', async () => {
    await restoreEvent(30);
    expect(requestedUrl().pathname).toMatch(/\/restore-event\/30$/);
    expect(requestedParams().has('occurrence_date')).toBe(false);

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await purgeEvent(30, '2026-10-21');
    expect(requestedUrl().pathname).toMatch(/\/purge-event\/30$/);
    expect(requestedParams().get('occurrence_date')).toBe('2026-10-21');
  });

  it('lists archived series with ?archived=true, and asks for the report in our zone', async () => {
    fetchMock.mockImplementation(async () => new Response('[]', { status: 200 }));
    await fetchEvents(true);
    expect(requestedUrl().pathname).toMatch(/\/get-events$/);
    expect(requestedParams().get('archived')).toBe('true');

    fetchMock.mockClear();
    fetchMock.mockImplementation(async () => new Response('{}', { status: 200 }));
    await fetchEventReport('2026-10-18', '2026-10-24');
    expect(requestedUrl().pathname).toMatch(/\/get-event-report$/);
    expect(requestedParams().get('tz')).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it("sends the brief our time zone, so today's events land on our day", async () => {
    await fetchTaskDebrief();
    expect(requestedParams().get('tz')).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });
});

describe('fetchCanvasCourses', () => {
  it('asks for hidden courses too and reads the courses list', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      courses: [
        { id: 1, name: 'Operating Systems', course_code: 'CS 460', current_score: 91 },
        { id: 2, name: 'Sandbox', course_code: null },
        { id: 'x', name: 'Broken' },
      ],
      fetched_at: '2026-10-21T12:00:00Z',
    }), { status: 200 }));
    const courses = await fetchCanvasCourses();
    expect(requestedParams().get('include_hidden')).toBe('true');
    expect(courses).toEqual([
      { id: 1, name: 'Operating Systems', course_code: 'CS 460' },
      { id: 2, name: 'Sandbox', course_code: null },
    ]);
  });

  it('rejects a bare list instead of the courses object', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([{ id: 1, name: 'Operating Systems' }]), { status: 200 }));
    await expect(fetchCanvasCourses()).rejects.toThrow('unexpected response shape');
  });
});

describe('linked task modes', () => {
  it('sends linked=keep or linked=cascade on delete', async () => {
    await onDelete(4, 'keep');
    expect(requestedUrl().pathname).toMatch(/\/del-task\/4$/);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'DELETE' });
    expect(requestedParams().get('linked')).toBe('keep');
    fetchMock.mockClear();
    await onDelete(4, 'cascade');
    expect(requestedParams().get('linked')).toBe('cascade');
  });

  it('sends linked on archive', async () => {
    await archiveTask(4, 'keep');
    expect(requestedUrl().pathname).toMatch(/\/archive-task\/4$/);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'PATCH' });
    expect(requestedParams().get('linked')).toBe('keep');
  });

  it('leaves linked out when no mode is given, so the backend cascades as before', async () => {
    await onDelete(4);
    expect(requestedParams().has('linked')).toBe(false);
    fetchMock.mockClear();
    await archiveTask(4);
    expect(requestedParams().has('linked')).toBe(false);
  });

  it('completes all with one with_linked=true status call', async () => {
    await completeTaskWithLinked(4);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestedUrl().pathname).toMatch(/\/update-task-status\/4$/);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'PATCH' });
    expect(requestedParams().get('with_linked')).toBe('true');
  });
});

describe('connectCanvasFeed', () => {
  it('sends the link in the body and the time zone as tz', async () => {
    await connectCanvasFeed('webcal://sdsu.instructure.com/feeds/calendars/user_abc.ics', true);
    const [, init] = fetchMock.mock.calls[0];
    expect(requestedUrl().pathname).toMatch(/\/canvas\/connection\/feed$/);
    expect(requestedParams().get('tz')).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(requestedParams().has('refresh')).toBe(false);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({
      feed_url: 'webcal://sdsu.instructure.com/feeds/calendars/user_abc.ics', allow_account_change: true,
    });
  });
});

describe('Canvas panel reads', () => {
  it('sends the time zone and only asks for a refresh when told to', async () => {
    fetchMock.mockImplementation(async () => new Response('{}', { status: 200 }));
    await fetchCanvasOverview();
    expect(requestedUrl().pathname).toMatch(/\/canvas\/overview$/);
    expect(requestedParams().get('tz')).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(requestedParams().has('refresh')).toBe(false);

    fetchMock.mockClear();
    await fetchCanvasModules(460, true);
    expect(requestedUrl().pathname).toMatch(/\/canvas\/courses\/460\/modules$/);
    expect(requestedParams().get('refresh')).toBe('true');
  });

  it('lists only the shown courses', async () => {
    await fetchCanvasPanelCourses();
    expect(requestedUrl().pathname).toMatch(/\/canvas\/courses$/);
    expect(requestedParams().has('include_hidden')).toBe(false);
  });

  it('carries the Canvas error code as the detail', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: 'canvas_token_invalid' }), { status: 409 }));
    const err = await fetchCanvasOverview().catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, detail: 'canvas_token_invalid' });
  });
});

describe('createTask', () => {
  const body = { title: 'Problem Set 6', tags: [], created_date: '2026-10-21T09:00:00', canvas_assignment_id: 9876 };

  it('sends the Canvas link fields', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 1 }), { status: 200 }));
    await createTask({ ...body, canvas_html_url: 'https://sdsu.instructure.com/courses/1/assignments/9876' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      canvas_assignment_id: 9876,
      canvas_html_url: 'https://sdsu.instructure.com/courses/1/assignments/9876',
    });
  });

  it("throws a CanvasTaskExistsError with the existing task's id on a duplicate", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      detail: { code: 'canvas_task_exists', message: 'An open task already follows this Canvas assignment.', task_id: 42 },
    }), { status: 409 }));
    const err = await createTask(body).catch(e => e);
    expect(err).toBeInstanceOf(CanvasTaskExistsError);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.taskId).toBe(42);
  });

  it('keeps any other 409 a plain ApiError', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: 'Priority 1 is taken.' }), { status: 409 }));
    const err = await createTask(body).catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).not.toBeInstanceOf(CanvasTaskExistsError);
    expect(err.detail).toBe('Priority 1 is taken.');
  });
});

describe('syncCanvasLinkedTasks', () => {
  const results = [
    { task_id: 1, synced: true, submitted: true, due_at: '2026-10-23T06:59:00Z', due_changed: false },
    { task_id: 2, synced: false },
    { task_id: 'x' },
  ];

  it('POSTs with the time zone and reads the results', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ fetched_at: '2026-10-21T12:00:00Z', results }), { status: 200 }));
    const synced = await syncCanvasLinkedTasks(true);
    expect(requestedUrl().pathname).toMatch(/\/canvas\/linked-tasks\/sync$/);
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(requestedParams().get('tz')).toBeTruthy();
    expect(requestedParams().get('refresh')).toBe('true');
    expect(synced).toEqual([
      { task_id: 1, synced: true, submitted: true, due_at: '2026-10-23T06:59:00Z', due_changed: false },
      { task_id: 2, synced: false, submitted: false, due_at: null, due_changed: false },
    ]);
  });

  it('keeps whether Canvas counts it done, why, and whether this sync completed it', async () => {
    const done = [
      { task_id: 3, synced: true, submitted: true, done: true, done_reason: 'submitted', due_at: null, due_changed: false, completed: true },
      { task_id: 4, synced: true, submitted: false, done: true, done_reason: 'marked_complete', due_at: null, due_changed: false, completed: false },
    ];
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ results: done }), { status: 200 }));
    expect(await syncCanvasLinkedTasks()).toEqual([
      { task_id: 3, synced: true, submitted: true, done: true, done_reason: 'submitted', due_at: null, due_changed: false, completed: true },
      { task_id: 4, synced: true, submitted: false, done: true, done_reason: 'marked_complete', due_at: null, due_changed: false },
    ]);
  });

  it('also reads a bare list', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(results.slice(0, 1)), { status: 200 }));
    expect(await syncCanvasLinkedTasks()).toHaveLength(1);
    expect(requestedParams().has('refresh')).toBe(false);
  });

  it('throws when the route is missing', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: 'Not Found' }), { status: 404 }));
    await expect(syncCanvasLinkedTasks()).rejects.toBeInstanceOf(ApiError);
  });
});
