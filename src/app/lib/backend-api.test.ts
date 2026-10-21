import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) } },
}));

import { ApiError, archiveTask, completeTaskWithLinked, fetchCalendarActivity, fetchCanvasCourses, fetchCanvasModules, fetchCanvasOverview, fetchCanvasPanelCourses, onDelete } from './backend-api';

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
