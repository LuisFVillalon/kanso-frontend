'use client';

/**
 * Settings → Notifications → Mood check-ins: which check-ins the dashboard
 * nudges for and when. Purely controlled: SettingsModal saves each change at
 * once (as the profile's `mood_checkins`).
 */

import React from 'react';
import type { MoodCheckinSettings, MoodRemind } from '@/app/types/mood';

interface Props {
  value: MoodCheckinSettings;
  onChange: (value: MoodCheckinSettings) => void;
  /** The "Call it a day" time ("HH:MM"), which the reminder follows. */
  shutoffTime: string;
  loading: boolean;
}

/** The Notifications page group that holds these settings and the mood alerts. */
export const MOOD_GROUP = {
  id: 'notif-group-mood',
  title: 'Mood check-ins',
  description: 'A few seconds at the end of the day.',
};

export type MoodToggle = 'daily' | 'weekly' | 'monthly' | 'show_in_reports';

export const MOOD_TOGGLES: { key: MoodToggle; label: string; hint: string }[] = [
  { key: 'daily', label: 'Daily check-in', hint: 'A nudge on the dashboard at “Call it a day”. Skips rest days.' },
  { key: 'weekly', label: 'Weekly check-in', hint: 'Off by default. Added to Sunday’s nudge (end of your Mon–Sun week).' },
  { key: 'monthly', label: 'Monthly check-in', hint: 'Off by default. Added on the last day of the month.' },
  { key: 'show_in_reports', label: 'Show mood in reports', hint: 'Mood charts and links in Calendar → Report.' },
];

const plusMinutes = (hm: string, minutes: number): string => {
  const [h, m] = hm.split(':').map(Number);
  const total = Math.min(h * 60 + m + minutes, 24 * 60 - 1);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

const MoodCheckinSettingsSection: React.FC<Props> = ({ value, onChange, shutoffTime, loading }) => {
  // The time input can be cleared while editing.
  const hasTime = /^\d{2}:\d{2}$/.test(shutoffTime);
  const remindOptions: { remind: MoodRemind; label: string }[] = [
    { remind: 'shutoff', label: hasTime ? `At ${shutoffTime}` : 'At “Call it a day”' },
    { remind: 'shutoff+30', label: hasTime ? `At ${plusMinutes(shutoffTime, 30)}` : '30 min later' },
    { remind: 'off', label: 'Don’t nudge' },
  ];

  return (
    <div className="space-y-4">
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

      <div>
        <p id="mood-setting-remind" className="block text-xs font-medium text-text-muted mb-1">
          Dashboard nudge <span className="font-normal">· follows “Call it a day”</span>
        </p>
        <div className="flex items-center gap-1 p-1 rounded-lg bg-surface border border-border" role="group" aria-labelledby="mood-setting-remind">
          {remindOptions.map(({ remind, label }) => (
            <button
              key={remind}
              type="button"
              onClick={() => onChange({ ...value, remind })}
              disabled={loading || !value.daily}
              aria-pressed={value.remind === remind}
              className={`flex-1 px-2.5 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors disabled:opacity-60 ${
                value.remind === remind ? 'bg-surface-raised text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {value.remind === 'off' && (
          <p className="text-xs text-text-muted mt-1">Also silences the mood reminder and missed check-in notifications.</p>
        )}
      </div>

      <p className="text-xs" style={{ color: 'var(--tm-text-muted)' }}>
        Check-ins are private to you and aren&rsquo;t sent to the Daily Brief.
      </p>
    </div>
  );
};

export default MoodCheckinSettingsSection;
