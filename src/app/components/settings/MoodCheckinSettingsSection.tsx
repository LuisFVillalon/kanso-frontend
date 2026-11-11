'use client';

/**
 * Settings → Notifications → Mood check-ins: whether the weekly and monthly
 * check-ins are on (the daily one follows the Daily check-in switch,
 * hooks/useDailyMood.ts), as rows of the Mood check-ins card. Purely
 * controlled: SettingsModal saves each change at once (as the profile's
 * `mood_checkins`).
 */

import React from 'react';
import { Calendar, CalendarDays } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SettingsRow } from '@/app/components/settings/SettingsCard';
import type { MoodCheckinSettings } from '@/app/types/mood';

interface Props {
  value: MoodCheckinSettings;
  onChange: (value: MoodCheckinSettings) => void;
  loading: boolean;
}

/** The Notifications page card that holds these settings and the mood alerts. */
export const MOOD_GROUP = {
  id: 'notif-group-mood',
  title: 'Mood check-ins',
  suffix: 'private to you',
};

export type MoodToggle = 'weekly' | 'monthly';

export const MOOD_TOGGLES: { key: MoodToggle; label: string; when: string; icon: LucideIcon }[] = [
  { key: 'weekly', label: 'Weekly', when: 'Sundays', icon: CalendarDays },
  { key: 'monthly', label: 'Monthly', when: 'Month end', icon: Calendar },
];

const MoodCheckinSettingsSection: React.FC<Props> = ({ value, onChange, loading }) => (
  <>
    {MOOD_TOGGLES.map(({ key, label, when, icon }) => (
      <SettingsRow
        key={key}
        icon={icon}
        label={label}
        labelId={`mood-setting-${key}`}
        trailing={when}
        toggle={{ on: value[key], onToggle: () => onChange({ ...value, [key]: !value[key] }), disabled: loading }}
      />
    ))}
  </>
);

export default MoodCheckinSettingsSection;
