import React from 'react';
import {
  BookOpen, CalendarDays, Clock, File, FileText, ListChecks, MessagesSquare, StickyNote, type LucideIcon,
} from 'lucide-react';
import type { CanvasItem, CanvasItemKind } from '@/app/types/canvas';
import { dueLabel, formatNumber, itemStatus, scoreLabel, type CanvasItemStatus } from '@/app/utils/canvas';

const KIND_ICONS: Record<CanvasItemKind, LucideIcon> = {
  assignment: FileText,
  quiz: ListChecks,
  discussion: MessagesSquare,
  page: BookOpen,
  event: CalendarDays,
  note: StickyNote,
  other: File,
};

const STATUS_STYLES: Record<CanvasItemStatus, { bg: string; fg: string }> = {
  missing: { bg: 'var(--tm-danger-subtle)', fg: 'var(--tm-danger)' },
  late: { bg: 'var(--tm-warning-subtle)', fg: 'var(--tm-warning)' },
  excused: { bg: 'var(--tm-surface-raised)', fg: 'var(--tm-text-muted)' },
  graded: { bg: 'var(--tm-accent-subtle)', fg: 'var(--tm-accent)' },
  submitted: { bg: 'var(--tm-success-subtle)', fg: 'var(--tm-success)' },
};

/** A course's short label and color, looked up from the course list. */
export type CourseLookup = (courseId: number | null) => { label: string | null; color: string };

export const StatusBadge: React.FC<{ status: CanvasItemStatus; children?: React.ReactNode }> = ({ status, children }) => (
  <span
    className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap"
    style={{ backgroundColor: STATUS_STYLES[status].bg, color: STATUS_STYLES[status].fg }}
  >
    {children ?? status}
  </span>
);

export const CourseDot: React.FC<{ label: string; color: string }> = ({ label, color }) => (
  <span className="inline-flex items-center gap-1.5 font-semibold text-text-secondary min-w-0">
    <span aria-hidden className="w-2 h-2 rounded-[2px] shrink-0" style={{ backgroundColor: color }} />
    <span className="truncate">{label}</span>
  </span>
);

/** The item's title, linking to it in Canvas when there's a link. */
export const CanvasLink: React.FC<{ href: string | null; className?: string; children: React.ReactNode }> = ({
  href,
  className = '',
  children,
}) =>
  href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`hover:underline ${className}`}>
      {children}
    </a>
  ) : (
    <span className={className}>{children}</span>
  );

interface CanvasItemRowProps {
  item: CanvasItem;
  course: CourseLookup;
  now: Date;
  /** Show the score instead of the status word on graded work. */
  showScore?: boolean;
}

const CanvasItemRow: React.FC<CanvasItemRowProps> = ({ item, course, now, showScore }) => {
  const Icon = KIND_ICONS[item.kind] ?? File;
  const status = itemStatus(item.submission);
  const { label: courseLabel, color } = course(item.course_id);
  const score = showScore ? scoreLabel(item) : null;
  return (
    <div className="flex gap-2.5 items-start p-2.5 rounded-[10px] border border-border bg-surface">
      <span
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
        style={item.kind === 'quiz'
          ? { backgroundColor: 'var(--tm-accent-subtle)', color: 'var(--tm-accent)' }
          : { backgroundColor: 'var(--tm-surface-raised)', color: 'var(--tm-text-secondary)' }}
        title={item.kind}
      >
        <Icon className="w-3.5 h-3.5" />
      </span>
      <div className="flex-1 min-w-0">
        <CanvasLink href={item.html_url} className="block text-[13px] font-semibold leading-snug text-text-primary break-words">
          {item.title}
        </CanvasLink>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1 text-xs text-text-muted">
          {(courseLabel ?? item.course_name) && <CourseDot label={(courseLabel ?? item.course_name)!} color={color} />}
          {item.due_at && (
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {dueLabel(item.due_at, now)}
            </span>
          )}
          {item.points_possible != null && <span>{formatNumber(item.points_possible)} pts</span>}
          {item.kind === 'quiz' && <span className="font-semibold text-accent">Quiz</span>}
        </div>
      </div>
      {status && (
        <div className="shrink-0">
          <StatusBadge status={status}>{status === 'graded' && score ? score : undefined}</StatusBadge>
        </div>
      )}
    </div>
  );
};

export default CanvasItemRow;
