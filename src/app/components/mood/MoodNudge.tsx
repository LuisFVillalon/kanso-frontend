'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AlarmClock, Moon, Smile } from 'lucide-react';
import MoodCheckinModal, { type DaySummary } from '@/app/components/mood/MoodCheckinModal';
import MoodFacePicker, { MoodFace, moodColor } from '@/app/components/mood/MoodFacePicker';
import { useToast } from '@/app/context/ToastContext';
import { deleteMoodCheckin, describeError, fetchMoodCheckins, fetchNoteTimeSpentForRange, saveMoodCheckin } from '@/app/lib/backend-api';
import type { ProfileFields } from '@/app/hooks/useProfile';
import type { Habit } from '@/app/types/habit';
import { checkinToSave, moodLabel, type MoodCheckin } from '@/app/types/mood';
import type { Task } from '@/app/types/task';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import { checkinDayAt, endsPastMidnight, moodNudgeState, type MoodNudgeDismissals } from '@/app/utils/moodNudge';

// Skips and snoozes stay on this device (cleared on logout with
// the other tm_* keys) and never become check-ins.
const DISMISSALS_KEY = 'tm_mood_nudge';

const readDismissals = (): MoodNudgeDismissals | null => {
  try {
    const raw = localStorage.getItem(DISMISSALS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeDismissals = (dismissals: MoodNudgeDismissals) => {
  try {
    localStorage.setItem(DISMISSALS_KEY, JSON.stringify(dismissals));
  } catch {
    // private mode / storage full: the nudge just forgets on reload
  }
};

const SNOOZE_MS = 60 * 60 * 1000;

interface Props {
  profile: ProfileFields;
  /** Whether the profile has loaded, so the nudge never times itself off the local defaults. */
  profileLoaded: boolean;
  tasks: Task[];
  habits: Habit[];
}

/**
 * The dashboard's end-of-day mood check-in prompt: from "Call it a day" on
 * non-rest days, five faces that open the check-in with that mood picked.
 * Gives way to a small chip after "Not today" (and on rest days), and to a
 * quiet confirmation once the day is saved. See utils/moodNudge.ts for the rule.
 */
const MoodNudge: React.FC<Props> = ({ profile, profileLoaded, tasks, habits }) => {
  const showToast = useToast();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const settings = profile.moodCheckins;
  const { day, due } = checkinDayAt(now, profile.dayStartTime, profile.shutoffTime, settings.remind);
  const dayKey = toLocalDateStr(day);
  const isToday = dayKey === toLocalDateStr(now);

  // The day's check-in, fetched once it could be due so the card never shows
  // before we know whether the day is already logged.
  const [loaded, setLoaded] = useState<{ date: string; checkin: MoodCheckin | null } | null>(null);
  const watching = profileLoaded && settings.daily && due;
  useEffect(() => {
    if (!watching) return;
    let cancelled = false;
    fetchMoodCheckins(dayKey, dayKey, ['day'])
      .then(rows => { if (!cancelled) setLoaded({ date: dayKey, checkin: rows[0] ?? null }); })
      .catch(() => {}); // stay hidden; saving would likely fail too
    return () => { cancelled = true; };
  }, [watching, dayKey]);
  const checkin = loaded?.date === dayKey ? loaded.checkin : undefined;

  const [dismissals, setDismissals] = useState<MoodNudgeDismissals | null>(readDismissals);
  const updateDismissals = (patch: Omit<MoodNudgeDismissals, 'date'>) => {
    const next = { ...(dismissals?.date === dayKey ? dismissals : { date: dayKey }), ...patch };
    writeDismissals(next);
    setDismissals(next);
  };

  const state = checkin === undefined
    ? 'hidden'
    : moodNudgeState({
        now,
        settings,
        dayStartTime: profile.dayStartTime,
        shutoffTime: profile.shutoffTime,
        restDays: profile.restDays,
        checkedIn: checkin != null,
        dismissals,
      });

  const [modal, setModal] = useState<{ initialMood: number | null } | null>(null);
  const [noteSeconds, setNoteSeconds] = useState<{ date: string; seconds: number } | null>(null);
  const modalOpen = modal != null;
  useEffect(() => {
    if (!modalOpen) return;
    let cancelled = false;
    fetchNoteTimeSpentForRange(dayKey, dayKey)
      .then(totals => {
        if (!cancelled) setNoteSeconds({ date: dayKey, seconds: Object.values(totals).reduce((a, b) => a + b, 0) });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [modalOpen, dayKey]);

  const summary: DaySummary = {
    tasksDone: tasks.filter(t => t.completed && t.completed_date && toLocalDateStr(t.completed_date) === dayKey).length,
    noteSeconds: noteSeconds?.date === dayKey ? noteSeconds.seconds : null,
    // logged_today is about the calendar day, so only count habits for today's check-in.
    habitsDone: isToday ? habits.filter(h => h.logged_today).length : 0,
    habitsTotal: isToday ? habits.length : 0,
  };

  // The newest row we saved, so an older "Saved" toast's Undo can tell it has since changed.
  const latestSaved = useRef<MoodCheckin | null>(null);
  const dismissSavedToast = useRef<(() => void) | null>(null);
  const setCheckin = (row: MoodCheckin | null) => {
    latestSaved.current = row;
    setLoaded({ date: dayKey, checkin: row });
  };

  const restore = async (row: MoodCheckin) => {
    try {
      setCheckin(await saveMoodCheckin(checkinToSave(row)));
    } catch (err) {
      showToast(describeError(err, "Couldn't undo. Please try again."));
    }
  };

  const handleSaved = (saved: MoodCheckin, previous: MoodCheckin | null) => {
    setModal(null);
    setCheckin(saved);
    if (previous) {
      dismissSavedToast.current?.();
      dismissSavedToast.current = null;
      showToast('Check-in updated.', 'success', { label: 'Undo', onClick: () => restore(previous) });
      return;
    }
    dismissSavedToast.current = showToast(`Saved · ${moodLabel(saved.mood)}`, 'success', {
      label: 'Undo',
      onClick: () => {
        if (latestSaved.current !== saved) return;
        deleteMoodCheckin(saved.id)
          .then(() => setCheckin(null))
          .catch(err => showToast(describeError(err, "Couldn't undo. Please try again.")));
      },
    });
  };

  const handleSkip = () => {
    setModal(null);
    updateDismissals({ skipped: true });
    const until = endsPastMidnight(profile.dayStartTime, profile.shutoffTime) ? 'your next day starts' : 'midnight';
    showToast(`Skipped for today. You can still log it until ${until}.`, 'info', {
      label: 'Undo',
      onClick: () => updateDismissals({ skipped: false }),
    });
  };

  const handleSnooze = () => {
    const until = new Date(now.getTime() + SNOOZE_MS);
    updateDismissals({ snoozedUntil: until.getTime() });
    showToast(`We'll ask again at ${until.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.`, 'info');
  };

  const dayName = day.toLocaleDateString('en-US', { weekday: 'long' });

  return (
    <>
      {state === 'nudge' && (
        <section aria-labelledby="mood-nudge-title" className="card-glass animate-slide-up mb-4 sm:mb-6">
          <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-6">
            <div className="flex items-start gap-3 lg:w-80 lg:shrink-0">
              <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-accent-subtle text-accent">
                <Moon className="w-[18px] h-[18px]" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 id="mood-nudge-title" className="text-base font-semibold text-text-primary">Calling it a day?</h2>
                <p className="text-sm text-text-secondary">How did {dayName} feel? Tap a face — the rest is optional.</p>
              </div>
            </div>
            <MoodFacePicker
              value={null}
              onChange={mood => setModal({ initialMood: mood })}
              label={`How did ${dayName} feel?`}
              compact
              className="flex-1 max-w-md"
            />
            <div className="flex items-center gap-3 lg:ml-auto">
              <button type="button" onClick={handleSkip} className="text-sm font-medium text-text-secondary hover:text-text-primary">
                Not today
              </button>
              <button
                type="button"
                onClick={handleSnooze}
                className="text-sm font-medium text-text-secondary hover:text-text-primary inline-flex items-center gap-1"
              >
                <AlarmClock className="w-3.5 h-3.5" aria-hidden="true" />
                In 1 hour
              </button>
            </div>
          </div>
        </section>
      )}

      {state === 'chip' && (
        <div className="mb-4 sm:mb-6 flex justify-end">
          <button type="button" onClick={() => setModal({ initialMood: null })} className="chip mood-tag">
            <Smile className="w-3.5 h-3.5" aria-hidden="true" />
            Log {isToday ? 'today' : dayName}&rsquo;s mood
          </button>
        </div>
      )}

      {state === 'logged' && checkin && (
        <div className="card-glass animate-slide-up mb-4 sm:mb-6 px-4 py-3 flex flex-wrap items-center gap-3">
          <span
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{ color: moodColor(checkin.mood), backgroundColor: `color-mix(in srgb, ${moodColor(checkin.mood)} 16%, transparent)` }}
          >
            <MoodFace mood={checkin.mood} filled className="w-5 h-5" />
          </span>
          <p className="text-sm text-text-primary flex-1 min-w-0">
            Logged {isToday ? 'today' : dayName} as <b>{moodLabel(checkin.mood)}</b>. Enjoy your evening.
          </p>
          <button type="button" onClick={() => setModal({ initialMood: null })} className="text-sm font-medium text-accent hover:underline">
            Edit
          </button>
        </div>
      )}

      {modal && (
        <MoodCheckinModal
          date={day}
          existing={checkin ?? null}
          initialMood={modal.initialMood}
          summary={summary}
          onClose={() => setModal(null)}
          onSkip={state === 'nudge' ? handleSkip : undefined}
          onSaved={handleSaved}
        />
      )}
    </>
  );
};

export default MoodNudge;
