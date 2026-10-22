import { describe, expect, it } from 'vitest';
import type { CanvasCapabilities, CanvasCapability, CanvasConnection, CanvasItem, CanvasSubmission } from '@/app/types/canvas';
import { canvasCan, canvasConnectionType, courseColor, groupByDay, itemStatus, scoreLabel, syncedLabel } from './canvas';

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

describe('itemStatus', () => {
  const at = (overrides: Partial<CanvasItem>) => ({ ...item(1, new Date(2026, 9, 23, 23, 59)), ...overrides });

  it('says missed work slipped and handed-in work is done, never red', () => {
    expect(itemStatus(at({ submission: submission({ missing: true, late: true }) }), NOW)).toEqual({ kind: 'slipped', label: 'Slipped' });
    expect(itemStatus(at({ submission: submission({ late: true, submitted: true }) }), NOW)).toEqual({ kind: 'slipped', label: 'Late' });
    expect(itemStatus(at({ submission: submission({ submitted: true }) }), NOW)).toEqual({ kind: 'done', label: 'Submitted' });
    expect(itemStatus(at({ points_possible: 20, submission: submission({ graded: true, score: 18 }) }), NOW)).toEqual({ kind: 'done', label: '18/20' });
    expect(itemStatus(at({ submission: submission({ excused: true, missing: true }) }), NOW)).toEqual({ kind: 'excused', label: 'Excused' });
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
