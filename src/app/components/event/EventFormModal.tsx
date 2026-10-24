'use client';

import React, { useId, useState } from 'react';
import { Archive, CalendarDays, Loader2, Repeat, Trash2, X } from 'lucide-react';
import Modal from '@/app/components/common/Modal';
import { useOptionalNotifications } from '@/app/context/NotificationsContextValue';
import type { Tag } from '@/app/types/task';
import { parseLocalDate } from '@/app/utils/dateUtils';
import {
  eventFormErrors,
  eventFormSummary,
  eventFormWarnings,
  formSeriesStart,
  isRepeating,
  REPEAT_INTERVAL_MAX,
  usableTermEnd,
  WEEKDAY_LETTER,
  WEEKDAY_LONG,
  type EventFormValues,
  type RepeatChoice,
} from '@/app/utils/events';
import { formatLeadTime } from '@/app/utils/notifications';
import { MINUTES_PER_DAY, minutesToTimeStr, parseTimeToMinutes, type WindowMinutes } from '@/app/utils/weekLayout';
import type { EventOccurrence } from '@/app/types/event';
import EventTagPicker, { toggleTag } from './EventTagPicker';

/** Reminder leads offered, in minutes before the start; null is none. */
const REMINDER_CHOICES: (number | null)[] = [null, 0, 5, 10, 15, 30, 60, 120, 1440, 10080];

/** "Dec 11". */
const shortDate = (date: string) => parseLocalDate(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const reminderLabel = (minutes: number | null) =>
  minutes === null ? 'No reminder' : minutes === 0 ? 'At the start' : `${formatLeadTime(minutes)} before`;

/** One-click day sets for a repeat, 0=Sun..6=Sat. */
const DAY_PRESETS: { label: string; days: number[] }[] = [
  { label: 'Mon / Wed / Fri', days: [1, 3, 5] },
  { label: 'Tue / Thu', days: [2, 4] },
  { label: 'Weekdays', days: [1, 2, 3, 4, 5] },
];

const REPEAT_OPTIONS: { value: RepeatChoice; label: string }[] = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'custom', label: 'Every few weeks…' },
];

export interface EventFormContext {
  restDays: number[];
  windowOn: (weekday: number) => WindowMinutes;
  /** Occurrences on screen, to warn about overlaps; leave out the event being edited. */
  others: EventOccurrence[];
  /** The current term, for "Ends: end of term"; null when there's none. */
  term: { title: string; endDate: string } | null;
}

interface EventFormModalProps {
  mode: 'new' | 'edit';
  initial: EventFormValues;
  tags: Tag[];
  context: EventFormContext;
  /** Saves the form; resolves true when it saved (and the modal can close). */
  onSubmit: (values: EventFormValues) => Promise<boolean>;
  onClose: () => void;
  /** Edit only: archive or delete the event instead. */
  onArchive?: () => void;
  onDelete?: () => void;
}

const labelClass = 'block text-sm font-medium text-text-secondary mb-1.5';

/**
 * The New / Edit event modal, in the same frame as New Task: title, tags,
 * day and times (or all day), how it repeats (weekly on chosen days, every 2
 * weeks, or every N weeks), when the repeat ends, a reminder and a
 * description. A live line sums it up ("Every Mon, Wed and Fri · 5:00 – 6:00
 * PM · Oct 26 – Dec 11, 21 events"), and notes that don't block saving point
 * out rest days, the work window and overlaps.
 */
const EventFormModal: React.FC<EventFormModalProps> = ({ mode, initial, tags, context, onSubmit, onClose, onArchive, onDelete }) => {
  const id = useId();
  const [form, setForm] = useState<EventFormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const notifications = useOptionalNotifications();
  const showReminder = !!notifications && notifications.status !== 'unavailable';

  const termEnd = usableTermEnd(context.term?.endDate ?? null, formSeriesStart(form));
  const errors = eventFormErrors(form, termEnd);
  const warnings = eventFormWarnings(form, context);
  const summary = eventFormSummary(form, termEnd);
  const repeating = isRepeating(form);
  // With no term left to end with, "end of term" reads as its own date.
  const endMode = form.endMode === 'term' && !termEnd ? 'on' : form.endMode;
  const set = (patch: Partial<EventFormValues>) => setForm(prev => ({ ...prev, ...patch }));

  const setStart = (value: string) => {
    const oldStart = parseTimeToMinutes(form.startTime);
    const oldEnd = parseTimeToMinutes(form.endTime);
    const next = parseTimeToMinutes(value);
    if (oldStart === null || oldEnd === null || next === null) return set({ startTime: value });
    // Keep the length: moving the start moves the end with it.
    const length = (oldEnd - oldStart + MINUTES_PER_DAY) % MINUTES_PER_DAY || 60;
    set({ startTime: value, endTime: minutesToTimeStr((next + length) % MINUTES_PER_DAY) });
  };

  const setRepeat = (repeat: RepeatChoice) => {
    const days = form.repeatDays.length ? form.repeatDays : [parseLocalDate(form.date).getDay()];
    set({ repeat, repeatDays: days });
  };

  const toggleDay = (day: number) => {
    const has = form.repeatDays.includes(day);
    set({ repeatDays: has ? form.repeatDays.filter(d => d !== day) : [...form.repeatDays, day].sort((a, b) => a - b) });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (errors.length) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    try {
      if (await onSubmit(form)) onClose();
    } finally {
      setSaving(false);
    }
  };

  const reminderChoices = form.reminderMinutes !== null && !REMINDER_CHOICES.includes(form.reminderMinutes)
    ? [...REMINDER_CHOICES, form.reminderMinutes]
    : REMINDER_CHOICES;
  const endOfTermLabel = context.term && termEnd
    ? `End of term (${context.term.title}, ${shortDate(termEnd)})`
    : null;

  return (
    // While saving (which may wait on the "which events?" dialog above), Escape and the backdrop belong to that.
    <Modal
      onClose={onClose}
      closeOnEscape={!saving}
      closeOnBackdropClick={!saving}
      panelClassName="modal-panel max-w-lg w-full max-h-[90vh] overflow-y-auto scrollbar-custom"
    >
      <div
        className="sticky top-0 z-30 px-6 py-4 flex items-center justify-between border-b border-border-subtle"
        style={{ backgroundColor: 'var(--tm-surface)' }}
      >
        <h2 className="text-xl text-text-primary">{mode === 'edit' ? 'Edit event' : 'New event'}</h2>
        <button type="button" onClick={onClose} className="btn btn-ghost" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-4" noValidate>
        <div>
          <label htmlFor={`${id}-title`} className={labelClass}>
            Title <span style={{ color: 'var(--tm-danger)' }}>*</span>
          </label>
          <input
            id={`${id}-title`}
            type="text"
            autoFocus
            required
            maxLength={500}
            value={form.title}
            onChange={e => set({ title: e.target.value })}
            placeholder="e.g. CS 460 Lecture"
            className="input-field"
            autoComplete="off"
          />
        </div>

        <div>
          <span id={`${id}-tags`} className={labelClass}>Tags</span>
          <EventTagPicker
            aria-labelledby={`${id}-tags`}
            tags={tags}
            selected={form.tags}
            onToggle={tag => set({ tags: toggleTag(form.tags, tag) })}
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[9.5rem]">
            <label htmlFor={`${id}-date`} className={labelClass}>{repeating && mode === 'new' ? 'Starts' : 'Date'}</label>
            <input id={`${id}-date`} type="date" value={form.date} onChange={e => set({ date: e.target.value })} className="input-field px-3" />
          </div>
          <div className="w-[8.5rem]">
            <label htmlFor={`${id}-start`} className={labelClass}>Start</label>
            <input
              id={`${id}-start`} type="time" step={900} value={form.startTime} disabled={form.allDay}
              onChange={e => setStart(e.target.value)} className="input-field px-3 disabled:opacity-50"
            />
          </div>
          <div className="w-[8.5rem]">
            <label htmlFor={`${id}-end`} className={labelClass}>End</label>
            <input
              id={`${id}-end`} type="time" step={900} value={form.endTime} disabled={form.allDay}
              onChange={e => set({ endTime: e.target.value })} className="input-field px-3 disabled:opacity-50"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-text-secondary -mt-1">
          <input type="checkbox" checked={form.allDay} onChange={e => set({ allDay: e.target.checked })} />
          All day
        </label>

        <div>
          <label htmlFor={`${id}-repeat`} className={labelClass}>Repeat</label>
          <select id={`${id}-repeat`} value={form.repeat} onChange={e => setRepeat(e.target.value as RepeatChoice)} className="input-field">
            {REPEAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {repeating && (
          <>
            {form.repeat === 'custom' && (
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <label htmlFor={`${id}-interval`}>Every</label>
                <input
                  id={`${id}-interval`}
                  type="number"
                  min={1}
                  max={REPEAT_INTERVAL_MAX}
                  value={form.repeatInterval}
                  onChange={e => set({ repeatInterval: Number(e.target.value) })}
                  className="input-field w-20 px-3 py-1.5"
                />
                <span>weeks</span>
              </div>
            )}
            <div>
              <span id={`${id}-days`} className={labelClass}>On</span>
              <div role="group" aria-labelledby={`${id}-days`} className="flex flex-wrap gap-1">
                {WEEKDAY_LETTER.map((letter, day) => {
                  const on = form.repeatDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={on}
                      aria-label={WEEKDAY_LONG[day]}
                      onClick={() => toggleDay(day)}
                      className="w-8 h-8 rounded-full border text-xs font-bold transition-colors"
                      style={on
                        ? { backgroundColor: 'var(--tm-accent)', borderColor: 'var(--tm-accent)', color: 'var(--tm-accent-text)' }
                        : { backgroundColor: 'var(--tm-surface)', borderColor: 'var(--tm-border)', color: 'var(--tm-text-secondary)' }}
                    >
                      {letter}
                    </button>
                  );
                })}
              </div>
              <div className="mt-1 flex flex-wrap gap-0.5">
                {DAY_PRESETS.map(p => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => set({ repeatDays: p.days })}
                    className="rounded-md px-1.5 py-0.5 text-[11px] font-bold hover:bg-[var(--tm-accent-subtle)]"
                    style={{ color: 'var(--tm-accent)' }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <fieldset>
              <legend className={labelClass}>Ends</legend>
              <div className="flex flex-col gap-1.5 text-sm text-text-primary">
                {endOfTermLabel && (
                  <label className="flex items-center gap-2">
                    <input type="radio" name={`${id}-end-mode`} checked={endMode === 'term'} onChange={() => set({ endMode: 'term' })} />
                    {endOfTermLabel}
                  </label>
                )}
                <label className="flex flex-wrap items-center gap-2">
                  <input type="radio" name={`${id}-end-mode`} checked={endMode === 'on'} onChange={() => set({ endMode: 'on' })} />
                  On
                  <input
                    type="date"
                    aria-label="Last day it repeats"
                    value={form.endDate}
                    min={form.date}
                    disabled={endMode !== 'on'}
                    onChange={e => set({ endDate: e.target.value })}
                    className="input-field w-40 px-2 py-1 disabled:opacity-50"
                  />
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name={`${id}-end-mode`} checked={endMode === 'never'} onChange={() => set({ endMode: 'never' })} />
                  Never
                </label>
              </div>
            </fieldset>
          </>
        )}

        {showReminder && (
          <div>
            <label htmlFor={`${id}-reminder`} className={labelClass}>Remind me</label>
            <select
              id={`${id}-reminder`}
              value={form.reminderMinutes ?? ''}
              onChange={e => set({ reminderMinutes: e.target.value === '' ? null : Number(e.target.value) })}
              className="input-field"
            >
              {reminderChoices.map(m => <option key={m ?? 'none'} value={m ?? ''}>{reminderLabel(m)}</option>)}
            </select>
          </div>
        )}

        <div>
          <label htmlFor={`${id}-description`} className={labelClass}>Description</label>
          <textarea
            id={`${id}-description`}
            value={form.description}
            onChange={e => set({ description: e.target.value })}
            placeholder="Room, what to bring, a link…"
            rows={3}
            className="input-field resize-y min-h-[72px] max-h-[400px]"
          />
        </div>

        {summary && (
          <p
            className="flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-[12.5px] text-text-secondary"
            style={{ backgroundColor: 'var(--tm-accent-subtle)' }}
            aria-live="polite"
          >
            {repeating ? <Repeat className="w-4 h-4 mt-px flex-shrink-0" aria-hidden /> : <CalendarDays className="w-4 h-4 mt-px flex-shrink-0" aria-hidden />}
            {summary}
          </p>
        )}
        {warnings.length > 0 && (
          <ul className="space-y-1" aria-label="Worth knowing">
            {warnings.map(w => (
              <li key={w} className="flex items-start gap-1.5 text-xs text-text-secondary">
                <span aria-hidden className="w-[7px] h-[7px] rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: 'var(--tm-slipped-dot)' }} />
                {w}
              </li>
            ))}
          </ul>
        )}
        {showErrors && errors.length > 0 && (
          <div role="alert" className="text-sm rounded-md px-3 py-2" style={{ backgroundColor: 'var(--tm-danger-subtle)', color: 'var(--tm-danger)' }}>
            {errors.map(err => <p key={err}>{err}</p>)}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-2">
          {mode === 'edit' && (
            <div className="mr-auto flex gap-1">
              {onArchive && (
                <button type="button" onClick={onArchive} disabled={saving} className="btn btn-ghost px-2.5 py-1.5 text-sm gap-1">
                  <Archive className="w-4 h-4" /> Archive
                </button>
              )}
              {onDelete && (
                <button type="button" onClick={onDelete} disabled={saving} className="btn btn-ghost px-2.5 py-1.5 text-sm gap-1" style={{ color: 'var(--tm-danger)' }}>
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
              )}
            </div>
          )}
          <div className={`flex gap-3 ${mode === 'edit' ? '' : 'flex-1'}`}>
            <button type="button" onClick={onClose} disabled={saving} className={`btn btn-secondary py-2.5 px-5 ${mode === 'edit' ? '' : 'flex-1'}`}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={`btn btn-primary py-2.5 px-5 ${mode === 'edit' ? '' : 'flex-1'}`}>
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : mode === 'edit' ? 'Save' : 'Create event'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
};

export default EventFormModal;
