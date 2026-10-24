import { describe, expect, it } from 'vitest';
import type {
  CanvasCapabilities, CanvasCapability, CanvasClassSummary, CanvasConnection, CanvasCourseSummary, CanvasItem, CanvasSubmission,
} from '@/app/types/canvas';
import {
  canvasCan, canvasClasses, canvasConnectionType, courseColor, dueWithin, groupByDay, groupByWeek, itemStatus, scoreLabel,
  splitEarlier, syncedLabel,
} from './canvas';

const NOW = new Date(2026, 9, 21, 12, 0);
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60 * 1000).toISOString();

const submission = (overrides: Partial<CanvasSubmission>): CanvasSubmission => ({
  submitted: false, missing: false, late: false, graded: false, excused: false,
  score: null, grade: null, submitted_at: null, graded_at: null, ...overrides,
});

const item = (id: number, due: Date | null): CanvasItem => ({
  id, kind: 'assignment', title: `Item ${id}`, course_id: 1, course_name: null,
  due_at: due ? due.toISOString() : null, points_possible: null, html_url: null, submission: null,
});

describe('syncedLabel', () => {
  it('counts minutes, then hours, then shows the date', () => {
    expect(syncedLabel(minutesAgo(0.5), NOW)).toBe('Synced just now');
    expect(syncedLabel(minutesAgo(3), NOW)).toBe('Synced 3 min ago');
    expect(syncedLabel(minutesAgo(125), NOW)).toBe('Synced 2 h ago');
    expect(syncedLabel(minutesAgo(3 * 24 * 60), NOW)).toMatch(/^Synced \D+ \d+$|^Synced \d+/);
  });
});

describe('groupByDay', () => {
  it('groups by local day with Today and Tomorrow, undated last', () => {
    const groups = groupByDay([
      item(1, new Date(2026, 9, 21, 23, 59)),
      item(2, null),
      item(3, new Date(2026, 9, 22, 9, 0)),
      item(4, new Date(2026, 9, 21, 13, 0)),
    ], NOW);
    expect(groups.map(g => g.label)).toEqual(['Today', 'Tomorrow', 'No due date']);
    expect(groups[0].items.map(i => i.id)).toEqual([1, 4]);
  });
});

// NOW is Wednesday, October 21, 2026: its week runs Monday Oct 19 to Sunday Oct 25.
describe('groupByWeek', () => {
  it('groups by Monday-start week, calls the first two This week and Next week, and names each month once', () => {
    const weeks = groupByWeek([
      item(1, new Date(2026, 9, 21, 23, 59)),
      item(2, new Date(2026, 9, 25, 9, 0)),
      item(3, new Date(2026, 9, 26, 9, 0)),
      item(4, new Date(2026, 10, 2, 9, 0)),
      item(5, new Date(2026, 10, 9, 9, 0)),
      item(6, new Date(2027, 0, 4, 9, 0)),
      item(7, null),
    ], NOW);
    expect(weeks.map(w => w.key)).toEqual(['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09', '2027-01-04', 'undated']);
    expect(weeks[0]).toMatchObject({ label: 'This week', count: 2 });
    expect(weeks[0].span).toMatch(/19.*25/);
    expect(weeks[1].label).toBe('Next week');
    expect(weeks[2].span).toBeNull();
    expect(weeks[2].label).toMatch(/2.*8/);
    expect(weeks.map(w => w.month)).toEqual([
      expect.stringMatching(/October/), null, expect.stringMatching(/November/), null, expect.stringMatching(/January.*2027/), null,
    ]);
    expect(weeks[0].days.map(d => d.label)).toEqual(['Today', 'Sunday']);
    expect(weeks[5]).toMatchObject({ label: 'No due date', count: 1 });
  });
});

describe('splitEarlier and dueWithin', () => {
  const items = [
    item(1, new Date(2026, 9, 1, 9, 0)),
    item(2, new Date(2026, 9, 21, 0, 30)),
    item(3, new Date(2026, 9, 27, 23, 59)),
    item(4, new Date(2026, 9, 28, 0, 0)),
    item(5, null),
  ];

  it('puts what came due before today under Earlier, keeping earlier today and undated ahead', () => {
    const { earlier, ahead } = splitEarlier(items, NOW);
    expect(earlier.map(i => i.id)).toEqual([1]);
    expect(ahead.map(i => i.id)).toEqual([2, 3, 4, 5]);
  });

  it('keeps the next 7 days from the start of today', () => {
    expect(dueWithin(items, NOW, 7).map(i => i.id)).toEqual([2, 3]);
  });
});

describe('canvasClasses', () => {
  const summary = (o: Partial<CanvasClassSummary>): CanvasClassSummary => ({
    id: 1, code: 'CS 460-01', name: null, term: null, html_url: null, hidden: false,
    due_this_week: 0, upcoming: 0, next_due: null, ...o,
  });
  const course = (o: Partial<CanvasCourseSummary>): CanvasCourseSummary => ({
    id: 1, name: 'Algorithms', course_code: 'CS 460', term: 'Fall 2026', html_url: null, grades_hidden: false,
    current_score: 91, current_grade: 'A-', grading_period: null, period_score: null, period_grade: null, ...o,
  });
  const feedItem = (id: number, courseId: number | null, code: string | null): CanvasItem => ({
    ...item(id, new Date(2026, 9, 22)), course_id: courseId, course_name: code,
  });

  it("takes the backend's class list, hidden ones last, each with its token course", () => {
    const classes = canvasClasses({
      summaries: [
        summary({ id: 2, code: 'ART 157', hidden: true }),
        summary({ id: 1, code: 'CS 460', name: 'Algorithms', term: 'Fall 2026' }),
      ],
      courses: [course({})],
      items: [],
      hiddenIds: [],
      labelOf: () => null,
    });
    expect(classes.map(c => [c.id, c.label, c.name, c.hidden])).toEqual([[1, 'CS 460', 'Algorithms', false], [2, 'ART 157', null, true]]);
    expect(classes[0].course?.current_grade).toBe('A-');
    expect(classes[1].course).toBeNull();
  });

  it("without the list, finds a feed's classes in its due dates, naming hidden ones it remembers", () => {
    const classes = canvasClasses({
      summaries: null,
      courses: null,
      items: [feedItem(1, 20, 'MATH 254'), feedItem(2, null, null), feedItem(3, 10, 'CS 460'), feedItem(4, 20, 'MATH 254')],
      hiddenIds: [30, 40],
      labelOf: id => (id === 30 ? 'PSY 101' : null),
    });
    expect(classes.map(c => [c.id, c.label, c.hidden])).toEqual([
      [20, 'MATH 254', false], [10, 'CS 460', false], [30, 'PSY 101', true], [40, 'Course 40', true],
    ]);
  });

  it("without the list, takes a token's courses in order", () => {
    const classes = canvasClasses({
      summaries: null,
      courses: [course({ id: 5, course_code: null, name: 'Linear Algebra' }), course({ id: 1 })],
      items: [],
      hiddenIds: [],
      labelOf: () => null,
    });
    expect(classes.map(c => [c.id, c.label, c.name])).toEqual([[5, 'Linear Algebra', null], [1, 'CS 460', 'Algorithms']]);
  });
});

describe('itemStatus', () => {
  const at = (overrides: Partial<CanvasItem>) => ({ ...item(1, new Date(2026, 9, 23, 23, 59)), ...overrides });

  it('says missed work slipped and handed-in work is done, never red', () => {
    expect(itemStatus(at({ submission: submission({ missing: true, late: true }) }), NOW)).toEqual({ kind: 'slipped', label: 'Slipped' });
    expect(itemStatus(at({ submission: submission({ late: true, submitted: true }) }), NOW)).toEqual({ kind: 'slipped', label: 'Late' });
    expect(itemStatus(at({ submission: submission({ submitted: true }) }), NOW)).toEqual({ kind: 'done', label: 'Submitted' });
    expect(itemStatus(at({ points_possible: 20, submission: submission({ graded: true, score: 18 }) }), NOW)).toEqual({ kind: 'done', label: '18/20' });
    expect(itemStatus(at({ submission: submission({ excused: true, missing: true }) }), NOW)).toEqual({ kind: 'excused', label: 'Excused' });
  });

  it('says "Done in Canvas" for work checked off in Canvas, even while Canvas calls it missing', () => {
    expect(itemStatus(at({ done_reason: 'marked_complete' }), NOW)).toEqual({ kind: 'done', label: 'Done in Canvas' });
    expect(itemStatus(at({ done_reason: 'marked_complete', submission: submission({ missing: true }) }), NOW))
      .toEqual({ kind: 'done', label: 'Done in Canvas' });
  });

  it('counts open work down like a task', () => {
    expect(itemStatus(at({ due_at: new Date(2026, 9, 21, 23, 0).toISOString() }), NOW)).toEqual({ kind: 'due', label: 'Due today' });
    expect(itemStatus(at({ due_at: new Date(2026, 9, 22, 9, 0).toISOString() }), NOW)).toEqual({ kind: 'due', label: 'Due tomorrow' });
    expect(itemStatus(at({}), NOW)).toEqual({ kind: 'upcoming', label: 'In 2 days' });
  });

  it('leaves past-due work unflagged unless Canvas marks it missing', () => {
    const lastWeek = new Date(2026, 9, 14, 23, 59).toISOString();
    expect(itemStatus(at({ due_at: lastWeek }), NOW)).toBeNull();
    expect(itemStatus(at({ due_at: lastWeek, submission: submission({}) }), NOW)).toBeNull();
    expect(itemStatus(at({ due_at: lastWeek, submission: submission({ missing: true }) }), NOW)).toEqual({ kind: 'slipped', label: 'Slipped' });
  });

  it('gives events, pages and notes no countdown', () => {
    expect(itemStatus(at({ kind: 'event' }), NOW)).toBeNull();
    expect(itemStatus(at({ due_at: null }), NOW)).toBeNull();
  });
});

describe('scoreLabel', () => {
  it('prefers score out of points, then the letter grade', () => {
    expect(scoreLabel({ points_possible: 20, submission: submission({ score: 18 }) })).toBe('18/20');
    expect(scoreLabel({ points_possible: 20, submission: submission({ score: 17.5 }) })).toBe('17.5/20');
    expect(scoreLabel({ points_possible: null, submission: submission({ grade: 'A-' }) })).toBe('A-');
    expect(scoreLabel({ points_possible: 20, submission: null })).toBeNull();
  });
});

describe('courseColor', () => {
  it('is stable by list position and muted for unknown courses', () => {
    expect(courseColor(7, [5, 7])).toBe(courseColor(7, [5, 7]));
    expect(courseColor(5, [5, 7])).not.toBe(courseColor(7, [5, 7]));
    expect(courseColor(9, [5, 7])).toBe('var(--tm-text-muted)');
  });
});

describe('canvasCan', () => {
  const connection = (overrides: Partial<CanvasConnection>): CanvasConnection => ({
    connected: true, status: 'active', base_url: 'https://sdsu.instructure.com', token_last4: null, canvas_user_id: null,
    canvas_user_name: null, token_expires_at: null, hidden_course_ids: [], created_at: null, updated_at: null,
    last_synced_at: null, last_error_at: null, ...overrides,
  });
  const caps = (on: CanvasCapability[]): CanvasCapabilities => ({
    upcoming: false, missing: false, recently_graded: false, courses: false, modules: false, assignments: false,
    announcements: false, link_tasks: false, submission_status: false,
    ...Object.fromEntries(on.map(c => [c, true])),
  });

  it('goes by the capabilities the backend sends', () => {
    const feed = connection({ connection_type: 'feed', capabilities: caps(['upcoming', 'link_tasks']) });
    expect(canvasConnectionType(feed)).toBe('feed');
    expect(canvasCan(feed, 'upcoming')).toBe(true);
    expect(canvasCan(feed, 'link_tasks')).toBe(true);
    expect(canvasCan(feed, 'courses')).toBe(false);
    expect(canvasCan(feed, 'announcements')).toBe(false);
    expect(canvasCan(feed, 'submission_status')).toBe(false);
  });

  it('treats a backend from before the calendar feed as a token that can show everything', () => {
    expect(canvasConnectionType(connection({}))).toBe('token');
    expect(canvasCan(connection({}), 'announcements')).toBe(true);
    expect(canvasCan(connection({ connected: false }), 'upcoming')).toBe(false);
  });
});
