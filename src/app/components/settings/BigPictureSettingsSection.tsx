'use client';

/**
 * Settings → Term Tracker: the title/date-range editing, moved here from the
 * dashboard widget itself (BigPictureCalendar.tsx) — the compact tile now
 * just displays these read-only, and the overlay's "Range: … · edit in
 * Settings" line points here. Purely controlled: SettingsModal autosaves
 * each field (via updateCalendarSettings) after a pause in typing.
 */

import React from 'react';
import { CalendarSettings } from '@/app/types/calendar';

export type TermTrackerDraft = Omit<CalendarSettings, 'id'>;

interface Props {
  value: TermTrackerDraft;
  onChange: <K extends keyof TermTrackerDraft>(key: K, value: TermTrackerDraft[K]) => void;
  loading: boolean;
}

const BigPictureSettingsSection: React.FC<Props> = ({ value, onChange, loading }) => {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div>
          <label htmlFor="term-title" className="block text-xs font-medium text-text-muted mb-1">Name</label>
          <input
            id="term-title"
            type="text"
            value={value.title}
            onChange={e => onChange('title', e.target.value)}
            disabled={loading}
            className="input-field w-full text-sm disabled:opacity-60"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="term-start-date" className="block text-xs font-medium text-text-muted mb-1">Start date</label>
            <input
              id="term-start-date"
              type="date"
              value={value.start_date}
              onChange={e => onChange('start_date', e.target.value)}
              disabled={loading}
              className="input-field w-full text-sm disabled:opacity-60"
            />
          </div>
          <div>
            <label htmlFor="term-end-date" className="block text-xs font-medium text-text-muted mb-1">End date</label>
            <input
              id="term-end-date"
              type="date"
              value={value.end_date}
              onChange={e => onChange('end_date', e.target.value)}
              disabled={loading}
              className="input-field w-full text-sm disabled:opacity-60"
            />
          </div>
        </div>
      </div>
      <p className="text-xs" style={{ color: 'var(--tm-text-muted)' }}>
        Shown in the Term Tracker on your dashboard, counting down to the end date.
      </p>
    </div>
  );
};

export default BigPictureSettingsSection;
