'use client';

/** Settings → Work day and rest: the daily work window and the days off. */

import React, { useState } from 'react';
import { dayWindowOn, isValidDayWindow } from '@/app/lib/restDays';
import type { DayWindow, DayWindows } from '@/app/types/profile';

// Day-of-week indices follow JS Date#getDay() (0 = Sunday … 6 = Saturday),
// matching the isWeekend/isWeekday convention used in BigPictureCalendar.
// Two letters each, so Sunday/Saturday and Tuesday/Thursday don't look alike.
export const REST_DAY_OPTIONS: { day: number; short: string; label: string }[] = [
  { day: 0, short: 'Su', label: 'Sunday' },
  { day: 1, short: 'Mo', label: 'Monday' },
  { day: 2, short: 'Tu', label: 'Tuesday' },
  { day: 3, short: 'We', label: 'Wednesday' },
  { day: 4, short: 'Th', label: 'Thursday' },
  { day: 5, short: 'Fr', label: 'Friday' },
  { day: 6, short: 'Sa', label: 'Saturday' },
];

interface Props {
  dayStartTime: string;
  shutoffTime: string;
  restDays: number[];
  dayWindows: DayWindows;
  onDayStartChange: (time: string) => void;
  onShutoffChange: (time: string) => void;
  onToggleRestDay: (day: number) => void;
  /** Gives `day` its own window, or null to use the every-day window again. */
  onDayWindowChange: (day: number, window: DayWindow | null) => void;
  /** Drops every day's own window. */
  onClearDayWindows: () => void;
  loading: boolean;
}

// Day name, start, end: the column headings above the rows share it. On a
// phone the day name sits above its two times.
const DAY_ROW_GRID = 'grid grid-cols-2 sm:grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-1 items-center';

interface DayWindowRowProps {
  day: number;
  label: string;
  value: DayWindow;
  own: boolean;
  onChange: (value: DayWindow) => void;
  onReset: () => void;
  loading: boolean;
}

/** One weekday's start and end; a window missing a time stays on screen unsaved. */
const DayWindowRow: React.FC<DayWindowRowProps> = ({ day, label, value, own, onChange, onReset, loading }) => {
  const [draft, setDraft] = useState(value);
  // Follow the saved window when it changes from outside (Undo, the every-day window).
  const [shown, setShown] = useState(value);
  if (shown.start !== value.start || shown.end !== value.end) {
    setShown(value);
    setDraft(value);
  }
  const invalid = !isValidDayWindow(draft);
  const errorId = `settings-day-window-${day}-error`;

  const edit = (patch: Partial<DayWindow>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (isValidDayWindow(next)) onChange(next);
  };

  return (
    <li className={DAY_ROW_GRID}>
      <div className="col-span-2 sm:col-span-1 min-w-0 flex items-baseline gap-2 sm:block">
        <p className="text-sm text-text-primary">{label}</p>
        {own ? (
          <button
            type="button"
            onClick={onReset}
            disabled={loading}
            aria-label={`${label}: same as default`}
            className="text-xs font-medium underline-offset-2 hover:underline disabled:opacity-60"
            style={{ color: 'var(--tm-accent)' }}
          >
            Same as default
          </button>
        ) : (
          <p className="text-xs text-text-muted">Default</p>
        )}
      </div>
      <input
        type="time"
        aria-label={`${label} starts`}
        value={draft.start}
        onChange={e => edit({ start: e.target.value })}
        disabled={loading}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        className="input-field w-full text-sm disabled:opacity-60"
      />
      <input
        type="time"
        aria-label={`${label}: call it a day`}
        value={draft.end}
        onChange={e => edit({ end: e.target.value })}
        disabled={loading}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        className="input-field w-full text-sm disabled:opacity-60"
      />
      {invalid && (
        <p id={errorId} className="col-span-2 sm:col-span-3 text-xs" style={{ color: 'var(--tm-danger)' }}>
          Pick both times.
        </p>
      )}
    </li>
  );
};

const WorkDayPage: React.FC<Props> = ({
  dayStartTime,
  shutoffTime,
  restDays,
  dayWindows,
  onDayStartChange,
  onShutoffChange,
  onToggleRestDay,
  onDayWindowChange,
  onClearDayWindows,
  loading,
}) => {
  const workdays = REST_DAY_OPTIONS.filter(({ day }) => !restDays.includes(day));
  const hasOwnWindows = workdays.some(({ day }) => String(day) in dayWindows);
  const [differentHours, setDifferentHours] = useState(hasOwnWindows);
  const showDays = differentHours || hasOwnWindows;

  const toggleDifferentHours = () => {
    if (showDays && Object.keys(dayWindows).length > 0) onClearDayWindows();
    setDifferentHours(!showDays);
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <div>
            <label htmlFor="settings-day-start" className="block text-xs font-medium text-text-muted mb-1">Day starts</label>
            <input
              id="settings-day-start"
              type="time"
              value={dayStartTime}
              onChange={e => onDayStartChange(e.target.value)}
              disabled={loading}
              className="input-field w-full text-sm disabled:opacity-60"
            />
          </div>
          <div>
            <label htmlFor="settings-day-end" className="block text-xs font-medium text-text-muted mb-1">Call it a day</label>
            <input
              id="settings-day-end"
              type="time"
              value={shutoffTime}
              onChange={e => onShutoffChange(e.target.value)}
              disabled={loading}
              className="input-field w-full text-sm disabled:opacity-60"
            />
          </div>
        </div>
        <p className="text-xs mt-1" style={{ color: 'var(--tm-text-muted)' }}>
          Sets your working window, the day timer, and when the mood check-in reminder comes.
        </p>
      </div>

      <div>
        <div className="flex items-start justify-between gap-4 max-w-md">
          <div>
            <p id="settings-day-windows-label" className="text-sm font-medium text-text-primary">Different hours on some days</p>
            <p className="text-xs text-text-muted">Give a day its own start and Call it a day time. The others keep the hours above.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={showDays}
            aria-labelledby="settings-day-windows-label"
            onClick={toggleDifferentHours}
            disabled={loading}
            className="relative shrink-0 w-10 h-6 rounded-full transition-colors disabled:opacity-40"
            style={{ backgroundColor: showDays ? 'var(--tm-accent)' : 'var(--tm-border)' }}
          >
            <span
              aria-hidden="true"
              className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform"
              style={{ transform: showDays ? 'translateX(1rem)' : 'none', boxShadow: 'var(--tm-shadow-sm)' }}
            />
          </button>
        </div>
        {showDays && (
          workdays.length > 0 ? (
            <div className="mt-3 pl-4 border-l-2 border-border-subtle max-w-md">
              <div aria-hidden className={`${DAY_ROW_GRID} mb-1 text-xs font-medium text-text-muted`}>
                <span className="hidden sm:block" />
                <span>Day starts</span>
                <span>Call it a day</span>
              </div>
              <ul className="space-y-2" aria-label="Hours by day">
                {workdays.map(({ day, label }) => (
                  <DayWindowRow
                    key={day}
                    day={day}
                    label={label}
                    value={dayWindowOn(day, dayStartTime, shutoffTime, dayWindows)}
                    own={String(day) in dayWindows}
                    onChange={w => onDayWindowChange(day, w)}
                    onReset={() => onDayWindowChange(day, null)}
                    loading={loading}
                  />
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 text-xs text-text-muted">Every day is a rest day.</p>
          )
        )}
      </div>

      <div>
        <p id="settings-rest-days-label" className="block text-xs font-medium text-text-muted mb-1">Rest days</p>
        <div className="grid grid-cols-7 gap-1.5 max-w-md" role="group" aria-labelledby="settings-rest-days-label">
          {REST_DAY_OPTIONS.map(({ day, short, label }) => {
            const selected = restDays.includes(day);
            return (
              <button
                key={day}
                type="button"
                onClick={() => onToggleRestDay(day)}
                disabled={loading}
                aria-pressed={selected}
                aria-label={label}
                title={label}
                className="py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-60"
                style={{
                  backgroundColor: selected ? 'var(--tm-accent)' : 'var(--tm-surface-raised)',
                  color: selected ? 'var(--tm-accent-text)' : 'var(--tm-text-secondary)',
                  border: selected ? '1px solid var(--tm-accent)' : '1px solid var(--tm-border)',
                }}
              >
                {short}
              </button>
            );
          })}
        </div>
        <p className="text-xs mt-1" style={{ color: 'var(--tm-text-muted)' }}>
          On rest days, the day timer doesn&apos;t run and the daily check-in skips.
        </p>
      </div>
    </div>
  );
};

export default WorkDayPage;
