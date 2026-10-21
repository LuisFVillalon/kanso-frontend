import React from 'react';
import { Calendar, Check, CircleAlert, Clock } from 'lucide-react';
import type { DueStatus, DueStatusKind } from '@/app/utils/taskUtils';

// The status chips from brand/DESIGN.md: every state pairs its color with an
// icon and a word, never color alone, and a slipped task gets a quiet pencil
// chip with an amber dot instead of red.
const STATUS_STYLES: Record<DueStatusKind, { bg: string; text: string }> = {
  done:     { bg: 'var(--tm-success-subtle)',  text: 'var(--tm-success-text)' },
  upcoming: { bg: 'var(--tm-upcoming-subtle)', text: 'var(--tm-upcoming-text)' },
  due:      { bg: 'var(--tm-due-subtle)',      text: 'var(--tm-due-text)' },
  slipped:  { bg: 'var(--tm-slipped-subtle)',  text: 'var(--tm-slipped-text)' },
  later:    { bg: 'var(--tm-surface-raised)',  text: 'var(--tm-text-muted)' },
};

const StatusIcon: React.FC<{ kind: DueStatusKind; className: string }> = ({ kind, className }) => {
  switch (kind) {
    case 'done': return <Check className={className} strokeWidth={3} aria-hidden />;
    case 'upcoming': return <Clock className={className} aria-hidden />;
    case 'due': return <CircleAlert className={className} aria-hidden />;
    case 'later': return <Calendar className={className} aria-hidden />;
    case 'slipped':
      return (
        <span aria-hidden className="flex items-center justify-center w-3 h-3 flex-shrink-0">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--tm-slipped-dot)' }} />
        </span>
      );
  }
};

interface TaskStatusChipProps {
  status: DueStatus;
  /** sm for compact rows (linked tasks, previews); md for task cards. */
  size?: 'sm' | 'md';
  className?: string;
}

const TaskStatusChip: React.FC<TaskStatusChipProps> = ({ status, size = 'md', className = '' }) => {
  const { bg, text } = STATUS_STYLES[status.kind];
  return (
    <span
      className={`chip flex-shrink-0 ${size === 'sm' ? 'gap-1 px-2 py-0.5 text-[11px]' : ''} ${className}`}
      style={{ backgroundColor: bg, color: text }}
    >
      <StatusIcon kind={status.kind} className="w-3 h-3 flex-shrink-0" />
      {status.label}
    </span>
  );
};

export default TaskStatusChip;
