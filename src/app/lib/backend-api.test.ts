import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) } },
}));

import { fetchCalendarActivity, fetchCanvasCourses } from './backend-api';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const requestedParams = (): URLSearchParams => new URL(String(fetchMock.mock.calls[0][0]), 'http://api.test').searchParams;

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
