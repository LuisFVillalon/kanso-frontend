/*
 * "Add to tasks" on Canvas items: which items can become a task, the task
 * one becomes, and the course name a task added from Canvas shows.
 */

import type { CanvasCourse, CanvasItem } from '@/app/types/canvas';
import type { BaseTaskForm, Tag } from '@/app/types/task';
import { DEFAULT_ACCENT } from '@/app/lib/theme';
import { toLocalDateStr, toLocalTimeStr } from '@/app/utils/dateUtils';

const ASSIGNMENT_PATH = /\/assignments\/(\d+)\/?$/;
const COURSE_PATH = /^\/courses\/(\d+)(?:\/|$)/;

const pathOf = (url: string | null | undefined): string | null => {
  if (!url) return null;
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
};

/**
 * The Canvas assignment an item is, which a task added from it follows, or
 * null when it isn't one (an event, a page, a note, a classic quiz or
 * discussion the backend didn't name the assignment of, or a calendar feed
 * item the backend marks as not linkable).
 */
export function canvasAssignmentId(item: CanvasItem): number | null {
  if (item.linkable === false) return null;
  if (typeof item.assignment_id === 'number') return item.assignment_id;
  // A course's assignment list: every row is an assignment, quizzes included.
  if ('submission_types' in item) return item.id;
  // Upcoming comes from Canvas's planner, where a classic quiz or a
  // discussion carries its own id, not its assignment's. A link to an
  // assignment's page names the assignment either way.
  const fromUrl = pathOf(item.html_url)?.match(ASSIGNMENT_PATH);
  if (fromUrl) return Number(fromUrl[1]);
  return item.kind === 'assignment' ? item.id : null;
}

/**
 * Work excused, or handed in or graded and not missing, has nothing left to
 * do; missing work stays open even with a grade (a 0 for work never handed
 * in), as the panel shows it "Slipped".
 */
export const isCanvasItemDone = ({ submission: sub }: CanvasItem) =>
  !!(sub?.excused || (!sub?.missing && (sub?.submitted || sub?.graded)));

/**
 * The task an item becomes: its title, its due date and time in local time,
 * the course's tag (the user's own tag of that name when there is one, else a
 * new one the backend creates) and the assignment it follows.
 */
export function canvasTaskForm(
  item: CanvasItem,
  assignmentId: number,
  courseLabel: string | null,
  tags: Tag[],
  now: Date = new Date(),
): BaseTaskForm {
  const due = item.due_at ? new Date(item.due_at) : null;
  const name = courseLabel?.trim();
  const tag = name ? tags.find(t => t.name.trim().toLowerCase() === name.toLowerCase()) ?? { id: 0, name, color: DEFAULT_ACCENT } : null;
  return {
    id: 0,
    title: item.title,
    description: '',
    priority: null,
    due_date: due ? toLocalDateStr(due) : null,
    due_time: due ? toLocalTimeStr(due) : null,
    tags: tag ? [tag] : [],
    created_date: now,
    canvas_assignment_id: assignmentId,
    canvas_html_url: item.html_url,
    canvas_due_at: item.due_at,
    canvas_due_date: item.day ?? null,
  };
}

// The course a task added from Canvas belongs to is in its link
// (/courses/{id}/...); its name is remembered from the Canvas panel's course
// list, so a task card can say "From Canvas · CS 460" while the panel is
// off screen. tm- keys are cleared on sign-out.
const COURSE_LABELS_KEY = 'tm-canvas-course-labels';

const readLabels = (): Record<string, string> => {
  try {
    const stored = JSON.parse(localStorage.getItem(COURSE_LABELS_KEY) ?? '{}');
    return stored && typeof stored === 'object' ? stored : {};
  } catch {
    return {};
  }
};

/**
 * Remembers each course's short label (its code, else its name) for canvasCourseLabel.
 * With onlyNew, courses that already have a label keep it.
 */
export function rememberCanvasCourseLabels(courses: CanvasCourse[], { onlyNew = false } = {}): void {
  const labels = readLabels();
  for (const course of courses) {
    if (!onlyNew || typeof labels[course.id] !== 'string') labels[course.id] = course.course_code ?? course.name;
  }
  try {
    localStorage.setItem(COURSE_LABELS_KEY, JSON.stringify(labels));
  } catch {
    // Storage full or blocked: the card says "From Canvas" without the course.
  }
}

/** The remembered label of the course a Canvas link is in, or null. */
export function canvasCourseLabel(htmlUrl: string | null | undefined): string | null {
  const course = pathOf(htmlUrl)?.match(COURSE_PATH);
  if (!course) return null;
  const label = readLabels()[course[1]];
  return typeof label === 'string' ? label : null;
}
