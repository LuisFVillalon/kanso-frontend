'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReminderLeadPicker from '@/app/components/notifications/ReminderLeadPicker';
import SettingsGroup from '@/app/components/settings/SettingsGroup';
import { MOOD_GROUP } from '@/app/components/settings/MoodCheckinSettingsSection';
import { AUTOSAVE_DEBOUNCE_MS, type TrackSave } from '@/app/components/settings/autosave';
import type { NotificationPreferences, NotificationPreferencesUpdate } from '@/app/types/notification';
import { MOOD_REMINDER_MINUTES_MAX, MOOD_REMINDER_PRESETS } from '@/app/utils/notifications';

/** Switch labels, in the order the day runs within each group. Other types the server lists aren't offered. */
const TYPE_LABELS: Record<string, { label: string; hint: string }> = {
  task_reminder:  { label: 'Reminder before a task is due', hint: "At each task's reminder time." },
  final_warning:  { label: 'Final warning', hint: 'Always 30 minutes before a task is due, on top of its reminder.' },
  mood_reminder:  { label: 'Mood check-in reminder', hint: "Before you call it a day, if today's mood isn't logged yet." },
  mood_missed:    { label: 'Missed mood check-ins', hint: 'When days go by without a mood check-in.' },
};
const REMINDER_TYPES = ['task_reminder', 'final_warning'];
const MOOD_TYPES = ['mood_reminder', 'mood_missed'];

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
  /** The mood check-in settings, shown at the top of the Mood check-ins group. */
  moodCheckins?: React.ReactNode;
}

/**
 * Settings → Notifications, in headed groups: Reminders (task reminders and
 * the default reminder lead), Mood check-ins (with the mood alerts and their
 * lead) and Quiet hours (which may run past midnight). Every
 * change saves itself, sending only what changed: switches at once, times
 * after a pause in typing, and quiet hours only once they're valid.
 */
const NotificationPreferencesForm: React.FC<Props> = ({
  preferences, onSave, track, onUndoableChange, moodCheckins,
}) => {
  const [draft, setDraft] = useState(preferences);
  const draftRef = useRef(preferences);
  const savedRef = useRef(preferences);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const listed = (group: string[]) => group.filter(t => t in draft.types);
  const reminderTypes = listed(REMINDER_TYPES);
  const moodTypes = listed(MOOD_TYPES);
  const quietError = quietHoursError(draft.quiet_hours_start, draft.quiet_hours_end);
  const moodLeadChoice = draft.mood_reminder_minutes !== undefined && (
    <div className="pl-4 border-l-2 border-border-subtle">
      <label id="mood-reminder-lead-label" className="block text-xs font-medium text-text-muted mb-1">
        Send it before &ldquo;Call it a day&rdquo;
      </label>
      <ReminderLeadPicker
        aria-labelledby="mood-reminder-lead-label"
        value={draft.mood_reminder_minutes}
        onChange={minutes => { if (minutes !== null) edit({ mood_reminder_minutes: minutes }, { debounce: true }); }}
        disabled={draft.types.mood_reminder === false}
        finalWarningNote={false}
        presets={MOOD_REMINDER_PRESETS}
        maxMinutes={MOOD_REMINDER_MINUTES_MAX}
      />
      <p className="text-xs text-text-muted mt-1">
        Counts back from your &ldquo;Call it a day&rdquo; time, not from a task&rsquo;s due time. A lead longer than your working day sends it at the start of the day.
      </p>
    </div>
  );
  const defaultReminderChoice = (
    <div className="pl-4 border-l-2 border-border-subtle">
      <label id="default-reminder-label" className="block text-xs font-medium text-text-muted mb-1">
        Default reminder time
      </label>
      <ReminderLeadPicker
        aria-labelledby="default-reminder-label"
        value={draft.default_reminder_minutes}
        onChange={minutes => { if (minutes !== null) edit({ default_reminder_minutes: minutes }, { debounce: true }); }}
      />
      <p className="text-xs text-text-muted mt-1">
        How long before a task&rsquo;s due time its reminder arrives. You can pick another time on any task when you edit it.
      </p>
    </div>
  );

  const typeSwitch = (type: string) => {
    const { label, hint } = TYPE_LABELS[type];
    const on = draft.types[type];
    const labelId = `notif-type-${type}`;
    return (
      <React.Fragment key={type}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p id={labelId} className="text-sm font-medium text-text-primary">{label}</p>
            <p className="text-xs text-text-muted">{hint}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-labelledby={labelId}
            onClick={() => toggleType(type, label)}
            className="relative shrink-0 w-10 h-6 rounded-full transition-colors"
            style={{ backgroundColor: on ? 'var(--tm-accent)' : 'var(--tm-border)' }}
          >
            <span
              aria-hidden="true"
              className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform"
              style={{ transform: on ? 'translateX(1rem)' : 'none', boxShadow: 'var(--tm-shadow-sm)' }}
            />
          </button>
        </div>
        {type === 'task_reminder' && defaultReminderChoice}
        {type === 'mood_reminder' && moodLeadChoice}
      </React.Fragment>
    );
  };

  return (
    <div className="space-y-8">
      <SettingsGroup id="notif-group-reminders" title="Reminders" description="For tasks with a due time.">
        {reminderTypes.map(typeSwitch)}
        {/* The default lead still applies to new tasks when the server lists no reminder switch. */}
        {!reminderTypes.includes('task_reminder') && defaultReminderChoice}
      </SettingsGroup>

      {(moodCheckins || moodTypes.length > 0) && (
        <SettingsGroup {...MOOD_GROUP}>
          {moodCheckins}
          {moodTypes.map(typeSwitch)}
        </SettingsGroup>
      )}

      <SettingsGroup
        id="notif-group-quiet"
        title="Quiet hours"
        description="Alerts that fire in this window wait until it ends. It can run past midnight, e.g. 22:00 to 07:00."
      >
        <div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 sm:gap-3 items-end">
            <div>
              <label htmlFor="quiet-start" className="block text-xs font-medium text-text-muted mb-1">From</label>
              <input
                id="quiet-start"
                type="time"
                value={draft.quiet_hours_start ?? ''}
                onChange={e => edit({ quiet_hours_start: e.target.value || null }, { debounce: true })}
                className="input-field w-full min-w-0 text-sm"
              />
            </div>
            <div>
              <label htmlFor="quiet-end" className="block text-xs font-medium text-text-muted mb-1">Until</label>
              <input
                id="quiet-end"
                type="time"
                value={draft.quiet_hours_end ?? ''}
                onChange={e => edit({ quiet_hours_end: e.target.value || null }, { debounce: true })}
                className="input-field w-full min-w-0 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => edit({ quiet_hours_start: null, quiet_hours_end: null })}
              disabled={!draft.quiet_hours_start && !draft.quiet_hours_end}
              className="btn btn-outline text-xs py-2.5 disabled:opacity-40"
            >
              Clear
            </button>
          </div>
          {quietError && <p className="text-xs mt-1" style={{ color: 'var(--tm-danger)' }}>{quietError}</p>}
        </div>
      </SettingsGroup>
    </div>
  );
};

export default NotificationPreferencesForm;
