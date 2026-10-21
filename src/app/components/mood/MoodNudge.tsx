'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AlarmClock, CalendarRange, Moon, Smile } from 'lucide-react';
import MoodCheckinModal, { type DaySummary, type PeriodSummary } from '@/app/components/mood/MoodCheckinModal';
import MoodFacePicker, { MoodFace, moodColor } from '@/app/components/mood/MoodFacePicker';
import { useToast } from '@/app/context/ToastContext';
import { deleteMoodCheckin, describeError, fetchMoodCheckins, fetchNoteTimeSpentForRange, saveMoodCheckin } from '@/app/lib/backend-api';
import type { ProfileFields } from '@/app/hooks/useProfile';
import type { Habit } from '@/app/types/habit';
import { checkinToSave, moodLabel, type MoodCheckin, type MoodPeriodKind } from '@/app/types/mood';
import type { Task } from '@/app/types/task';
import { formatDateRange, toLocalDateStr } from '@/app/utils/dateUtils';
import { indexDayCheckins, summarizeMood } from '@/app/utils/moodReport';
import {
  checkinDayAt,
  endsPeriod,
  endsPastMidnight,
  moodNudgeState,
  optInHintSeen,
  periodNudgeState,
  periodStartOf,
  type MoodNudgeDismissals,
  type PeriodCheckinKind,
  type PeriodNudgeState,
} from '@/app/utils/moodNudge';

// Skips, snoozes and the one-time opt-in hints stay on this device (cleared
// on logout with the other tm_* keys) and never become check-ins.
const DISMISSALS_KEY = 'tm_mood_nudge';
const HINTS_KEY = 'tm_mood_optin_hint';

/** The day each "Turn on weekly/monthly check-ins" hint first showed. */
type OptInHints = Partial<Record<PeriodCheckinKind, string>>;

const readStored = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeStored = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // private mode / storage full: the nudge just forgets on reload
  }
};

type DismissalsPatch = Omit<MoodNudgeDismissals, 'date'>;

const SNOOZE_MS = 60 * 60 * 1000;
const PERIOD_KINDS: PeriodCheckinKind[] = ['week', 'month'];
const SETTING: Record<PeriodCheckinKind, 'weekly' | 'monthly'> = { week: 'weekly', month: 'monthly' };

interface Props {
  profile: ProfileFields;
  /** Whether the profile has loaded, so the nudge never times itself off the local defaults. */
  profileLoaded: boolean;
  tasks: Task[];
  habits: Habit[];
  /** Saves the profile — how the opt-in hint turns weekly or monthly check-ins on. */
  onSaveProfile: (next: ProfileFields) => Promise<{ ok: boolean; error?: string }>;
}

/** The check-ins one fetch loaded: the day's, and the week's or month's the day ends when they're on. */
interface Loaded {
  date: string;
  kinds: MoodPeriodKind[];
  rows: MoodCheckin[];
}

const rowKey = (kind: MoodPeriodKind, start: string) => `${kind}:${start}`;

/**
 * The dashboard's end-of-day mood check-in prompt: from "Call it a day" on
 * non-rest days, five faces that open the check-in with that mood picked.
 * Gives way to a small chip after "Not today" (and on rest days), and to a
 * quiet confirmation once the day is saved. On Sunday the same card adds the
 * weekly check-in, and on the last day of the month the monthly one — or,
 * while those are off, a one-time hint to turn them on. See
 * utils/moodNudge.ts for the rules.
 */
const MoodNudge: React.FC<Props> = ({ profile, profileLoaded, tasks, habits, onSaveProfile }) => {
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
  const periodsOn = PERIOD_KINDS.filter(kind => settings[SETTING[kind]] && endsPeriod(kind, day));

  // The day's check-in (and the week's or month's it ends, with their days),
  // fetched once it could be due so the card never shows before we know
  // what's already logged.
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const watching = profileLoaded && due && (settings.daily || periodsOn.length > 0);
  const fetchFrom = periodsOn.reduce((from, kind) => {
    const start = toLocalDateStr(periodStartOf(kind, day));
    return start < from ? start : from;
  }, dayKey);
  const kindsKey = ['day', ...periodsOn].join(',');
  useEffect(() => {
    if (!watching) return;
    let cancelled = false;
    const kinds = kindsKey.split(',') as MoodPeriodKind[];
    fetchMoodCheckins(fetchFrom, dayKey, kinds)
      .then(rows => { if (!cancelled) setLoaded({ date: dayKey, kinds, rows }); })
      .catch(() => {}); // stay hidden; saving would likely fail too
    return () => { cancelled = true; };
  }, [watching, dayKey, fetchFrom, kindsKey]);

  /** The period's check-in: undefined until known, null when there's none. */
  const rowFor = (kind: MoodPeriodKind, start: string): MoodCheckin | null | undefined =>
    loaded?.date === dayKey && loaded.kinds.includes(kind)
      ? loaded.rows.find(r => r.period_kind === kind && r.period_start === start) ?? null
      : undefined;
  const checkin = rowFor('day', dayKey);

  const [dismissals, setDismissals] = useState<MoodNudgeDismissals | null>(() => readStored(DISMISSALS_KEY));
  const latestDismissals = useRef(dismissals);
  const updateDismissals = (patch: DismissalsPatch | ((current: MoodNudgeDismissals) => DismissalsPatch), date = dayKey) => {
    const current = latestDismissals.current?.date === date ? latestDismissals.current : { date };
    const next = { ...current, ...(typeof patch === 'function' ? patch(current) : patch) };
    latestDismissals.current = next;
    writeStored(DISMISSALS_KEY, next);
    setDismissals(next);
  };
  // Read fresh each render, so a dashboard left open still sees which hints were used up.
  const hints = readStored<OptInHints>(HINTS_KEY) ?? {};

  const ruleInput = {
    now,
    settings,
    dayStartTime: profile.dayStartTime,
    shutoffTime: profile.shutoffTime,
    restDays: profile.restDays,
    checkedIn: checkin != null,
    dismissals,
  };
  const state = checkin === undefined ? 'hidden' : moodNudgeState(ruleInput);

  const periods = PERIOD_KINDS.map(kind => {
    const start = periodStartOf(kind, day);
    const row = rowFor(kind, toLocalDateStr(start));
    const periodState: PeriodNudgeState = checkin === undefined || (settings[SETTING[kind]] && row === undefined)
      ? 'hidden'
      : periodNudgeState({ ...ruleInput, kind, periodCheckedIn: row != null, hintSeen: optInHintSeen(hints[kind], day) });
    return { kind, start, row: row ?? null, state: periodState };
  });

  // A hint shows for the rest of the day it first appears, then never again.
  const newHints = periods.filter(p => p.state === 'hint' && hints[p.kind] == null).map(p => p.kind).join(',');
  useEffect(() => {
    if (!newHints) return;
    const next = readStored<OptInHints>(HINTS_KEY) ?? {};
    for (const kind of newHints.split(',') as PeriodCheckinKind[]) next[kind] ??= dayKey;
    writeStored(HINTS_KEY, next);
  }, [newHints, dayKey]);

  // The check-in stays on the day it was opened for, even if the clock rolls past it.
  const [modal, setModal] = useState<{
    kind: MoodPeriodKind;
    initialMood: number | null;
    day: Date;
    dayKey: string;
    existing: MoodCheckin | null;
  } | null>(null);
  const openModal = (initialMood: number | null, kind: MoodPeriodKind = 'day', existing = kind === 'day' ? checkin ?? null : null) =>
    setModal({ kind, initialMood, day, dayKey, existing });
  const modalDayKey = modal?.kind === 'day' ? modal.dayKey : undefined;
  const [noteSeconds, setNoteSeconds] = useState<{ date: string; seconds: number } | null>(null);
  useEffect(() => {
    if (!modalDayKey) return;
    let cancelled = false;
    fetchNoteTimeSpentForRange(modalDayKey, modalDayKey)
      .then(totals => {
        if (!cancelled) setNoteSeconds({ date: modalDayKey, seconds: Object.values(totals).reduce((a, b) => a + b, 0) });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [modalDayKey]);

  const modalIsToday = modal?.dayKey === toLocalDateStr(now);
  const tasksDoneBetween = (from: string, to: string) =>
    tasks.filter(t => {
      const done = t.completed && t.completed_date ? toLocalDateStr(t.completed_date) : null;
      return done != null && done >= from && done <= to;
    }).length;
  const summary: DaySummary | null = modal ? {
    tasksDone: tasksDoneBetween(modal.dayKey, modal.dayKey),
    noteSeconds: noteSeconds && noteSeconds.date === modal.dayKey ? noteSeconds.seconds : null,
    // logged_today is about the calendar day, so only count habits for today's check-in.
    habitsDone: modalIsToday ? habits.filter(h => h.logged_today).length : 0,
    habitsTotal: modalIsToday ? habits.length : 0,
  } : null;
  const periodSummary = (kind: PeriodCheckinKind, last: Date): PeriodSummary => {
    const start = periodStartOf(kind, last);
    const { average, logged, days } = summarizeMood(indexDayCheckins(loaded?.rows ?? []), start, last, now);
    return { average, logged, days, tasksDone: tasksDoneBetween(toLocalDateStr(start), toLocalDateStr(last)) };
  };

  // The newest row we saved per period, so an older "Saved" toast's Undo can tell it has since changed.
  const latestSaved = useRef(new Map<string, MoodCheckin | null>());
  const dismissSavedToast = useRef<(() => void) | null>(null);
  const setRow = (kind: MoodPeriodKind, start: string, row: MoodCheckin | null) => {
    latestSaved.current.set(rowKey(kind, start), row);
    // Rows are looked up by kind and start, so one saved after the day rolled over is harmless here.
    setLoaded(prev => {
      if (!prev) return prev;
      const rest = prev.rows.filter(r => r.period_kind !== kind || r.period_start !== start);
      return { ...prev, rows: row ? [...rest, row] : rest };
    });
  };

  const restore = async (row: MoodCheckin) => {
    try {
      setRow(row.period_kind, row.period_start, await saveMoodCheckin(checkinToSave(row)));
    } catch (err) {
      showToast(describeError(err, "Couldn't undo. Please try again."));
    }
  };

  const handleSaved = (saved: MoodCheckin, previous: MoodCheckin | null) => {
    setModal(null);
    setRow(saved.period_kind, saved.period_start, saved);
    const what = saved.period_kind === 'week' ? 'Weekly check-in' : saved.period_kind === 'month' ? 'Monthly check-in' : 'Check-in';
    if (previous) {
      dismissSavedToast.current?.();
      dismissSavedToast.current = null;
      showToast(`${what} updated.`, 'success', { label: 'Undo', onClick: () => restore(previous) });
      return;
    }
    const key = rowKey(saved.period_kind, saved.period_start);
    dismissSavedToast.current = showToast(`${saved.period_kind === 'day' ? 'Saved' : `${what} saved`} · ${moodLabel(saved.mood)}`, 'success', {
      label: 'Undo',
      onClick: () => {
        if (latestSaved.current.get(key) !== saved) return;
        deleteMoodCheckin(saved.id)
          .then(() => setRow(saved.period_kind, saved.period_start, null))
          .catch(err => showToast(describeError(err, "Couldn't undo. Please try again.")));
      },
    });
  };

  const until = endsPastMidnight(profile.dayStartTime, profile.shutoffTime) ? 'your next day starts' : 'midnight';
  const handleSkip = (date = dayKey) => {
    setModal(null);
    updateDismissals({ skipped: true }, date);
    showToast(`Skipped for today. You can still log it until ${until}.`, 'info', {
      label: 'Undo',
      onClick: () => updateDismissals({ skipped: false }, date),
    });
  };

  const handleSkipPeriod = (kind: PeriodCheckinKind, date: string) => {
    setModal(null);
    updateDismissals(current => ({ periodsSkipped: [...(current.periodsSkipped ?? []).filter(k => k !== kind), kind] }), date);
    showToast(`Skipped the ${SETTING[kind]} check-in. You can still log it until ${until}.`, 'info', {
      label: 'Undo',
      onClick: () => updateDismissals(current => ({ periodsSkipped: (current.periodsSkipped ?? []).filter(k => k !== kind) }), date),
    });
  };

  const handleSnooze = () => {
    const until = new Date(now.getTime() + SNOOZE_MS);
    updateDismissals({ snoozedUntil: until.getTime() });
    showToast(`We'll ask again at ${until.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.`, 'info');
  };

  const [turningOn, setTurningOn] = useState(false);
  const turnOn = async (kind: PeriodCheckinKind) => {
    if (turningOn) return;
    setTurningOn(true);
    const result = await onSaveProfile({ ...profile, moodCheckins: { ...settings, [SETTING[kind]]: true } });
    setTurningOn(false);
    if (result.ok) showToast(`${kind === 'week' ? 'Weekly' : 'Monthly'} check-ins are on. You can turn them off in Settings.`, 'success');
    else showToast(result.error ?? "Couldn't turn them on. Please try again.");
  };

  const dayName = day.toLocaleDateString('en-US', { weekday: 'long' });
  const monthName = day.toLocaleDateString('en-US', { month: 'long' });
  const periodName = (kind: PeriodCheckinKind) => (kind === 'week' ? 'this week' : monthName);

  const strips = periods.filter(p => p.state === 'strip' || p.state === 'logged' || p.state === 'hint');
  const chips = periods.filter(p => p.state === 'chip');
  const dayLogged = state === 'logged' && checkin;

  return (
    <>
      {(state === 'nudge' || dayLogged || strips.length > 0) && (
        <section
          aria-labelledby={state === 'nudge' ? 'mood-nudge-title' : undefined}
          aria-label={state === 'nudge' ? undefined : 'Mood check-in'}
          className="card-glass animate-slide-up mb-4 sm:mb-6 overflow-hidden"
        >
          {state === 'nudge' && (
            <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-6">
              <div className="flex items-start gap-3 lg:w-80 lg:shrink-0">
                <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-accent-subtle text-accent">
                  <Moon className="w-[18px] h-[18px]" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 id="mood-nudge-title" className="text-base text-text-primary">Calling it a day?</h2>
                  <p className="text-sm text-text-secondary">How did {dayName} feel? Tap a face — the rest is optional.</p>
                </div>
              </div>
              <MoodFacePicker
                value={null}
                onChange={openModal}
                label={`How did ${dayName} feel?`}
                compact
                className="flex-1 max-w-md"
              />
              <div className="flex items-center gap-3 lg:ml-auto">
                <button type="button" onClick={() => handleSkip()} className="text-sm font-medium text-text-secondary hover:text-text-primary">
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
          )}

          {dayLogged && (
            <div className="px-4 py-3 flex flex-wrap items-center gap-3">
              <span
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ color: moodColor(checkin.mood), backgroundColor: `color-mix(in srgb, ${moodColor(checkin.mood)} 16%, transparent)` }}
              >
                <MoodFace mood={checkin.mood} filled className="w-5 h-5" />
              </span>
              <p className="text-sm text-text-primary flex-1 min-w-0">
                Logged {isToday ? 'today' : dayName} as <b>{moodLabel(checkin.mood)}</b>. Enjoy your evening.
              </p>
              <button type="button" onClick={() => openModal(null)} className="text-sm font-medium text-accent hover:underline">
                Edit
              </button>
            </div>
          )}

          {strips.map(({ kind, start, row, state: stripState }) => {
            const name = kind === 'week' ? 'Weekly check-in' : 'Monthly check-in';
            const rowClass = 'px-4 sm:px-5 border-t border-border-subtle first:border-t-0 flex flex-wrap items-center gap-2';
            if (stripState === 'hint') {
              return (
                <div key={kind} className={`${rowClass} py-2 text-xs text-text-muted`}>
                  <CalendarRange className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{kind === 'week' ? 'Want a quick look back at the whole week too?' : 'Want to wrap up the month too?'}</span>
                  <button
                    type="button"
                    onClick={() => turnOn(kind)}
                    disabled={turningOn}
                    className="font-medium text-accent hover:underline disabled:opacity-60"
                  >
                    Turn on {SETTING[kind]} check-ins
                  </button>
                  <span className="ml-auto">Shown once, then only in Settings</span>
                </div>
              );
            }
            if (stripState === 'logged' && row) {
              return (
                <div key={kind} className={`${rowClass} py-2.5 text-sm`}>
                  <span className="w-5 h-5 shrink-0" style={{ color: moodColor(row.mood) }}>
                    <MoodFace mood={row.mood} filled className="w-full h-full" />
                  </span>
                  <p className="text-text-secondary flex-1 min-w-0">
                    {name} logged as <b className="text-text-primary">{moodLabel(row.mood)}</b>.
                  </p>
                  <button type="button" onClick={() => openModal(null, kind, row)} className="font-medium text-accent hover:underline">
                    Edit
                  </button>
                </div>
              );
            }
            return (
              <div key={kind} className={`${rowClass} py-2.5 text-sm`} style={{ backgroundColor: 'color-mix(in srgb, var(--tm-surface-raised) 60%, transparent)' }}>
                <CalendarRange className="w-4 h-4 text-accent" aria-hidden="true" />
                <span className="font-medium text-text-primary">{name}</span>
                <span className="text-text-muted">
                  · {kind === 'week' ? `A quick look back at ${formatDateRange(start, day)}` : `Wrap up ${monthName} in 15 seconds`}
                </span>
                <button type="button" onClick={() => openModal(null, kind)} className="ml-auto btn btn-secondary py-1 px-3 text-xs">
                  Start
                </button>
              </div>
            );
          })}
        </section>
      )}

      {(state === 'chip' || chips.length > 0) && (
        <div className="mb-4 sm:mb-6 flex flex-wrap justify-end gap-2">
          {state === 'chip' && (
            <button type="button" onClick={() => openModal(null)} className="chip mood-tag">
              <Smile className="w-3.5 h-3.5" aria-hidden="true" />
              Log {isToday ? 'today' : dayName}&rsquo;s mood
            </button>
          )}
          {chips.map(({ kind }) => (
            <button key={kind} type="button" onClick={() => openModal(null, kind)} className="chip mood-tag">
              <CalendarRange className="w-3.5 h-3.5" aria-hidden="true" />
              Log {periodName(kind)}
            </button>
          ))}
        </div>
      )}

      {modal && (
        <MoodCheckinModal
          kind={modal.kind}
          date={modal.day}
          existing={modal.existing}
          initialMood={modal.initialMood}
          summary={modal.kind === 'day' ? summary : null}
          periodSummary={modal.kind === 'day' ? null : periodSummary(modal.kind, modal.day)}
          onClose={() => setModal(null)}
          onSkip={modal.kind === 'day'
            ? (state === 'nudge' ? () => handleSkip(modal.dayKey) : undefined)
            : (periods.find(p => p.kind === modal.kind)?.state === 'strip' ? () => handleSkipPeriod(modal.kind as PeriodCheckinKind, modal.dayKey) : undefined)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
};

export default MoodNudge;
