'use client';

/**
 * Settings → Profile → Mood check-ins: which check-ins the dashboard nudges
 * for and when. Purely controlled: the draft lives in SettingsModal with the
 * rest of the Profile tab and is saved (as the profile's `mood_checkins`)
 * when the user clicks Save Profile.
 */

import React from 'react';
import { Smile } from 'lucide-react';
import type { MoodCheckinSettings, MoodRemind } from '@/app/types/mood';

interface Props {
  value: MoodCheckinSettings;
  onChange: (value: MoodCheckinSettings) => void;
  /** The drafted "Call it a day" time ("HH:MM"), which the reminder follows. */
  shutoffTime: string;
  loading: boolean;
}

type Toggle = 'daily' | 'weekly' | 'monthly' | 'show_in_reports';

const TOGGLES: { key: Toggle; label: string; hint: string }[] = [
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
    <div className="pt-5 mt-5 border-t space-y-3" style={{ borderColor: 'var(--tm-border)' }}>
      <div className="flex items-center gap-2" style={{ color: 'var(--tm-text-secondary)' }}>
        <Smile className="w-4 h-4" />
        <p className="text-sm flex-1">Mood check-ins — a few seconds at the end of the day.</p>
      </div>

      <div className="space-y-3">
        {TOGGLES.map(({ key, label, hint }) => {
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
          Remind me <span className="font-normal">· follows “Call it a day”</span>
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
