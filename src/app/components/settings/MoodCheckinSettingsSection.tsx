'use client';

/**
 * Settings → Notifications → Mood check-ins: which check-ins are on. Purely
 * controlled: SettingsModal saves each change at once (as the profile's
 * `mood_checkins`).
 */

import React from 'react';
import type { MoodCheckinSettings } from '@/app/types/mood';

interface Props {
  value: MoodCheckinSettings;
  onChange: (value: MoodCheckinSettings) => void;
  loading: boolean;
}

/** The Notifications page group that holds these settings and the mood alerts. */
export const MOOD_GROUP = {
  id: 'notif-group-mood',
  title: 'Mood check-ins',
  description: 'A few seconds at the end of the day. Check-ins are private to you and aren’t sent to the Daily Brief.',
};

export type MoodToggle = 'daily' | 'weekly' | 'monthly';

export const MOOD_TOGGLES: { key: MoodToggle; label: string; hint: string }[] = [
  { key: 'daily', label: 'Daily check-in', hint: 'Log how each day felt, from the Daily Brief or the calendar.' },
  { key: 'weekly', label: 'Weekly check-in', hint: 'Off by default. Offered on Sunday, the end of your Mon–Sun week.' },
  { key: 'monthly', label: 'Monthly check-in', hint: 'Off by default. Offered on the last day of the month.' },
];

const MoodCheckinSettingsSection: React.FC<Props> = ({ value, onChange, loading }) => (
  <div className="space-y-3">
    {MOOD_TOGGLES.map(({ key, label, hint }) => {
      const on = value[key];
      const labelId = `mood-setting-${key}`;
      return (
        <div key={key} className="flex items-start justify-between gap-4">
          <div>
            <p id={labelId} className="text-sm font-medium text-text-primary">{label}</p>
            <p className="text-xs text-text-muted">{hint}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-labelledby={labelId}
            disabled={loading}
            onClick={() => onChange({ ...value, [key]: !on })}
            className="relative shrink-0 w-10 h-6 rounded-full transition-colors disabled:opacity-60"
            style={{ backgroundColor: on ? 'var(--tm-accent)' : 'var(--tm-border)' }}
          >
            <span
              aria-hidden="true"
              className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform"
              style={{ transform: on ? 'translateX(1rem)' : 'none', boxShadow: 'var(--tm-shadow-sm)' }}
            />
          </button>
        </div>
      );
    })}
  </div>
);

export default MoodCheckinSettingsSection;
