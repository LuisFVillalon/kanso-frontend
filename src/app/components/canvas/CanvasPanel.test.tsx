// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CanvasClasses, CanvasClassSummary, CanvasConnection, CanvasCourses, CanvasItem, CanvasOverview,
} from '@/app/types/canvas';
import type { Tag } from '@/app/types/task';
import type { CanvasAddToTasks } from '@/app/hooks/useCanvasAddToTasks';

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
    fetchCanvasClasses: vi.fn(),
    fetchCanvasCourseTags: vi.fn(),
    saveCanvasCourseTags: vi.fn(),
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
const showToast = vi.hoisted(() => vi.fn());
vi.mock('@/app/context/ToastContext', () => ({ useToast: () => showToast }));

import CanvasPanel from './CanvasPanel';
import { canvasReadFailure } from '@/app/hooks/useCanvas';
import { canvasCourseLabel } from '@/app/utils/canvasTasks';

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

const classes = (overrides: Partial<CanvasClassSummary>[] = [{}]): CanvasClasses => ({
  ...meta,
  classes: overrides.map(o => ({
    id: 460, code: 'CS 460', name: 'Operating Systems', term: 'Fall 2026', html_url: null, hidden: false,
    due_this_week: 2, upcoming: 2, next_due: null, ...o,
  })),
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
  api.fetchCanvasCourseTags.mockResolvedValue([]);
  api.fetchCanvasClasses.mockResolvedValue(classes());
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  localStorage.clear();
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
    expect(api.fetchCanvasOverview).toHaveBeenCalledWith(false, 'all');
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
    expect(api.fetchCanvasOverview).toHaveBeenLastCalledWith(true, 'all');
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
    expect(api.fetchCanvasOverview).toHaveBeenLastCalledWith(true, 'all');
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
    await click(button('Classes'));
    expect(text()).toContain('A-');
    await click(button('Modules & assignments'));
    expect(api.fetchCanvasModules).toHaveBeenCalledWith(460, false);
    expect(panelStatus()).toBe('reconnect');
  });

  it('shows a course error inside the course for other codes', async () => {
    api.fetchCanvasModules.mockRejectedValue(apiError(404, 'canvas_course_hidden'));
    await render();
    await click(button('Classes'));
    await click(button('Modules & assignments'));
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
    const FEED_CAPABILITIES = {
      upcoming: true, missing: false, recently_graded: false, courses: false, modules: false, assignments: false,
      announcements: false, link_tasks: true, submission_status: false,
    };
    const feedConnection = (overrides: Partial<CanvasConnection> = {}) => connected({
      connection_type: 'feed', capabilities: FEED_CAPABILITIES, token_last4: 'T0ke', canvas_user_id: null,
      canvas_user_name: null, token_expires_at: null, ...overrides,
    });
    const feedOverview = () => overview({ missing: [], recently_graded: [] });
    const addToTasks = {
      stateOf: vi.fn(() => ({ kind: 'add' as const, pending: false })), add: vi.fn(), tags: [], createTag: vi.fn(),
    };

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

    it('shows Upcoming and Classes, leaving out Announcements without mentioning a token', async () => {
      await render();
      expect(button('Upcoming')).toBeTruthy();
      expect(button('Classes')).toBeTruthy();
      expect(button('Announcements')).toBeUndefined();
      expect(text()).not.toContain('No active courses');
      expect(text()).not.toMatch(/access token/i);
      await click(button('Classes'));
      expect(text()).not.toMatch(/access token|Grade|Modules/i);
    });

    it("names feed courses a token never named, keeping the token's course codes", async () => {
      await render();
      expect(canvasCourseLabel('https://sdsu.instructure.com/courses/460/assignments/1')).toBe('Operating Systems');
      act(() => root.unmount());

      api.fetchCanvasConnection.mockResolvedValue(connected());
      root = createRoot(container);
      await render();
      expect(canvasCourseLabel('https://sdsu.instructure.com/courses/460/assignments/1')).toBe('CS 460');
      act(() => root.unmount());

      api.fetchCanvasConnection.mockResolvedValue(feedConnection());
      api.fetchCanvasOverview.mockResolvedValue(feedOverview());
      root = createRoot(container);
      await render();
      expect(canvasCourseLabel('https://sdsu.instructure.com/courses/460/assignments/1')).toBe('CS 460');
    });

    it('shows no tabs while the connection is still loading', async () => {
      api.fetchCanvasConnection.mockReturnValue(new Promise(() => {}));
      await render();
      expect(panelStatus()).toBe('loading');
      expect(container.querySelector('[role="tablist"]')).toBeNull();
      expect(button('Announcements')).toBeUndefined();
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
      api.fetchCanvasConnection.mockResolvedValue(feedConnection({ capabilities: { ...FEED_CAPABILITIES, link_tasks: false } }));
      await act(async () => root.render(<CanvasPanel onOpenSettings={onOpenSettings} addToTasks={addToTasks} />));
      expect(text()).toContain('Homework 5');
      expect(button('Add "Homework 5" to tasks')).toBeUndefined();
    });
  });

  it('reads courses and shows every tab for a token, with or without a type from the backend', async () => {
    api.fetchCanvasConnection.mockResolvedValue(connected({ connection_type: 'token' }));
    await render();
    expect(api.fetchCanvasPanelCourses).toHaveBeenCalled();
    expect(button('Classes')).toBeTruthy();
    expect(button('Announcements')).toBeTruthy();
  });

  it('shows the tabs for a token while its data loads', async () => {
    api.fetchCanvasOverview.mockReturnValue(new Promise(() => {}));
    await render();
    expect(panelStatus()).toBe('loading');
    expect(button('Classes')).toBeTruthy();
    expect(button('Announcements')).toBeTruthy();
  });

  describe('range, classes and tags', () => {
    const own: Tag = { id: 7, name: 'Exam prep', color: '#7C3AED' };
    let addToTasks: CanvasAddToTasks;
    const later = item({ id: 4, title: 'Final project', course_id: 254, course_name: 'MATH 254', due_at: inDays(20), html_url: 'https://sdsu.instructure.com/courses/254/assignments/4' });
    const renderWithAdd = () => act(async () => root.render(<CanvasPanel onOpenSettings={onOpenSettings} addToTasks={addToTasks} />));
    const dialog = () => container.querySelector('[role="dialog"]');

    beforeEach(() => {
      addToTasks = {
        stateOf: vi.fn(() => ({ kind: 'add' as const, pending: false })),
        add: vi.fn(async (_item: CanvasItem, tags: Tag[]) => ({
          id: 90, title: 'Homework 5', description: '', completed: false, priority: null, due_date: null, due_time: null,
          created_date: '2026-10-21', completed_date: null, tags: tags.map(t => (t.id === 0 ? { ...t, id: 11 } : t)),
        })),
        tags: [own],
        createTag: vi.fn(async tag => ({ id: 12, ...tag })),
      };
      api.fetchCanvasOverview.mockResolvedValue(overview({ upcoming: [item({}), later] }));
      api.fetchCanvasClasses.mockResolvedValue(classes([{}, { id: 254, code: 'MATH 254', name: 'Linear Algebra' }]));
      api.saveCanvasCourseTags.mockImplementation(async (courseId: number, tagIds: number[]) => [{ course_id: courseId, tags: tagIds.map(id => ({ id, name: `Tag ${id}`, color: '#000' })) }]);
    });

    it('opens on everything upcoming by week and narrows to 7 days, remembering the choice', async () => {
      await render();
      expect(button('All upcoming').getAttribute('aria-pressed')).toBe('true');
      expect(text()).toContain('This week');
      expect(text()).toContain('Final project');
      expect(text()).toContain("That's everything on your Canvas calendar.");
      await click(button('7 days'));
      expect(text()).toContain('Next 7 days');
      expect(text()).not.toContain('Final project');
      expect(localStorage.getItem('tm-canvas-range')).toBe('"week"');
    });

    it('narrows the list to one class with its chip', async () => {
      await render();
      const chips = container.querySelector('[aria-label="Filter by class"]')!;
      expect(chips.textContent).toContain('All classes');
      await click([...chips.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.startsWith('MATH 254'))!);
      expect(text()).toContain('Final project');
      expect(text()).not.toContain('Homework 5');
      expect(text()).toContain("That's everything on your Canvas calendar for MATH 254.");
    });

    it('lists each class with what is due, its grade with a token, and hides one', async () => {
      api.updateCanvasHiddenCourses.mockResolvedValue(connected({ hidden_course_ids: [254] }));
      await renderWithAdd();
      await click(button('Classes'));
      const cards = [...container.querySelectorAll('[data-testid="canvas-class-card"]')];
      expect(cards).toHaveLength(2);
      expect(cards[0].textContent).toContain('Operating Systems · Fall 2026');
      expect(cards[0].textContent).toContain('A-');
      expect(cards[0].textContent).toContain('1 due this week');
      expect(cards[0].textContent).toContain('Tags for tasksCS 460Choose your own');
      api.fetchCanvasClasses.mockResolvedValue(classes([{}, { id: 254, code: 'MATH 254', hidden: true }]));
      await click(button('Hide MATH 254'));
      expect(api.updateCanvasHiddenCourses).toHaveBeenCalledWith([254]);
      expect(text()).toContain('Hidden from Upcoming. Tap the eye to show it again.');
      expect(button('Show MATH 254')).toBeTruthy();
    });

    it("opens a class's due dates in Upcoming", async () => {
      await render();
      await click(button('Classes'));
      await click(container.querySelectorAll<HTMLButtonElement>('[data-testid="canvas-class-card"]')[1].querySelector('button:not([aria-label])')!);
      expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toMatch(/^Upcoming/);
      expect(text()).toContain('Final project');
      expect(text()).not.toContain('Homework 5');
    });

    it('adds an item through the tag picker, starting with the class tag', async () => {
      await renderWithAdd();
      await click(button('Add "Homework 5" to tasks'));
      expect(dialog()?.getAttribute('aria-label')).toBe('Add to tasks');
      await click(button('Add task'));
      expect(addToTasks.add).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), [{ id: 0, name: 'CS 460', color: '#006BCB' }]);
      expect(api.saveCanvasCourseTags).not.toHaveBeenCalled();
      expect(dialog()).toBeNull();
    });

    it("remembers the chosen tags for the class, naming the tag the task created", async () => {
      await renderWithAdd();
      await click(button('Add "Homework 5" to tasks'));
      await click(button('Exam prep'));
      await click(dialog()!.querySelector<HTMLInputElement>('input[type="checkbox"]')!);
      await click(button('Add task'));
      expect(api.saveCanvasCourseTags).toHaveBeenCalledWith(460, [11, 7]);
    });

    it("opens on a class's saved tags", async () => {
      api.fetchCanvasCourseTags.mockResolvedValue([{ course_id: 460, tags: [own] }]);
      await renderWithAdd();
      await click(button('Add "Homework 5" to tasks'));
      expect(dialog()?.textContent).toContain('Your usual tags for CS 460.');
      await click(button('Add task'));
      expect(addToTasks.add).toHaveBeenCalledWith(expect.anything(), [own]);
    });

    it("keeps a class's saved tags when its task is added with none", async () => {
      api.fetchCanvasCourseTags.mockResolvedValue([{ course_id: 460, tags: [own] }]);
      await renderWithAdd();
      await click(button('Add "Homework 5" to tasks'));
      await click(button('Remove Exam prep'));
      await click(button('Add task'));
      expect(addToTasks.add).toHaveBeenCalledWith(expect.anything(), []);
      expect(api.saveCanvasCourseTags).not.toHaveBeenCalled();
      expect(dialog()).toBeNull();
    });

    it("forgets a class's saved tags when unticked, even with no tags", async () => {
      api.fetchCanvasCourseTags.mockResolvedValue([{ course_id: 460, tags: [own] }]);
      await renderWithAdd();
      await click(button('Add "Homework 5" to tasks'));
      await click(dialog()!.querySelector<HTMLInputElement>('input[type="checkbox"]')!);
      await click(button('Remove Exam prep'));
      await click(button('Add task'));
      expect(api.saveCanvasCourseTags).toHaveBeenCalledWith(460, []);
    });

    it("chooses a class's tags from its card, creating a new tag first", async () => {
      await renderWithAdd();
      await click(button('Classes'));
      await click(button('Choose your own'));
      expect(dialog()?.getAttribute('aria-label')).toBe('Tags for CS 460 tasks');
      await click(button('Save'));
      expect(addToTasks.createTag).toHaveBeenCalledWith({ name: 'CS 460', color: '#006BCB' });
      expect(api.saveCanvasCourseTags).toHaveBeenCalledWith(460, [12]);
      expect(showToast).toHaveBeenCalledWith('CS 460 tasks will start with CS 460.', 'success');
      expect(dialog()).toBeNull();
    });
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
