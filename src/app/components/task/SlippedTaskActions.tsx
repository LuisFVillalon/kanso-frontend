'use client';

import React, { useState } from 'react';
import { Archive, Trash2, CalendarClock } from 'lucide-react';
import { toLocalDateStr } from '@/app/utils/dateUtils';

export interface ReschedulePick {
  label: string;
  date: string;
  time: string;
}

/**
 * Quick picks for a slipped task's new due date and time. "Today evening"
 * only shows while 6 PM is still ahead, so a pick never lands it back in
 * Slipped.
 */
export function reschedulePicks(now: Date = new Date()): ReschedulePick[] {
  const day = (offset: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    return toLocalDateStr(d);
  };
  const picks: ReschedulePick[] = [];
  if (now.getHours() < 18) picks.push({ label: 'Today evening', date: day(0), time: '18:00' });
  picks.push({ label: 'Tomorrow', date: day(1), time: '09:00' });
  picks.push({ label: 'Next week', date: day(7), time: '09:00' });
  return picks;
}

/** Whether a due date (and optional time) is still ahead of `now`; a date with no time is due by the end of that day. */
export function isStillAhead(date: string, time: string | null, now: Date = new Date()): boolean {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time ? time.split(':').map(Number) : [23, 59];
  return new Date(y, m - 1, d, h, min).getTime() > now.getTime();
}

/**
 * Archive, delete and reschedule buttons for a Slipped row. They show on
 * hover or keyboard focus of the row, and always on touch screens.
 */
export function SlippedTaskActionButtons({
  title, pending, rescheduling, onArchive, onDelete, onReschedule,
}: {
  title: string;
  pending: boolean;
  rescheduling: boolean;
  onArchive: () => void;
  onDelete: () => void;
  onReschedule: () => void;
}) {
  const visibility = rescheduling
    ? 'opacity-100'
    : 'opacity-0 group-hover/slipped:opacity-100 group-focus-within/slipped:opacity-100 [@media(hover:none)]:opacity-100';
  return (
    <div className={`flex items-center gap-0.5 flex-shrink-0 transition-opacity ${visibility}`}>
      <button
        type="button"
        onClick={onReschedule}
        disabled={pending}
        aria-expanded={rescheduling}
        className="btn btn-ghost p-1 disabled:opacity-50 disabled:cursor-wait"
        title="Change due date and time"
        aria-label={`Change due date and time for “${title}”`}
      >
        <CalendarClock className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={onArchive}
        disabled={pending}
        className="btn btn-ghost p-1 disabled:opacity-50 disabled:cursor-wait"
        title="Archive task"
        aria-label={`Archive “${title}”`}
      >
        <Archive className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={pending}
        className="btn btn-danger-ghost p-1 disabled:opacity-50 disabled:cursor-wait"
        title="Delete task"
        aria-label={`Delete “${title}”`}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/** A compact date + time picker with quick picks, shown under a Slipped row. */
export function ReschedulePicker({
  initialDate, initialTime, pending, onSave, onCancel,
}: {
  initialDate: string;
  initialTime: string;
  pending: boolean;
  onSave: (date: string, time: string | null) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  return (
    <div
      className="mt-1.5 rounded-md p-2 flex flex-col gap-2"
      style={{ backgroundColor: 'var(--tm-surface)', border: '1px solid var(--tm-border)' }}
      onKeyDown={e => { if (e.key === 'Escape') onCancel(); }}
    >
      <div className="flex flex-wrap gap-1">
        {reschedulePicks().map(p => (
          <button
            key={p.label}
            type="button"
            disabled={pending}
            onClick={() => onSave(p.date, p.time)}
            className="btn btn-secondary text-[11px] px-2 py-0.5 disabled:opacity-50 disabled:cursor-wait"
          >
            {p.label}
          </button>
        ))}
      </div>
      <form
        className="flex flex-wrap items-center gap-1.5"
        onSubmit={e => { e.preventDefault(); if (date) onSave(date, time || null); }}
      >
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          aria-label="New due date"
          required
          className="input-field text-xs py-1 px-2 w-auto"
        />
        <input
          type="time"
          value={time}
          onChange={e => setTime(e.target.value)}
          aria-label="New due time"
          className="input-field text-xs py-1 px-2 w-auto"
        />
        <div className="flex gap-1 ml-auto">
          <button type="button" onClick={onCancel} className="btn btn-ghost text-[11px] px-2 py-0.5">
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending || !date}
            className="btn btn-primary text-[11px] px-2 py-0.5 disabled:opacity-50 disabled:cursor-wait"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
