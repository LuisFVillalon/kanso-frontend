'use client';

import React, { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import ReminderLeadPicker from '@/app/components/notifications/ReminderLeadPicker';
import { describeError } from '@/app/lib/backend-api';
import type { NotificationPreferences, NotificationPreferencesUpdate } from '@/app/types/notification';
import { DEFAULT_MOOD_REMINDER_MINUTES, MOOD_REMINDER_MINUTES } from '@/app/utils/notifications';

/** Switch labels, in the order the day runs. Types the server adds later fall to the end. */
const TYPE_LABELS: Record<string, { label: string; hint: string }> = {
  due_today:      { label: 'Morning summary', hint: 'Tasks due today, when your day starts.' },
  task_reminder:  { label: 'Reminder before a task is due', hint: "At each task's reminder time." },
  final_warning:  { label: 'Final warning', hint: '30 minutes before a task is due.' },
  overdue:        { label: 'Slipped task nudge', hint: "Once, when a task's due time passes." },
  habit_reminder: { label: 'Evening habit reminder', hint: "An hour before you call it a day, if habits are left." },
  mood_reminder:  { label: 'Mood check-in reminder', hint: "Before you call it a day, if today's mood isn't logged yet." },
  mood_missed:    { label: 'Missed mood check-ins', hint: 'When days go by without a mood check-in.' },
};
const TYPE_ORDER = Object.keys(TYPE_LABELS);
const MOOD_TYPES = ['mood_reminder', 'mood_missed'];

const humanize = (type: string) => type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ');

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
  /** Mood check-in reminders are set to "Don't nudge", which silences the mood notifications too. */
  moodRemindersOff?: boolean;
}

/**
 * Settings → Notifications: a switch per alert type, quiet hours (which may
 * run past midnight) and the default reminder lead. Saves only what changed.
 */
const NotificationPreferencesForm: React.FC<Props> = ({ preferences, onSave, moodRemindersOff = false }) => {
  const [saved, setSaved] = useState(preferences);
  const [draft, setDraft] = useState(preferences);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const edit = (patch: Partial<NotificationPreferences>) => {
    setDraft(prev => ({ ...prev, ...patch }));
    setJustSaved(false);
  };

  const types = [
    ...TYPE_ORDER.filter(t => t in draft.types),
    ...Object.keys(draft.types).filter(t => !TYPE_ORDER.includes(t)),
  ];
  const quietError = quietHoursError(draft.quiet_hours_start, draft.quiet_hours_end);
  const moodLead = draft.mood_reminder_minutes === undefined
    ? null
    : MOOD_REMINDER_MINUTES.includes(draft.mood_reminder_minutes) ? draft.mood_reminder_minutes : DEFAULT_MOOD_REMINDER_MINUTES;
  const moodLeadChoice = moodLead !== null && (
    <div className="pl-4 border-l-2 border-border-subtle">
      <p id="mood-reminder-lead-label" className="text-xs font-medium text-text-muted mb-1">
        Remind me before &ldquo;Call it a day&rdquo;
      </p>
      <div className="flex items-center gap-1 p-1 rounded-lg bg-surface border border-border" role="group" aria-labelledby="mood-reminder-lead-label">
        {MOOD_REMINDER_MINUTES.map(minutes => (
          <button
            key={minutes}
            type="button"
            onClick={() => edit({ mood_reminder_minutes: minutes })}
            disabled={draft.types.mood_reminder === false || moodRemindersOff}
            aria-pressed={moodLead === minutes}
            className={`flex-1 px-2.5 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors disabled:opacity-60 ${
              moodLead === minutes ? 'bg-surface-raised text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {minutes === 60 ? '1 hour before' : `${minutes} minutes before`}
          </button>
        ))}
      </div>
    </div>
  );
  const changes = preferenceChanges(saved, draft);
  const dirty = Object.keys(changes).length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty || quietError) return;
    setSaving(true);
    setError(null);
    try {
      const next = await onSave(changes);
      setSaved(next);
      setDraft(next);
      setJustSaved(true);
    } catch (err) {
      setError(describeError(err, "Couldn't save your notification settings. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="text-xs font-medium text-text-muted mb-2">Alerts</legend>
        {types.map(type => {
          const { label, hint } = TYPE_LABELS[type] ?? { label: humanize(type), hint: '' };
          const on = draft.types[type];
          const labelId = `notif-type-${type}`;
          return (
            <React.Fragment key={type}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p id={labelId} className="text-sm font-medium text-text-primary">{label}</p>
                  {hint && <p className="text-xs text-text-muted">{hint}</p>}
                  {moodRemindersOff && MOOD_TYPES.includes(type) && (
                    <p className="text-xs" style={{ color: 'var(--tm-warning)' }}>
                      Silenced while Profile → Mood check-ins → Remind me is &ldquo;Don&rsquo;t nudge&rdquo;.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-labelledby={labelId}
                  onClick={() => edit({ types: { ...draft.types, [type]: !on } })}
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
              {type === 'mood_reminder' && moodLeadChoice}
            </React.Fragment>
          );
        })}
      </fieldset>

      <fieldset>
        <legend className="text-xs font-medium text-text-muted mb-2">Quiet hours</legend>
        <div className="grid grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div>
            <label htmlFor="quiet-start" className="block text-xs font-medium text-text-muted mb-1">From</label>
            <input
              id="quiet-start"
              type="time"
              value={draft.quiet_hours_start ?? ''}
              onChange={e => edit({ quiet_hours_start: e.target.value || null })}
              className="input-field w-full text-sm"
            />
          </div>
          <div>
            <label htmlFor="quiet-end" className="block text-xs font-medium text-text-muted mb-1">Until</label>
            <input
              id="quiet-end"
              type="time"
              value={draft.quiet_hours_end ?? ''}
              onChange={e => edit({ quiet_hours_end: e.target.value || null })}
              className="input-field w-full text-sm"
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
        {quietError ? (
          <p className="text-xs mt-1" style={{ color: 'var(--tm-danger)' }}>{quietError}</p>
        ) : (
          <p className="text-xs text-text-muted mt-1">
            Alerts that fire in this window wait until it ends. It can run past midnight, e.g. 22:00 to 07:00.
          </p>
        )}
      </fieldset>

      <div>
        <label id="default-reminder-label" className="block text-xs font-medium text-text-muted mb-1">
          Default reminder time
        </label>
        <ReminderLeadPicker
          aria-labelledby="default-reminder-label"
          value={draft.default_reminder_minutes}
          onChange={minutes => { if (minutes !== null) edit({ default_reminder_minutes: minutes }); }}
        />
        <p className="text-xs text-text-muted mt-1">Used for tasks with a due time unless you pick another when editing the task.</p>
      </div>

      {error && (
        <p role="alert" className="text-sm rounded-md px-3 py-2" style={{ backgroundColor: 'var(--tm-danger-subtle)', color: 'var(--tm-danger)' }}>
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={!dirty || !!quietError || saving} className="btn btn-primary disabled:opacity-60">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Save notifications'}
        </button>
        {justSaved && !dirty && (
          <span role="status" className="flex items-center gap-1 text-sm" style={{ color: 'var(--tm-success-text)' }}>
            <Check className="w-4 h-4" /> Saved.
          </span>
        )}
      </div>
    </form>
  );
};

export default NotificationPreferencesForm;
