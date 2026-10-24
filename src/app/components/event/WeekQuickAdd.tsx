'use client';

import React, { useState } from 'react';
import { CalendarDays, Clock, Loader2, Square, X } from 'lucide-react';
import AnchoredPopover from '@/app/components/common/AnchoredPopover';
import type { Tag } from '@/app/types/task';
import { parseLocalDate, toLocalDateStr } from '@/app/utils/dateUtils';
import { formatDuration } from '@/app/utils/duration';
import { timeRangeText, usableTermEnd, WEEKDAY_LONG } from '@/app/utils/events';
import { formatMinutes } from '@/app/utils/weekLayout';
import EventTagPicker, { toggleTag } from './EventTagPicker';

export type QuickAddKind = 'event' | 'task';

/** A range picked on the week, and what the quick-add starts out making from it. */
export interface QuickAddDraft {
  day: Date;
  startMin: number;
  endMin: number;
  kind: QuickAddKind;
}

/** What the quick-add hands back on Save or More options. */
export interface QuickAddValues {
  kind: QuickAddKind;
  title: string;
  tags: Tag[];
  /** Events only: repeat weekly on this weekday. */
  repeat: boolean;
}

interface WeekQuickAddProps {
  draft: QuickAddDraft;
  anchor: DOMRect;
  tags: Tag[];
  /** The current term's last day ("YYYY-MM-DD"), where a weekly repeat stops; null to repeat with no end. */
  termEnd: string | null;
  onClose: () => void;
  /** Resolves true once it saved. */
  onSave: (values: QuickAddValues) => Promise<boolean>;
  /** Opens the full form with what's filled in so far. */
  onMoreOptions: (values: QuickAddValues) => void;
}

const shortDay = (day: Date) => day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

/**
 * The little form beside a range picked on the week: an Event / Task switch
 * (a drag starts on Event, a click on Task), a title, tags, and for an event
 * a "repeat every week" box. Save makes it there and then; More options opens
 * the full form with it filled in.
 */
const WeekQuickAdd: React.FC<WeekQuickAddProps> = ({ draft, anchor, tags, termEnd, onClose, onSave, onMoreOptions }) => {
  const [kind, setKind] = useState<QuickAddKind>(draft.kind);
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState<Tag[]>([]);
  const [repeat, setRepeat] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const values: QuickAddValues = { kind, title, tags: picked, repeat: kind === 'event' && repeat };
  const repeatEnd = usableTermEnd(termEnd, toLocalDateStr(draft.day));
  const termEndLabel = repeatEnd
    ? parseLocalDate(repeatEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError(`Give the ${kind} a title first.`);
      return;
    }
    setSaving(true);
    try {
      if (await onSave(values)) onClose();
    } finally {
      setSaving(false);
    }
  };

  const when = kind === 'event'
    ? `${shortDay(draft.day)} · ${timeRangeText(draft.startMin, draft.endMin)}`
    : `${shortDay(draft.day)} · due ${formatMinutes(draft.startMin)} · ${formatDuration((draft.endMin - draft.startMin) / 60)} estimate`;

  return (
    <AnchoredPopover anchor={anchor} onClose={onClose} label={kind === 'event' ? 'New event' : 'New task'} initialFocus="input[name=quick-title]">
      <form onSubmit={handleSave} noValidate>
        <div className="flex items-center justify-between mb-2">
          <div role="group" aria-label="Make a" className="inline-flex gap-0.5 rounded-lg border border-border p-[3px]" style={{ backgroundColor: 'var(--tm-surface)' }}>
            {([['event', 'Event', CalendarDays], ['task', 'Task', Square]] as const).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                aria-pressed={kind === value}
                onClick={() => setKind(value)}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px]"
                style={kind === value
                  ? { backgroundColor: 'var(--tm-accent-subtle)', color: 'var(--tm-accent)', fontWeight: 700 }
                  : { color: 'var(--tm-text-secondary)', fontWeight: 500 }}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden /> {label}
              </button>
            ))}
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost p-0.5" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <input
          name="quick-title"
          type="text"
          value={title}
          maxLength={500}
          onChange={e => { setTitle(e.target.value); setError(null); }}
          placeholder={kind === 'event' ? 'Add a title' : 'Task title'}
          aria-label={kind === 'event' ? 'Event title' : 'Task title'}
          aria-invalid={error ? true : undefined}
          className="input-field px-3 py-2 text-sm"
          autoComplete="off"
        />
        {error && <p role="alert" className="mt-1 text-xs" style={{ color: 'var(--tm-danger)' }}>{error}</p>}

        <p className="my-2 flex items-center gap-1.5 text-xs text-text-secondary">
          <Clock className="w-3.5 h-3.5" aria-hidden /> {when}
        </p>

        <EventTagPicker
          tags={tags}
          selected={picked}
          onToggle={tag => setPicked(prev => toggleTag(prev, tag))}
          className="max-h-16 overflow-y-auto scrollbar-custom"
        />

        {kind === 'event' && (
          <label className="mt-2 flex items-center gap-2 text-xs text-text-secondary">
            <input type="checkbox" checked={repeat} onChange={e => setRepeat(e.target.checked)} />
            Repeat every {WEEKDAY_LONG[draft.day.getDay()]}{termEndLabel ? ` until ${termEndLabel}` : ''}
          </label>
        )}

        <div className="mt-3 flex items-center justify-end gap-2">
          <button type="button" onClick={() => onMoreOptions(values)} disabled={saving} className="btn btn-ghost px-2.5 py-1 text-xs">
            More options
          </button>
          <button type="submit" disabled={saving} className="btn btn-primary px-3 py-1 text-xs">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-label="Saving" /> : 'Save'}
          </button>
        </div>
      </form>
    </AnchoredPopover>
  );
};

export default WeekQuickAdd;
