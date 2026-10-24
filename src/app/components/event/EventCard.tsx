'use client';

import React from 'react';
import { Archive, Bell, Pencil, Repeat, RotateCcw, Trash2, X } from 'lucide-react';
import AnchoredPopover from '@/app/components/common/AnchoredPopover';
import type { EventOccurrence } from '@/app/types/event';
import { parseLocalDate } from '@/app/utils/dateUtils';
import { eventColor, repeatText } from '@/app/utils/events';
import { formatLeadTime } from '@/app/utils/notifications';
import { formatMinutes, parseTimeToMinutes } from '@/app/utils/weekLayout';

/** "Friday, October 23" for a "YYYY-MM-DD" day. */
const longDay = (date: string) =>
  parseLocalDate(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

const clock = (time: string | null) => formatMinutes(parseTimeToMinutes(time ?? '') ?? 0);

/** "Friday, October 23 · 1:00 – 3:50 PM", naming both days when it runs past midnight. */
export function occurrenceWhen(o: EventOccurrence): string {
  if (o.all_day) {
    return o.end_date > o.date ? `${longDay(o.date)} – ${longDay(o.end_date)} · All day` : `${longDay(o.date)} · All day`;
  }
  if (o.end_date > o.date) return `${longDay(o.date)}, ${clock(o.start_time)} – ${longDay(o.end_date)}, ${clock(o.end_time)}`;
  return `${longDay(o.date)} · ${clock(o.start_time)} – ${clock(o.end_time)}`;
}

/** "At the start" / "15 min before". */
const reminderText = (minutes: number) => (minutes === 0 ? 'Reminder at the start' : `Reminder ${formatLeadTime(minutes)} before`);

interface EventCardProps {
  occurrence: EventOccurrence;
  past: boolean;
  anchor: DOMRect;
  /** Set while an action is saving, to keep the buttons from being pressed twice. */
  busy?: boolean;
  onClose: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}

const chipClass = 'inline-flex items-center gap-1 rounded-full px-2 py-px text-[11px] font-bold leading-[18px] whitespace-nowrap';

/**
 * The card a clicked event opens, like Google Calendar's: its title in its
 * tag color, when it happens and how it repeats, its tags and state (past,
 * archived, changed for this date), its description, and Edit, Archive (or
 * Restore) and Delete.
 */
const EventCard: React.FC<EventCardProps> = ({ occurrence: o, past, anchor, busy = false, onClose, onEdit, onArchive, onRestore, onDelete }) => {
  const repeat = repeatText(o);
  return (
    <AnchoredPopover anchor={anchor} onClose={onClose} label={`Event: ${o.title}`} initialFocus="[data-autofocus]">
      <div className="flex items-start gap-2.5">
        <span aria-hidden className="w-3 h-3 rounded-[3px] mt-1.5 flex-shrink-0" style={{ backgroundColor: eventColor(o.tags) }} />
        <h3 className={`text-base font-semibold leading-snug text-text-primary min-w-0 break-words ${o.archived ? 'line-through' : ''}`}>
          {o.title}
        </h3>
        <button type="button" onClick={onClose} className="btn btn-ghost ml-auto p-0.5 -mt-0.5" aria-label="Close">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="ml-[22px] mt-1.5 flex flex-col gap-1 text-[12.5px] text-text-secondary">
        <p>{occurrenceWhen(o)}</p>
        {repeat && <p className="flex items-center gap-1"><Repeat className="w-3.5 h-3.5" aria-hidden /> {repeat}</p>}
        {o.reminder_minutes !== null && (
          <p className="flex items-center gap-1"><Bell className="w-3.5 h-3.5" aria-hidden /> {reminderText(o.reminder_minutes)}</p>
        )}
        {(o.tags.length > 0 || past || o.archived || o.edited) && (
          <p className="flex flex-wrap items-center gap-1.5">
            {o.tags.map(tag => (
              <span key={tag.id} className={chipClass} style={{ backgroundColor: `color-mix(in srgb, ${tag.color} 18%, var(--tm-surface))`, color: 'var(--tm-text-primary)' }}>
                <span aria-hidden className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
                {tag.name}
              </span>
            ))}
            {o.archived && (
              <span className={chipClass} style={{ backgroundColor: 'var(--tm-slipped-subtle)', color: 'var(--tm-slipped-text)' }}>
                <Archive className="w-3 h-3" aria-hidden /> Archived
              </span>
            )}
            {past && !o.archived && (
              <span className={chipClass} style={{ backgroundColor: 'var(--tm-slipped-subtle)', color: 'var(--tm-text-muted)' }}>Past</span>
            )}
            {o.edited && (
              <span className={chipClass} style={{ backgroundColor: 'var(--tm-accent-subtle)', color: 'var(--tm-accent)' }}>Changed for this date</span>
            )}
          </p>
        )}
        {o.description && <p className="mt-1 whitespace-pre-wrap break-words text-[13px]">{o.description}</p>}
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-1">
        {o.archived ? (
          <button type="button" onClick={onRestore} disabled={busy} className="btn btn-secondary px-2.5 py-1 text-xs gap-1">
            <RotateCcw className="w-3.5 h-3.5" /> Restore
          </button>
        ) : (
          <button type="button" onClick={onArchive} disabled={busy} className="btn btn-secondary px-2.5 py-1 text-xs gap-1">
            <Archive className="w-3.5 h-3.5" /> Archive
          </button>
        )}
        <button type="button" onClick={onDelete} disabled={busy} className="btn btn-secondary px-2.5 py-1 text-xs gap-1" style={{ color: 'var(--tm-danger)' }}>
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </button>
        <button type="button" onClick={onEdit} disabled={busy} data-autofocus className="btn btn-primary px-2.5 py-1 text-xs gap-1">
          <Pencil className="w-3.5 h-3.5" /> Edit
        </button>
      </div>
    </AnchoredPopover>
  );
};

export default EventCard;
