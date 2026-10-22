'use client';

import React, { useEffect, useRef, useState } from 'react';
import { CalendarRange } from 'lucide-react';
import MoodCheckinModal, { type PeriodSummary } from '@/app/components/mood/MoodCheckinModal';
import { MoodFace, moodColor } from '@/app/components/mood/MoodFacePicker';
import { useToast } from '@/app/context/ToastContext';
import { deleteMoodCheckin, describeError, fetchMoodCheckins, saveMoodCheckin } from '@/app/lib/backend-api';
import type { ProfileFields } from '@/app/hooks/useProfile';
import { checkinToSave, moodLabel, type MoodCheckin, type MoodPeriodKind } from '@/app/types/mood';
import type { Task } from '@/app/types/task';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import { announceMoodCheckin, isLatestMoodCheckin, onMoodCheckin } from '@/app/utils/moodCheckinSync';
import { indexDayCheckins, summarizeMood } from '@/app/utils/moodReport';
import { checkinDayAt, endsPeriod, periodStartOf, type PeriodCheckinKind } from '@/app/utils/moodCheckinDay';

const PERIOD_KINDS: PeriodCheckinKind[] = ['week', 'month'];
const SETTING: Record<PeriodCheckinKind, 'weekly' | 'monthly'> = { week: 'weekly', month: 'monthly' };

interface Props {
  profile: ProfileFields;
  /** Whether the profile has loaded, so nothing is offered off the local defaults. */
  profileLoaded: boolean;
  tasks: Task[];
}

/** The check-ins one fetch loaded: the week's or month's the day ends, with their days. */
interface Loaded {
  date: string;
  kinds: MoodPeriodKind[];
  rows: MoodCheckin[];
}

/**
 * The dashboard's weekly and monthly mood check-ins, while they're on: on
 * the day that ends the Mon–Sun week (Sunday) or the month, a small chip to
 * log it, or its mood with Edit once logged. The day's own check-in lives in
 * the Daily Brief (DayMoodCheckin).
 */
const PeriodMoodCheckins: React.FC<Props> = ({ profile, profileLoaded, tasks }) => {
  const showToast = useToast();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const settings = profile.moodCheckins;
  const day = checkinDayAt(now, profile.dayStartTime, profile.shutoffTime);
  const dayKey = toLocalDateStr(day);
  const periodsOn = profileLoaded ? PERIOD_KINDS.filter(kind => settings[SETTING[kind]] && endsPeriod(kind, day)) : [];

  // The periods' check-ins and their days (for the summary), fetched before
  // any chip shows so logging never overwrites one it couldn't see.
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const fetchFrom = periodsOn.reduce((from, kind) => {
    const start = toLocalDateStr(periodStartOf(kind, day));
    return start < from ? start : from;
  }, dayKey);
  const kindsKey = periodsOn.length > 0 ? ['day', ...periodsOn].join(',') : '';
  useEffect(() => {
    if (!kindsKey) return;
    let cancelled = false;
    const kinds = kindsKey.split(',') as MoodPeriodKind[];
    fetchMoodCheckins(fetchFrom, dayKey, kinds)
      .then(rows => { if (!cancelled) setLoaded({ date: dayKey, kinds, rows }); })
      .catch(() => {}); // stay hidden; saving would likely fail too
    return () => { cancelled = true; };
  }, [dayKey, fetchFrom, kindsKey]);

  // Saves from here and from elsewhere (the calendar report) alike.
  useEffect(() => onMoodCheckin(({ kind, start, row }) => {
    setLoaded(prev => {
      if (!prev) return prev;
      const rest = prev.rows.filter(r => r.period_kind !== kind || r.period_start !== start);
      return { ...prev, rows: row ? [...rest, row] : rest };
    });
  }), []);

  // The check-in stays on the day it was opened for, even if the clock rolls past it.
  const [modal, setModal] = useState<{ kind: PeriodCheckinKind; day: Date; existing: MoodCheckin | null } | null>(null);

  const periods = periodsOn.flatMap(kind => {
    const start = toLocalDateStr(periodStartOf(kind, day));
    if (loaded?.date !== dayKey || !loaded.kinds.includes(kind)) return [];
    const row = loaded.rows.find(r => r.period_kind === kind && r.period_start === start) ?? null;
    return [{ kind, row }];
  });

  const periodSummary = (kind: PeriodCheckinKind, last: Date): PeriodSummary => {
    const start = periodStartOf(kind, last);
    const from = toLocalDateStr(start);
    const to = toLocalDateStr(last);
    const { average, logged, days } = summarizeMood(indexDayCheckins(loaded?.rows ?? []), start, last, now);
    const tasksDone = tasks.filter(t => {
      const done = t.completed && t.completed_date ? toLocalDateStr(t.completed_date) : null;
      return done != null && done >= from && done <= to;
    }).length;
    return { average, logged, days, tasksDone };
  };

  const dismissSavedToast = useRef<(() => void) | null>(null);
  const setRow = (kind: MoodPeriodKind, start: string, row: MoodCheckin | null) => {
    announceMoodCheckin({ kind, start, row });
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
    const what = saved.period_kind === 'week' ? 'Weekly check-in' : 'Monthly check-in';
    if (previous) {
      dismissSavedToast.current?.();
      dismissSavedToast.current = null;
      showToast(`${what} updated.`, 'success', { label: 'Undo', onClick: () => restore(previous) });
      return;
    }
    dismissSavedToast.current = showToast(`${what} saved · ${moodLabel(saved.mood)}`, 'success', {
      label: 'Undo',
      onClick: () => {
        if (!isLatestMoodCheckin(saved)) return;
        deleteMoodCheckin(saved.id)
          .then(() => setRow(saved.period_kind, saved.period_start, null))
          .catch(err => showToast(describeError(err, "Couldn't undo. Please try again.")));
      },
    });
  };

  const periodName = (kind: PeriodCheckinKind) =>
    kind === 'week' ? 'this week' : day.toLocaleDateString('en-US', { month: 'long' });

  return (
    <>
      {periods.length > 0 && (
        <div className="mb-4 sm:mb-6 flex flex-wrap justify-end gap-2">
          {periods.map(({ kind, row }) => {
            const open = () => setModal({ kind, day, existing: row });
            const name = periodName(kind);
            return row ? (
              <span key={kind} className="chip mood-tag gap-1.5">
                <span className="w-5 h-5 shrink-0" style={{ color: moodColor(row.mood) }}>
                  <MoodFace mood={row.mood} filled className="w-full h-full" />
                </span>
                <span className="text-text-primary">
                  {kind === 'week' ? 'This week' : name}: {moodLabel(row.mood)}
                </span>
                <span aria-hidden="true" className="opacity-40">·</span>
                <button type="button" onClick={open} aria-label={`Edit ${name}’s check-in`} className="font-medium text-accent hover:underline">
                  Edit
                </button>
              </span>
            ) : (
              <button key={kind} type="button" onClick={open} className="chip mood-tag">
                <CalendarRange className="w-3.5 h-3.5" aria-hidden="true" />
                Log {name}
              </button>
            );
          })}
        </div>
      )}

      {modal && (
        <MoodCheckinModal
          kind={modal.kind}
          date={modal.day}
          existing={modal.existing}
          periodSummary={periodSummary(modal.kind, modal.day)}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
};

export default PeriodMoodCheckins;
