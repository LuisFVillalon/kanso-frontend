// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasConnection, CanvasCourses, CanvasItem, CanvasOverview } from '@/app/types/canvas';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const api = vi.hoisted(() => {
  class ApiError extends Error {
    constructor(readonly status: number, readonly detail: string) {
      super(detail);
    }
  }
  return {
    ApiError,
    describeError: (_: unknown, fallback: string) => fallback,
    fetchCanvasConnection: vi.fn(),
    fetchCanvasOverview: vi.fn(),
    fetchCanvasPanelCourses: vi.fn(),
    fetchCanvasModules: vi.fn(),
    fetchCanvasAssignments: vi.fn(),
    fetchCanvasAnnouncements: vi.fn(),
    connectCanvas: vi.fn(),
    testCanvasConnection: vi.fn(),
    updateCanvasHiddenCourses: vi.fn(),
    removeCanvasConnection: vi.fn(),
    fetchCanvasCourses: vi.fn(),
  };
});
vi.mock('@/app/lib/backend-api', () => api);

const auth = vi.hoisted(() => ({ isDemo: false }));
vi.mock('@/app/context/AuthContext', () => ({ useAuth: () => auth }));

import CanvasPanel from './CanvasPanel';
import { canvasReadFailure } from '@/app/hooks/useCanvas';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-21T19:00:00Z');
const inDays = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();

const connected = (overrides: Partial<CanvasConnection> = {}): CanvasConnection => ({
  connected: true,
  status: 'active',
  base_url: 'https://sdsu.instructure.com',
  token_last4: '7Hq2',
  canvas_user_id: 42,
  canvas_user_name: 'Luis Villalon',
  token_expires_at: inDays(72),
  hidden_course_ids: [],
  created_at: inDays(-19),
  updated_at: null,
  last_synced_at: null,
  last_error_at: null,
  ...overrides,
});

const meta = { fetched_at: new Date(NOW.getTime() - 3 * 60 * 1000).toISOString(), busy: false, stale: false, sample: false };

const item = (overrides: Partial<CanvasItem>): CanvasItem => ({
  id: 1, kind: 'assignment', title: 'Homework 5', course_id: 460, course_name: 'Operating Systems',
  due_at: inDays(1), points_possible: 50, html_url: 'https://sdsu.instructure.com/courses/460/assignments/1', submission: null,
  ...overrides,
});

const overview = (overrides: Partial<CanvasOverview> = {}): CanvasOverview => ({
  ...meta,
  start: inDays(0),
  end: inDays(7),
  upcoming: [item({}), item({ id: 2, kind: 'quiz', title: 'Quiz 3: Paging' })],
  missing: [item({ id: 3, title: 'Lab 2', due_at: inDays(-2), submission: { submitted: false, missing: true, late: false, graded: false, excused: false, score: null, grade: null, submitted_at: null, graded_at: null } })],
  recently_graded: [],
  ...overrides,
});

const courses = (overrides: Partial<CanvasCourses> = {}): CanvasCourses => ({
  ...meta,
  courses: [{
    id: 460, name: 'Operating Systems', course_code: 'CS 460', term: 'Fall 2026', html_url: null, grades_hidden: false,
    current_score: 91.2, current_grade: 'A-', grading_period: null, period_score: null, period_grade: null,
  }],
  ...overrides,
});

const apiError = (status: number, code: string) => new api.ApiError(status, code);

let container: HTMLDivElement;
let root: Root;
let onOpenSettings: ReturnType<typeof vi.fn<() => void>>;

const render = async () => {
  await act(async () => root.render(<CanvasPanel onOpenSettings={onOpenSettings} />));
};
const text = () => container.textContent ?? '';
const panelStatus = () => container.querySelector('[data-canvas-status]')?.getAttribute('data-canvas-status');
const button = (label: string) =>
  [...container.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === label || b.getAttribute('aria-label') === label)!;
const click = async (el: HTMLElement) => { await act(async () => { el.click(); }); };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(NOW);
  auth.isDemo = false;
  onOpenSettings = vi.fn<() => void>();
  api.fetchCanvasConnection.mockResolvedValue(connected());
  api.fetchCanvasOverview.mockResolvedValue(overview());
  api.fetchCanvasPanelCourses.mockResolvedValue(courses());
  api.fetchCanvasAnnouncements.mockResolvedValue({ ...meta, announcements: [] });
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

describe('canvasReadFailure', () => {
  it.each([
    ['canvas_not_connected', 404, 'not-connected'],
    ['canvas_token_invalid', 409, 'reconnect'],
    ['canvas_busy', 502, 'error'],
    ['canvas_unavailable', 502, 'error'],
    ['canvas_not_configured', 503, 'error'],
    ['canvas_not_canvas', 422, 'error'],
    ['canvas_forbidden', 422, 'error'],
    ['canvas_course_hidden', 404, 'error'],
    ['canvas_course_not_found', 404, 'error'],
  ])('maps %s to %s', (code, status, panel) => {
    expect(canvasReadFailure(apiError(status, code)).status).toBe(panel);
  });

  it('gives each error code its own message', () => {
    const messages = ['canvas_busy', 'canvas_unavailable', 'canvas_not_configured', 'canvas_not_canvas', 'canvas_forbidden']
      .map(code => canvasReadFailure(apiError(502, code)).message);
    expect(new Set(messages).size).toBe(messages.length);
    expect(canvasReadFailure(apiError(429, 'Too many requests')).message).toMatch(/Too many Canvas requests/);
    expect(canvasReadFailure(new Error('network')).message).toMatch(/Couldn't load Canvas/);
  });
});

describe('CanvasPanel', () => {
  it('shows a skeleton while the first load runs', async () => {
    api.fetchCanvasOverview.mockReturnValue(new Promise(() => {}));
    await render();
    expect(panelStatus()).toBe('loading');
    expect(container.querySelector('[aria-label="Loading Canvas"]')).not.toBeNull();
    expect(text()).toContain('Syncing…');
  });

  it('shows Upcoming with missing work, the day groups and the sync time', async () => {
    await render();
    expect(panelStatus()).toBe('ready');
    expect(text()).toContain('sdsu.instructure.com');
    expect(text()).toContain('Synced 3 min ago');
    // Missed work is "Slipped", never red.
    expect(text()).toContain('One thing slipped. Start with this one.');
    expect(text()).toContain('Lab 2');
    expect(text()).toContain('Tomorrow');
    expect(text()).toContain('Quiz 3: Paging');
    expect(container.querySelector('[aria-label="1 slipped"]')).not.toBeNull();
    // Open work counts down like a task.
    expect(text()).toContain('Due tomorrow');
    expect(api.fetchCanvasOverview).toHaveBeenCalledWith(false);
  });

  it('prompts to connect when Canvas isn\'t connected, linking to Settings', async () => {
    api.fetchCanvasConnection.mockResolvedValue(connected({ connected: false, status: null, base_url: null }));
    await render();
    expect(panelStatus()).toBe('not-connected');
    expect(api.fetchCanvasOverview).not.toHaveBeenCalled();
    await click(button('Connect Canvas'));
    expect(onOpenSettings).toHaveBeenCalled();
  });

  it('shows Reconnect for a connection already marked invalid, without reading Canvas', async () => {
    api.fetchCanvasConnection.mockResolvedValue(connected({ status: 'invalid', last_error_at: inDays(-3) }));
    await render();
    expect(panelStatus()).toBe('reconnect');
    expect(text()).toContain('Canvas rejected the token on');
    expect(api.fetchCanvasOverview).not.toHaveBeenCalled();
    await click(button('Reconnect Canvas'));
    expect(onOpenSettings).toHaveBeenCalled();
  });

  it('shows Reconnect when a read answers canvas_token_invalid', async () => {
    api.fetchCanvasOverview.mockRejectedValue(apiError(409, 'canvas_token_invalid'));
    await render();
    expect(panelStatus()).toBe('reconnect');
    expect(text()).toContain('Your Canvas token stopped working');
  });

  it('shows the not-connected prompt when a read answers canvas_not_connected', async () => {
    api.fetchCanvasPanelCourses.mockRejectedValue(apiError(404, 'canvas_not_connected'));
    await render();
    expect(panelStatus()).toBe('not-connected');
  });

  it.each([
    ['canvas_busy', /Canvas is busy right now/],
    ['canvas_unavailable', /Canvas isn't responding right now/],
    ['canvas_not_configured', /Canvas isn't available yet/],
  ])('shows %s with a Retry when nothing is saved', async (code, message) => {
    api.fetchCanvasOverview.mockRejectedValueOnce(apiError(502, code));
    await render();
    expect(panelStatus()).toBe('error');
    expect(text()).toMatch(message);
    await click(button('Retry'));
    expect(panelStatus()).toBe('ready');
    expect(api.fetchCanvasOverview).toHaveBeenLastCalledWith(true);
  });

  it('warns about a token expiring within 7 days, with Replace opening Settings', async () => {
    api.fetchCanvasConnection.mockResolvedValue(connected({ token_expires_at: inDays(5) }));
    await render();
    expect(text()).toContain('Your Canvas token expires in 5 days');
    await click(button('Replace'));
    expect(onOpenSettings).toHaveBeenCalled();
  });

  it('dims stale data under a banner when Canvas is down', async () => {
    api.fetchCanvasOverview.mockResolvedValue(overview({ stale: true }));
    await render();
    expect(text()).toContain("Canvas isn't responding right now.");
    expect(text()).toContain('Showing what kanso saved at');
    expect(text()).toContain('Last synced');
    expect(container.querySelector('.opacity-60')).not.toBeNull();
  });

  it('says Canvas is busy when it is rate-limiting', async () => {
    api.fetchCanvasOverview.mockResolvedValue(overview({ stale: true, busy: true }));
    await render();
    expect(text()).toContain('Canvas is busy right now.');
  });

  it('shows the no-courses state between terms', async () => {
    api.fetchCanvasPanelCourses.mockResolvedValue(courses({ courses: [] }));
    await render();
    expect(text()).toContain('No active courses');
    expect(container.querySelector('[role="tablist"]')).toBeNull();
  });

  it('allows one refresh every 30 seconds', async () => {
    await render();
    await click(button('Refresh Canvas'));
    expect(api.fetchCanvasOverview).toHaveBeenLastCalledWith(true);
    expect(button('Refresh Canvas').disabled).toBe(true);
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(button('Refresh Canvas').disabled).toBe(false);
  });

  it('asks for a linked-task sync when refreshed', async () => {
    const onRefresh = vi.fn();
    await act(async () => root.render(<CanvasPanel onOpenSettings={onOpenSettings} onRefresh={onRefresh} />));
    expect(onRefresh).not.toHaveBeenCalled();
    await click(button('Refresh Canvas'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('keeps the data on screen when a refresh fails', async () => {
    await render();
    api.fetchCanvasOverview.mockRejectedValueOnce(apiError(502, 'canvas_unavailable'));
    await click(button('Refresh Canvas'));
    expect(panelStatus()).toBe('ready');
    expect(text()).toContain("Couldn't refresh.");
    expect(text()).toContain('Lab 2');
  });

  it('opens a course and switches to Reconnect if its modules answer canvas_token_invalid', async () => {
    api.fetchCanvasModules.mockRejectedValue(apiError(409, 'canvas_token_invalid'));
    await render();
    await click(button('Courses'));
    expect(text()).toContain('A-');
    await click(container.querySelector<HTMLButtonElement>('button.w-full')!);
    expect(api.fetchCanvasModules).toHaveBeenCalledWith(460, false);
    expect(panelStatus()).toBe('reconnect');
  });

  it('shows a course error inside the course for other codes', async () => {
    api.fetchCanvasModules.mockRejectedValue(apiError(404, 'canvas_course_hidden'));
    await render();
    await click(button('Courses'));
    await click(container.querySelector<HTMLButtonElement>('button.w-full')!);
    expect(panelStatus()).toBe('ready');
    expect(text()).toContain('unticked under Courses to show');
  });

  it('loads announcements the first time their tab opens', async () => {
    await render();
    expect(api.fetchCanvasAnnouncements).not.toHaveBeenCalled();
    await click(button('Announcements'));
    expect(api.fetchCanvasAnnouncements).toHaveBeenCalledTimes(1);
    expect(text()).toContain('No announcements in the last 14 days.');
  });

  describe('calendar feed connection', () => {
    const feedConnection = (overrides: Partial<CanvasConnection> = {}) => connected({
      type: 'feed', capabilities: ['upcoming', 'link_tasks'], token_last4: null, canvas_user_id: null,
      canvas_user_name: null, token_expires_at: null, ...overrides,
    });
    const feedOverview = () => overview({ missing: [], recently_graded: [] });
    const addToTasks = { stateOf: vi.fn(() => ({ kind: 'add' as const, pending: false })), add: vi.fn() };

    beforeEach(() => {
      api.fetchCanvasConnection.mockResolvedValue(feedConnection());
      api.fetchCanvasOverview.mockResolvedValue(feedOverview());
    });

    it('shows Upcoming with Add to tasks and reads nothing the feed has no data for', async () => {
      await act(async () => root.render(<CanvasPanel onOpenSettings={onOpenSettings} addToTasks={addToTasks} />));
      expect(panelStatus()).toBe('ready');
      expect(text()).toContain('Homework 5');
      expect(text()).toContain('Quiz 3: Paging');
      expect(text()).toContain('Operating Systems');
      expect(button('Add "Homework 5" to tasks')).toBeTruthy();
      expect(api.fetchCanvasPanelCourses).not.toHaveBeenCalled();
      expect(api.fetchCanvasAnnouncements).not.toHaveBeenCalled();
    });

    it('leaves out the Courses and Announcements tabs and says why', async () => {
      await render();
      expect(container.querySelector('[role="tablist"]')).toBeNull();
      expect(button('Courses')).toBeUndefined();
      expect(button('Announcements')).toBeUndefined();
      expect(text()).not.toContain('No active courses');
      const note = container.querySelector('[data-testid="canvas-feed-note"]')?.textContent;
      expect(note).toContain('calendar feed, which has due dates only');
      expect(note).toContain('need an access token, if your school allows one');
      await click(button('Canvas settings'));
      expect(onOpenSettings).toHaveBeenCalled();
    });

    it('treats a feed Canvas stopped serving as Reconnect, without reading Canvas', async () => {
      api.fetchCanvasConnection.mockResolvedValue(feedConnection({ status: 'invalid', last_error_at: inDays(-3) }));
      await render();
      expect(panelStatus()).toBe('reconnect');
      expect(text()).toContain('Your Canvas calendar feed stopped working');
      expect(text()).not.toContain('token');
      expect(api.fetchCanvasOverview).not.toHaveBeenCalled();
      await click(button('Reconnect Canvas'));
      expect(onOpenSettings).toHaveBeenCalled();
    });

    it('shows Reconnect when a read answers canvas_feed_invalid', async () => {
      api.fetchCanvasOverview.mockRejectedValue(apiError(409, 'canvas_feed_invalid'));
      await render();
      expect(panelStatus()).toBe('reconnect');
      expect(text()).toContain('Your Canvas calendar feed stopped working');
    });

    it('goes by the capabilities the backend lists', async () => {
      api.fetchCanvasConnection.mockResolvedValue(feedConnection({ capabilities: ['upcoming'] }));
      await act(async () => root.render(<CanvasPanel onOpenSettings={onOpenSettings} addToTasks={addToTasks} />));
      expect(text()).toContain('Homework 5');
      expect(button('Add "Homework 5" to tasks')).toBeUndefined();
    });
  });

  it('reads courses and shows every tab for a token, with or without a type from the backend', async () => {
    api.fetchCanvasConnection.mockResolvedValue(connected({ type: 'token' }));
    await render();
    expect(api.fetchCanvasPanelCourses).toHaveBeenCalled();
    expect(button('Courses')).toBeTruthy();
    expect(button('Announcements')).toBeTruthy();
    expect(container.querySelector('[data-testid="canvas-feed-note"]')).toBeNull();
  });

  describe('demo sandbox', () => {
    beforeEach(() => { auth.isDemo = true; });

    it('shows the sample data without asking for a connection', async () => {
      api.fetchCanvasOverview.mockResolvedValue(overview({ sample: true }));
      await render();
      expect(api.fetchCanvasConnection).not.toHaveBeenCalled();
      expect(panelStatus()).toBe('ready');
      expect(text()).toContain('Sample data');
      expect(container.querySelector('[aria-label="Open Canvas"]')).toBeNull();
    });

    it('never prompts to connect or reconnect', async () => {
      api.fetchCanvasOverview.mockRejectedValue(apiError(409, 'canvas_token_invalid'));
      await render();
      expect(panelStatus()).toBe('error');
      expect(text()).not.toContain('Reconnect Canvas');
      expect(text()).not.toContain('Connect Canvas');
    });
  });
});
