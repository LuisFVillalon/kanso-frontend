import type {
  CanvasCapability, CanvasClassSummary, CanvasConnection, CanvasConnectionType, CanvasCourseSummary, CanvasItem,
} from '@/app/types/canvas';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import { getDueStatus, type DueStatus } from '@/app/utils/taskUtils';
import { addDays, startOfWeek } from '@/app/utils/weekLayout';

/** How a connection is made; a backend from before the calendar feed sends no type, so it's a token. */
export const canvasConnectionType = (connection: CanvasConnection): CanvasConnectionType =>
  connection.connection_type ?? 'token';

/**
 * Whether a connection can show `capability`, as the backend says; a backend
 * from before the calendar feed sends no capabilities, and a token there
 * can show everything.
 */
export function canvasCan(connection: CanvasConnection, capability: CanvasCapability): boolean {
  return connection.capabilities ? connection.capabilities[capability] ?? false : connection.connected;
}

const MINUTE_MS = 60 * 1000;

/** "Synced just now", "Synced 3 min ago", "Synced 2 h ago", or the date for older data. */
export function syncedLabel(fetchedAt: string, now: Date): string {
  const fetched = new Date(fetchedAt);
  const minutes = Math.floor((now.getTime() - fetched.getTime()) / MINUTE_MS);
  if (minutes < 1) return 'Synced just now';
  if (minutes < 60) return `Synced ${minutes} min ago`;
  if (minutes < 24 * 60) return `Synced ${Math.floor(minutes / 60)} h ago`;
  return `Synced ${fetched.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export const formatShortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** "Today", "Tomorrow", "Yesterday" or the weekday, for the local day `iso` falls on. */
export function relativeDay(iso: string, now: Date): string {
  const day = new Date(iso);
  const diff = Math.round(
    (new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime()
      - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / (24 * 60 * MINUTE_MS),
  );
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return day.toLocaleDateString(undefined, { weekday: 'long' });
}

/** A due date for an item row: "Today 11:59 PM", "Fri 11:59 PM" this week, else "Oct 30 11:59 PM". */
export function dueLabel(iso: string, now: Date): string {
  const rel = relativeDay(iso, now);
  const days = Math.abs(new Date(iso).getTime() - now.getTime()) / (24 * 60 * MINUTE_MS);
  const day = rel === 'Today' || rel === 'Tomorrow' || rel === 'Yesterday'
    ? rel
    : days < 6 ? new Date(iso).toLocaleDateString(undefined, { weekday: 'short' }) : formatShortDate(iso);
  return `${day} ${formatTime(iso)}`;
}

export interface CanvasDayGroup {
  key: string;
  label: string;
  date: string;
  items: CanvasItem[];
}

/** Groups items (already soonest first) by the local day they're due; undated ones go last. */
export function groupByDay(items: CanvasItem[], now: Date): CanvasDayGroup[] {
  const groups: CanvasDayGroup[] = [];
  for (const item of items) {
    const key = item.due_at ? toLocalDateStr(new Date(item.due_at)) : 'undated';
    let group = groups.find(g => g.key === key);
    if (!group) {
      group = item.due_at
        ? { key, label: relativeDay(item.due_at, now), date: formatShortDate(item.due_at), items: [] }
        : { key, label: 'No due date', date: '', items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups.sort((a, b) => (a.key === 'undated' ? 1 : b.key === 'undated' ? -1 : a.key.localeCompare(b.key)));
}

/** Local midnight of the day `date` falls on. */
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** Splits items (soonest first) into those due before today and the rest; undated ones count as ahead. */
export function splitEarlier(items: CanvasItem[], now: Date): { earlier: CanvasItem[]; ahead: CanvasItem[] } {
  const today = startOfDay(now).getTime();
  const earlier: CanvasItem[] = [];
  const ahead: CanvasItem[] = [];
  for (const item of items) {
    (item.due_at && new Date(item.due_at).getTime() < today ? earlier : ahead).push(item);
  }
  return { earlier, ahead };
}

/** The items due from the start of today through the next `days` days. */
export function dueWithin(items: CanvasItem[], now: Date, days: number): CanvasItem[] {
  const start = startOfDay(now).getTime();
  const end = addDays(now, days).getTime();
  return items.filter(item => {
    const due = item.due_at ? new Date(item.due_at).getTime() : NaN;
    return due >= start && due < end;
  });
}

export interface CanvasWeekGroup {
  /** The week's Monday ("2026-10-19"), or "undated". */
  key: string;
  /** "This week", "Next week", or the week's dates. */
  label: string;
  /** The week's dates beside "This week" and "Next week"; null otherwise. */
  span: string | null;
  /** The month a divider names above this week, when it's the list's first week in that month. */
  month: string | null;
  days: CanvasDayGroup[];
  count: number;
}

const shortDay = (date: Date) => date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** "Oct 19 – 25", or "Oct 26 – Nov 1" across a month's end. */
function weekSpan(monday: Date): string {
  const sunday = addDays(monday, 6);
  return monday.getMonth() === sunday.getMonth()
    ? `${shortDay(monday)} – ${sunday.getDate()}`
    : `${shortDay(monday)} – ${shortDay(sunday)}`;
}

/**
 * Groups items (already soonest first) by the Monday-start week they're due
 * in, each week by day, naming each month once above its first week. Undated
 * ones go last.
 */
export function groupByWeek(items: CanvasItem[], now: Date): CanvasWeekGroup[] {
  const thisWeek = startOfWeek(now).getTime();
  const nextWeek = addDays(startOfWeek(now), 7).getTime();
  const byWeek = new Map<string, CanvasItem[]>();
  for (const item of items) {
    const key = item.due_at ? toLocalDateStr(startOfWeek(new Date(item.due_at))) : 'undated';
    byWeek.set(key, [...(byWeek.get(key) ?? []), item]);
  }
  const keys = [...byWeek.keys()].sort((a, b) => (a === 'undated' ? 1 : b === 'undated' ? -1 : a.localeCompare(b)));
  let lastMonth: string | null = null;
  return keys.map(key => {
    const weekItems = byWeek.get(key)!;
    const days = groupByDay(weekItems, now);
    if (key === 'undated') return { key, label: 'No due date', span: null, month: null, days, count: weekItems.length };
    const [year, month, day] = key.split('-').map(Number);
    const monday = new Date(year, month - 1, day);
    const first = new Date(weekItems.find(i => i.due_at)!.due_at!);
    const monthName = first.toLocaleDateString(undefined, first.getFullYear() === now.getFullYear()
      ? { month: 'long' }
      : { month: 'long', year: 'numeric' });
    const monthDivider = monthName !== lastMonth ? monthName : null;
    lastMonth = monthName;
    const time = monday.getTime();
    const near = time === thisWeek ? 'This week' : time === nextWeek ? 'Next week' : null;
    return {
      key,
      label: near ?? weekSpan(monday),
      span: near ? weekSpan(monday) : null,
      month: monthDivider,
      days,
      count: weekItems.length,
    };
  });
}

/**
 * A class the panel lists: a course from a token's course list, or one found
 * in the calendar feed's due dates, where Canvas names each item's class by
 * its code.
 */
export interface CanvasClass {
  id: number;
  /** The course code, else its name: what the class is called and what its Canvas tag is named. */
  label: string;
  /** The full course name, when Canvas sends one beside the code (a token). */
  name: string | null;
  term: string | null;
  /** Hidden from the panel by the user (connection.hidden_course_ids). */
  hidden: boolean;
  /** A token's course, with its grade and modules; null for a calendar feed. */
  course: CanvasCourseSummary | null;
}

/**
 * The user's classes in a stable order, hidden ones last: the backend's class
 * list when it sent one (`summaries`), each with its token course from
 * `courses`. Without it, a token's course list as Canvas orders it, else (a
 * calendar feed) the courses in `items` in the order their work comes due,
 * with hidden classes, whose work the backend leaves out, named by `labelOf`
 * (a remembered label).
 */
export function canvasClasses({ summaries, courses, items, hiddenIds, labelOf }: {
  summaries: CanvasClassSummary[] | null;
  courses: CanvasCourseSummary[] | null;
  items: CanvasItem[];
  hiddenIds: number[];
  labelOf: (courseId: number) => string | null;
}): CanvasClass[] {
  let classes: CanvasClass[];
  if (summaries) {
    classes = summaries.map(summary => ({
      id: summary.id,
      label: summary.code,
      name: summary.name && summary.name !== summary.code ? summary.name : null,
      term: summary.term,
      hidden: summary.hidden,
      course: courses?.find(c => c.id === summary.id) ?? null,
    }));
  } else {
    classes = courses
      ? courses.map(course => ({
        id: course.id,
        label: course.course_code ?? course.name,
        name: course.course_code ? course.name : null,
        term: course.term,
        hidden: false,
        course,
      }))
      : [];
    if (!courses) {
      for (const item of items) {
        if (item.course_id == null || classes.some(c => c.id === item.course_id)) continue;
        const label = item.course_name ?? labelOf(item.course_id);
        if (label) classes.push({ id: item.course_id, label, name: null, term: null, hidden: false, course: null });
      }
    }
    for (const id of hiddenIds) {
      const existing = classes.find(c => c.id === id);
      if (existing) existing.hidden = true;
      else classes.push({ id, label: labelOf(id) ?? `Course ${id}`, name: null, term: null, hidden: true, course: null });
    }
  }
  return [...classes.filter(c => !c.hidden), ...classes.filter(c => c.hidden)];
}

/** A Canvas item's chip: the task status chips, plus "Excused", which has no task equivalent. */
export type CanvasItemStatus = DueStatus | { kind: 'excused'; label: string };

// Kinds the user hands something in for; events, pages and notes only have a date.
const SUBMITTABLE = new Set<CanvasItem['kind']>(['assignment', 'quiz', 'discussion']);

/**
 * The chip an item shows, in the brand's status language: work Canvas
 * marks missing is "Slipped" (never red), handed-in work is done, and open
 * work counts down like a task ("Due today", "In 3 days"). Null when there's
 * nothing to say, including past-due work Canvas doesn't call missing.
 */
export function itemStatus(item: Pick<CanvasItem, 'kind' | 'due_at' | 'points_possible' | 'submission'>, now: Date): CanvasItemStatus | null {
  const sub = item.submission;
  if (sub?.excused) return { kind: 'excused', label: 'Excused' };
  if (sub?.missing) return { kind: 'slipped', label: 'Slipped' };
  if (sub?.graded) return { kind: 'done', label: scoreLabel(item) ?? 'Graded' };
  if (sub?.late) return { kind: 'slipped', label: 'Late' };
  if (sub?.submitted) return { kind: 'done', label: 'Submitted' };
  if (!item.due_at || !SUBMITTABLE.has(item.kind)) return null;
  const status = getDueStatus({ completed: false, due_date: toLocalDateStr(new Date(item.due_at)) }, now);
  return status?.kind === 'slipped' ? null : status;
}

/** "18/20", "A-" or "92%": the grade a graded item shows. */
export function scoreLabel(item: Pick<CanvasItem, 'points_possible' | 'submission'>): string | null {
  const sub = item.submission;
  if (!sub) return null;
  if (sub.score != null && item.points_possible) return `${formatNumber(sub.score)}/${formatNumber(item.points_possible)}`;
  if (sub.grade) return sub.grade;
  if (sub.score != null) return formatNumber(sub.score);
  return null;
}

export const formatNumber = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

// Canvas sends no course colors through the API, so each course takes a
// color by its place in the course list. Never key red or coral: red is
// brand-only, and kanso doesn't paint coursework red.
const COURSE_COLORS = ['var(--tm-accent)', 'var(--tm-mood-4)', 'var(--tm-mood-3)', 'var(--tm-success)', 'var(--tm-pencil)', 'var(--tm-mood-5)'];

/** A stable color for `courseId`, given the course ids in list order. */
export function courseColor(courseId: number | null, courseIds: number[]): string {
  const i = courseId == null ? -1 : courseIds.indexOf(courseId);
  return i === -1 ? 'var(--tm-text-muted)' : COURSE_COLORS[i % COURSE_COLORS.length];
}
