'use client';

/**
 * Term Tracker's title/date-range editing, moved here
 * from the dashboard widget itself (BigPictureCalendar.tsx) — the compact
 * tile now just displays these read-only, and the overlay's "Range: … ·
 * edit in Settings" line points here. Purely controlled: the draft lives in
 * SettingsModal alongside the rest of the Profile tab and is only persisted
 * (via updateCalendarSettings) when the user clicks Save Profile.
 */

import React from 'react';
import { Hourglass } from 'lucide-react';
import { CalendarSettings } from '@/app/types/calendar';

export type TermTrackerDraft = Omit<CalendarSettings, 'id'>;

interface Props {
  value: TermTrackerDraft;
  onChange: <K extends keyof TermTrackerDraft>(key: K, value: TermTrackerDraft[K]) => void;
  loading: boolean;
}

const BigPictureSettingsSection: React.FC<Props> = ({ value, onChange, loading }) => {
  return (
    <div className="pt-5 mt-5 border-t space-y-4" style={{ borderColor: 'var(--tm-border)' }}>
      <div className="flex items-center gap-2" style={{ color: 'var(--tm-text-secondary)' }}>
        <Hourglass className="w-4 h-4" />
        <p className="text-sm flex-1">Term Tracker — the dashboard&rsquo;s term-countdown widget.</p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Title</label>
          <input
            type="text"
            value={value.title}
            onChange={e => onChange('title', e.target.value)}
            disabled={loading}
            className="input-field w-full text-sm disabled:opacity-60"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Start Date</label>
            <input
              type="date"
              value={value.start_date}
              onChange={e => onChange('start_date', e.target.value)}
              disabled={loading}
              className="input-field w-full text-sm disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">End Date</label>
            <input
              type="date"
              value={value.end_date}
              onChange={e => onChange('end_date', e.target.value)}
              disabled={loading}
              className="input-field w-full text-sm disabled:opacity-60"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default BigPictureSettingsSection;
