'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Calendar, History, Moon, Smile, SquareCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import ReminderLeadPicker from '@/app/components/notifications/ReminderLeadPicker';
import { SettingsCard, SettingsRow, SettingsSubRow, SettingsValueRow } from '@/app/components/settings/SettingsCard';
import { MOOD_GROUP } from '@/app/components/settings/MoodCheckinSettingsSection';
import { AUTOSAVE_DEBOUNCE_MS, type TrackSave } from '@/app/components/settings/autosave';
import type { NotificationPreferences, NotificationPreferencesUpdate } from '@/app/types/notification';
import type { DayWindow } from '@/app/types/profile';
import {
  MOOD_REMINDER_MINUTES_MAX, MOOD_REMINDER_PRESETS, formatLeadTime, moodReminderSendTime,
} from '@/app/utils/notifications';
import { formatTime12Hour } from '@/app/utils/taskUtils';

/** Switch labels, in the order the day runs within each card. Other types the server lists aren't offered. */
const TYPE_ROWS: Record<string, { label: string; icon: LucideIcon; trailing?: string }> = {
  task_reminder:  { label: 'Tasks', icon: SquareCheck },
  event_reminder: { label: 'Events', icon: Calendar, trailing: 'Set per event' },
  mood_reminder:  { label: 'Daily check-in', icon: Smile },
  mood_missed:    { label: 'Missed days', icon: History },
};
const REMINDER_TYPES = ['task_reminder', 'event_reminder'];
const MOOD_TYPES = ['mood_reminder', 'mood_missed'];

/** The times quiet hours turn on with when none were set before. */
const DEFAULT_QUIET_HOURS = { start: '22:00', end: '07:00' };

/** The fields of `draft` that differ from `saved`, as a PATCH body. */
export function preferenceChanges(
  saved: NotificationPreferences,
  draft: NotificationPreferences,
): NotificationPreferencesUpdate {
  const changes: NotificationPreferencesUpdate = {};
  const types = Object.fromEntries(
    Object.entries(draft.types).filter(([type, on]) => saved.types[type] !== on),
  );
  if (Object.keys(types).length > 0) changes.types = types;
  // Quiet hours are set (or cleared) as a pair.
  if (draft.quiet_hours_start !== saved.quiet_hours_start || draft.quiet_hours_end !== saved.quiet_hours_end) {
    changes.quiet_hours_start = draft.quiet_hours_start;
    changes.quiet_hours_end = draft.quiet_hours_end;
  }
  if (draft.default_reminder_minutes !== saved.default_reminder_minutes) {
    changes.default_reminder_minutes = draft.default_reminder_minutes;
  }
  // Absent from a server without the mood reminder: then never sent.
  if (draft.mood_reminder_minutes !== undefined && draft.mood_reminder_minutes !== saved.mood_reminder_minutes) {
    changes.mood_reminder_minutes = draft.mood_reminder_minutes;
  }
  return changes;
}

/** Why the quiet hours can't be saved as drafted, or null when they can. */
function quietHoursError(start: string | null, end: string | null): string | null {
  if (!start && !end) return null;
  if (!start || !end) return 'Set both a start and an end, or clear quiet hours.';
  if (start === end) return "Quiet hours can't start and end at the same time.";
  return null;
}

interface Props {
  preferences: NotificationPreferences;
  onSave: (changes: NotificationPreferencesUpdate) => Promise<NotificationPreferences>;
  /** Reports each save to the page's Saved / Couldn't save indicator. */
  track: TrackSave;
  /** Offers an Undo for a switch that was just flipped. */
  onUndoableChange?: (message: string, undo: () => void) => void;
  /** The weekly and monthly check-in rows, shown after the mood alerts in the Mood check-ins card. */
  moodCheckins?: React.ReactNode;
  /** Today's work day ("HH:MM" each), for when the daily check-in reminder goes out. */
  workDay?: DayWindow;
}

/**
 * Settings → Notifications, as three cards of one-line rows: Reminders
 * (tasks, with their default lead, and events), Mood check-ins (the daily
 * check-in and its lead, missed days, weekly and monthly) and Quiet hours
 * (which may run past midnight). Every change saves itself, sending only
 * what changed: switches at once, times after a pause in typing, and quiet
 * hours only once they're valid.
 */
const NotificationPreferencesForm: React.FC<Props> = ({
  preferences, onSave, track, onUndoableChange, moodCheckins, workDay,
}) => {
  const [draft, setDraft] = useState(preferences);
  const draftRef = useRef(preferences);
  const savedRef = useRef(preferences);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The times quiet hours come back with when switched on again.
  const lastQuietHours = useRef(
    preferences.quiet_hours_start && preferences.quiet_hours_end
      ? { start: preferences.quiet_hours_start, end: preferences.quiet_hours_end }
      : DEFAULT_QUIET_HOURS,
  );
  // Read at save time, so a parent passing new callbacks never resets a pending save.
  const callbacks = useRef({ onSave, track });
  useEffect(() => { callbacks.current = { onSave, track }; }, [onSave, track]);

  const saveNow = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const { onSave, track } = callbacks.current;
    void track('notifications', async () => {
      const sent = draftRef.current;
      if (quietHoursError(sent.quiet_hours_start, sent.quiet_hours_end)) return;
      const changes = preferenceChanges(savedRef.current, sent);
      if (Object.keys(changes).length === 0) return;
      const next = await onSave(changes);
      savedRef.current = next;
      // Keep anything edited while this was saving.
      if (draftRef.current === sent) {
        draftRef.current = next;
        setDraft(next);
      }
    });
  }, []);

  // Leaving the page mid-pause still saves what was typed.
  useEffect(() => () => { if (timer.current) saveNow(); }, [saveNow]);

  const edit = (patch: Partial<NotificationPreferences>, { debounce = false } = {}) => {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    if (debounce) timer.current = setTimeout(saveNow, AUTOSAVE_DEBOUNCE_MS);
    else saveNow();
  };

  const toggleType = (type: string, label: string) => {
    const on = !draftRef.current.types[type];
    edit({ types: { ...draftRef.current.types, [type]: on } });
    onUndoableChange?.(`${label} turned ${on ? 'on' : 'off'}.`, () => {
      edit({ types: { ...draftRef.current.types, [type]: !on } });
    });
  };

  const quietOn = !!(draft.quiet_hours_start || draft.quiet_hours_end);
  const toggleQuietHours = () => {
    const { quiet_hours_start: start, quiet_hours_end: end } = draftRef.current;
    if (start || end) {
      if (start && end) lastQuietHours.current = { start, end };
      edit({ quiet_hours_start: null, quiet_hours_end: null });
    } else {
      edit({ quiet_hours_start: lastQuietHours.current.start, quiet_hours_end: lastQuietHours.current.end });
    }
  };

  const listed = (group: string[]) => group.filter(t => t in draft.types);
  const reminderTypes = listed(REMINDER_TYPES);
  const moodTypes = listed(MOOD_TYPES);
  const quietError = quietHoursError(draft.quiet_hours_start, draft.quiet_hours_end);

  const taskLead = (
    <SettingsValueRow label="Remind me" value={`${formatLeadTime(draft.default_reminder_minutes)} before`}>
      <p id="default-reminder-label" className="sr-only">Default task reminder time</p>
      <ReminderLeadPicker
        variant="chips"
        aria-labelledby="default-reminder-label"
        value={draft.default_reminder_minutes}
        onChange={minutes => { if (minutes !== null) edit({ default_reminder_minutes: minutes }, { debounce: true }); }}
      />
    </SettingsValueRow>
  );

  const moodLead = draft.mood_reminder_minutes !== undefined && (() => {
    const lead = draft.mood_reminder_minutes;
    const sendAt = workDay && formatTime12Hour(moodReminderSendTime(workDay.start, workDay.end, lead));
    return (
      <SettingsValueRow
        label="Remind me"
        value={[`${formatLeadTime(lead)} before`, sendAt].filter(Boolean).join(' · ')}
      >
        <p id="mood-reminder-lead-label" className="sr-only">Daily check-in reminder time</p>
        <ReminderLeadPicker
          variant="chips"
          aria-labelledby="mood-reminder-lead-label"
          value={lead}
          onChange={minutes => { if (minutes !== null) edit({ mood_reminder_minutes: minutes }, { debounce: true }); }}
          presets={MOOD_REMINDER_PRESETS}
          maxMinutes={MOOD_REMINDER_MINUTES_MAX}
        />
        {workDay && (
          <p className="text-xs text-text-muted">
            Before &ldquo;Call it a day&rdquo; ({formatTime12Hour(workDay.end)}).
          </p>
        )}
      </SettingsValueRow>
    );
  })();

  const typeRow = (type: string) => {
    const { label, icon, trailing } = TYPE_ROWS[type];
    const on = draft.types[type];
    const needsDaily = type === 'mood_missed' && draft.types.mood_reminder === false;
    const row = (
      <SettingsRow
        icon={icon}
        label={label}
        labelId={`notif-type-${type}`}
        trailing={trailing}
        sub={needsDaily ? 'Needs Daily check-in' : undefined}
        toggle={{ on, onToggle: () => toggleType(type, label), disabled: needsDaily }}
      />
    );
    // A switch and the lead it sets stay together, with no divider between them.
    if (type === 'task_reminder' && on) return <div key={type}>{row}{taskLead}</div>;
    if (type === 'mood_reminder' && on && moodLead) return <div key={type}>{row}{moodLead}</div>;
    return <React.Fragment key={type}>{row}</React.Fragment>;
  };

  return (
    <div className="space-y-3.5">
      <SettingsCard id="notif-group-reminders" title="Reminders">
        {reminderTypes.map(typeRow)}
        {/* The default lead still applies to new tasks when the server lists no reminder switch. */}
        {!reminderTypes.includes('task_reminder') && taskLead}
      </SettingsCard>

      {(moodCheckins || moodTypes.length > 0) && (
        <SettingsCard {...MOOD_GROUP}>
          {moodTypes.map(typeRow)}
          {moodCheckins}
        </SettingsCard>
      )}

      <SettingsCard id="notif-group-quiet" title="Quiet hours">
        <div>
          <SettingsRow
            icon={Moon}
            label="Quiet hours"
            labelId="notif-quiet-hours"
            sub="Alerts wait until it ends"
            trailing={quietOn && !quietError
              ? `${formatTime12Hour(draft.quiet_hours_start)} – ${formatTime12Hour(draft.quiet_hours_end)}`
              : undefined}
            // On a phone the times just below say the same.
            trailingFromSm
            toggle={{ on: quietOn, onToggle: toggleQuietHours }}
          />
          {quietOn && (
            <SettingsSubRow>
              <div className="flex items-center gap-1.5 sm:gap-2 text-sm text-text-secondary">
                <input
                  id="quiet-start"
                  type="time"
                  aria-label="Quiet hours from"
                  value={draft.quiet_hours_start ?? ''}
                  onChange={e => edit({ quiet_hours_start: e.target.value || null }, { debounce: true })}
                  className="input-field min-w-0 flex-1 text-[0.8125rem] sm:text-sm py-1.5 px-2 sm:px-2.5"
                />
                <span>to</span>
                <input
                  id="quiet-end"
                  type="time"
                  aria-label="Quiet hours until"
                  value={draft.quiet_hours_end ?? ''}
                  onChange={e => edit({ quiet_hours_end: e.target.value || null }, { debounce: true })}
                  className="input-field min-w-0 flex-1 text-[0.8125rem] sm:text-sm py-1.5 px-2 sm:px-2.5"
                />
              </div>
              {quietError && <p className="text-xs mt-1" style={{ color: 'var(--tm-danger)' }}>{quietError}</p>}
            </SettingsSubRow>
          )}
        </div>
      </SettingsCard>
    </div>
  );
};

export default NotificationPreferencesForm;
