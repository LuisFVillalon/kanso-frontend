import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) } },
}));

import {
  ApiError, archiveTask, CanvasTaskExistsError, completeTaskWithLinked, createTask, fetchCalendarActivity, fetchCanvasCourses,
  fetchCanvasModules, fetchCanvasOverview, fetchCanvasPanelCourses, onDelete, syncCanvasLinkedTasks,
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
