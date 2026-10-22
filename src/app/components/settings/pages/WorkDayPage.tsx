'use client';

/** Settings → Work day and rest: the daily work window and the days off. */

import React from 'react';

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
  onDayStartChange: (time: string) => void;
  onShutoffChange: (time: string) => void;
  onToggleRestDay: (day: number) => void;
  loading: boolean;
}

const WorkDayPage: React.FC<Props> = ({
  dayStartTime,
  shutoffTime,
  restDays,
  onDayStartChange,
  onShutoffChange,
  onToggleRestDay,
  loading,
}) => (
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
        Sets your working window, the day timer, and when check-ins nudge you.
      </p>
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

export default WorkDayPage;
