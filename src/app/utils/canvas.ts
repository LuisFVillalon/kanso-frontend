import type { CanvasItem, CanvasSubmission } from '@/app/types/canvas';
import { toLocalDateStr } from '@/app/utils/dateUtils';

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

export type CanvasItemStatus = 'missing' | 'late' | 'excused' | 'graded' | 'submitted';

/** The badge an item's submission earns, most urgent first; null when there's nothing to say. */
export function itemStatus(submission: CanvasSubmission | null): CanvasItemStatus | null {
  if (!submission) return null;
  if (submission.missing) return 'missing';
  if (submission.late) return 'late';
  if (submission.excused) return 'excused';
  if (submission.graded) return 'graded';
  if (submission.submitted) return 'submitted';
  return null;
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
// feature color by its place in the course list.
const COURSE_COLORS = ['var(--tm-accent)', 'var(--marigold)', 'var(--tm-success)', 'var(--tm-accent-2)', 'var(--mocha)', 'var(--sky-wash)'];

/** A stable color for `courseId`, given the course ids in list order. */
export function courseColor(courseId: number | null, courseIds: number[]): string {
  const i = courseId == null ? -1 : courseIds.indexOf(courseId);
  return i === -1 ? 'var(--tm-text-muted)' : COURSE_COLORS[i % COURSE_COLORS.length];
}
