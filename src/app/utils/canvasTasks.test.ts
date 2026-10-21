// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { CanvasAssignment, CanvasItem } from '@/app/types/canvas';
import type { Tag } from '@/app/types/task';
import { DEFAULT_ACCENT } from '@/app/lib/theme';
import {
  canvasAssignmentId, canvasCourseLabel, canvasTaskForm, isCanvasItemDone, rememberCanvasCourseLabels,
} from './canvasTasks';

const HOST = 'https://sdsu.instructure.com';

const item = (extra: Partial<CanvasItem> = {}): CanvasItem => ({
  id: 9876,
  kind: 'assignment',
  title: 'Problem Set 6',
  course_id: 1001,
  course_name: 'CS 460: Algorithms',
  // 11:59 PM local on Oct 23, whatever zone the tests run in.
  due_at: new Date(2026, 9, 23, 23, 59).toISOString(),
  points_possible: 20,
  html_url: `${HOST}/courses/1001/assignments/9876`,
  submission: null,
  ...extra,
});

const assignment = (extra: Partial<CanvasAssignment> = {}): CanvasAssignment => ({
  ...item(),
  unlock_at: null,
  lock_at: null,
  quiz_id: null,
  submission_types: ['online_upload'],
  ...extra,
});

const sub = (flags: Partial<NonNullable<CanvasItem['submission']>>) => ({
  submitted: false, missing: false, late: false, graded: false, excused: false,
  score: null, grade: null, submitted_at: null, graded_at: null, ...flags,
});

afterEach(() => localStorage.clear());

describe('canvasAssignmentId', () => {
  it("is a planner assignment's own id", () => {
    expect(canvasAssignmentId(item({ html_url: null }))).toBe(9876);
  });

  it('reads the assignment from the link of a New Quizzes quiz', () => {
    expect(canvasAssignmentId(item({ id: 5, kind: 'quiz', html_url: `${HOST}/courses/1001/assignments/77` }))).toBe(77);
  });

  it("isn't known for a classic quiz or discussion the backend didn't name the assignment of", () => {
    expect(canvasAssignmentId(item({ id: 5, kind: 'quiz', html_url: `${HOST}/courses/1001/quizzes/5` }))).toBeNull();
    expect(canvasAssignmentId(item({ id: 6, kind: 'discussion', html_url: `${HOST}/courses/1001/discussion_topics/6` })))
      .toBeNull();
  });

  it('takes the assignment id the backend sends', () => {
    expect(canvasAssignmentId(item({ id: 5, kind: 'quiz', html_url: null, assignment_id: 88 }))).toBe(88);
  });

  it("is a course assignment's id, quizzes included", () => {
    expect(canvasAssignmentId(assignment({ id: 31, kind: 'quiz', quiz_id: 4, html_url: `${HOST}/courses/1001/quizzes/4` })))
      .toBe(31);
  });

  it("isn't known for events, pages and notes", () => {
    expect(canvasAssignmentId(item({ kind: 'event', html_url: `${HOST}/calendar` }))).toBeNull();
    expect(canvasAssignmentId(item({ kind: 'page', html_url: `${HOST}/courses/1001/pages/intro` }))).toBeNull();
  });
});

describe('isCanvasItemDone', () => {
  it('is true for submitted, graded or excused work only', () => {
    expect(isCanvasItemDone(item())).toBe(false);
    expect(isCanvasItemDone(item({ submission: sub({ missing: true }) }))).toBe(false);
    expect(isCanvasItemDone(item({ submission: sub({ submitted: true }) }))).toBe(true);
    expect(isCanvasItemDone(item({ submission: sub({ graded: true }) }))).toBe(true);
    expect(isCanvasItemDone(item({ submission: sub({ excused: true }) }))).toBe(true);
  });

  it('keeps missing work open even when graded, unless excused', () => {
    expect(isCanvasItemDone(item({ submission: sub({ missing: true, graded: true, score: 0 }) }))).toBe(false);
    expect(isCanvasItemDone(item({ submission: sub({ missing: true, excused: true }) }))).toBe(true);
  });
});

describe('canvasTaskForm', () => {
  const tags: Tag[] = [{ id: 3, name: 'cs 460', color: '#123456' }];

  it('maps the title, due_at in local time and the link', () => {
    const form = canvasTaskForm(item(), 9876, 'MATH 254', []);
    expect(form).toMatchObject({
      title: 'Problem Set 6',
      description: '',
      priority: null,
      due_date: '2026-10-23',
      due_time: '23:59',
      canvas_assignment_id: 9876,
      canvas_html_url: `${HOST}/courses/1001/assignments/9876`,
      canvas_due_at: item().due_at,
    });
  });

  it('sends no canvas_due_at for an item without a due date', () => {
    expect(canvasTaskForm(item({ due_at: null }), 9876, null, []).canvas_due_at).toBeNull();
  });

  it('keeps the local day when due_at is already the next day in UTC', () => {
    const lateNight = new Date(2026, 11, 31, 23, 30);
    const form = canvasTaskForm(item({ due_at: lateNight.toISOString() }), 1, null, []);
    expect(form.due_date).toBe('2026-12-31');
    expect(form.due_time).toBe('23:30');
  });

  it('leaves the date and time empty without a due date', () => {
    const form = canvasTaskForm(item({ due_at: null }), 1, null, []);
    expect(form.due_date).toBeNull();
    expect(form.due_time).toBeNull();
  });

  it("uses the user's own tag of the course's name, whatever its case", () => {
    expect(canvasTaskForm(item(), 1, 'CS 460', tags).tags).toEqual([tags[0]]);
  });

  it('names a new tag after the course when the user has none', () => {
    expect(canvasTaskForm(item(), 1, ' MATH 254 ', tags).tags).toEqual([{ id: 0, name: 'MATH 254', color: DEFAULT_ACCENT }]);
  });

  it('has no tag without a course', () => {
    expect(canvasTaskForm(item(), 1, null, tags).tags).toEqual([]);
  });
});

describe('canvasCourseLabel', () => {
  it("names the course of a task's link from the remembered course list", () => {
    rememberCanvasCourseLabels([
      { id: 1001, name: 'CS 460: Algorithms', course_code: 'CS 460' },
      { id: 1002, name: 'Linear Algebra', course_code: null },
    ]);
    expect(canvasCourseLabel(`${HOST}/courses/1001/assignments/9876`)).toBe('CS 460');
    expect(canvasCourseLabel(`${HOST}/courses/1002/assignments/1`)).toBe('Linear Algebra');
  });

  it('is null for an unknown course or a link without one', () => {
    expect(canvasCourseLabel(`${HOST}/courses/5/assignments/1`)).toBeNull();
    expect(canvasCourseLabel(`${HOST}/calendar`)).toBeNull();
    expect(canvasCourseLabel('not a url')).toBeNull();
    expect(canvasCourseLabel(null)).toBeNull();
  });
});
