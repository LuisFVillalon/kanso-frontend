import React from 'react';
import {
  BookOpen, CalendarDays, Clock, File, FileText, ListChecks, MessagesSquare, Minus, StickyNote, type LucideIcon,
} from 'lucide-react';
import TaskStatusChip from '@/app/components/task/TaskStatusChip';
import type { CanvasItem, CanvasItemKind } from '@/app/types/canvas';
import { dueLabel, formatNumber, itemStatus, type CanvasItemStatus } from '@/app/utils/canvas';

const KIND_ICONS: Record<CanvasItemKind, LucideIcon> = {
  assignment: FileText,
  quiz: ListChecks,
  discussion: MessagesSquare,
  page: BookOpen,
  event: CalendarDays,
  note: StickyNote,
  other: File,
};

/** A course's short label and color, looked up from the course list. */
export type CourseLookup = (courseId: number | null) => { label: string | null; color: string };

/** An item's status chip: the task status chips, and a neutral one for excused work. */
export const CanvasStatusChip: React.FC<{ status: CanvasItemStatus }> = ({ status }) =>
  status.kind === 'excused' ? (
    <span
      className="chip flex-shrink-0 gap-1 px-2 py-0.5 text-[11px]"
      style={{ backgroundColor: 'var(--tm-surface-raised)', color: 'var(--tm-text-secondary)' }}
    >
      <Minus className="w-3 h-3 flex-shrink-0" aria-hidden />
      {status.label}
    </span>
  ) : (
    <TaskStatusChip status={status} size="sm" />
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
}

const CanvasItemRow: React.FC<CanvasItemRowProps> = ({ item, course, now }) => {
  const Icon = KIND_ICONS[item.kind] ?? File;
  const status = itemStatus(item, now);
  const { label: courseLabel, color } = course(item.course_id);
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
          <CanvasStatusChip status={status} />
        </div>
      )}
    </div>
  );
};

export default CanvasItemRow;
