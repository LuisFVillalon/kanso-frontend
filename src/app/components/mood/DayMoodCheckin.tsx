'use client';

import React, { useEffect, useState } from 'react';
import { Smile } from 'lucide-react';
import type { ModalLayer } from '@/app/components/common/Modal';
import MoodCheckinModal, { type DaySummary } from '@/app/components/mood/MoodCheckinModal';
import { MoodFace, moodColor } from '@/app/components/mood/MoodFacePicker';
import { useToast } from '@/app/context/ToastContext';
import { useDayMoodCheckin, useMoodCheckinSaved } from '@/app/hooks/useDayMoodCheckin';
import type { Habit } from '@/app/types/habit';
import { moodLabel, type MoodCheckin } from '@/app/types/mood';
import type { Task } from '@/app/types/task';
import { parseLocalDate, toLocalDateStr } from '@/app/utils/dateUtils';
import { checkinDayAt } from '@/app/utils/moodNudge';
import type { ProfileFields } from '@/app/hooks/useProfile';

/**
 * A day's context strip for the check-in form from the dashboard's lists.
 * Habits only count for today: `logged_today` is about the calendar day.
 */
export function daySummaryFrom(date: string, tasks: Task[], habits: Habit[]): DaySummary {
  const isToday = date === toLocalDateStr(new Date());
  return {
    tasksDone: tasks.filter(t => t.completed && t.completed_date && toLocalDateStr(t.completed_date) === date).length,
    noteSeconds: null,
    habitsDone: isToday ? habits.filter(h => h.logged_today).length : 0,
    habitsTotal: isToday ? habits.length : 0,
  };
}

interface Props {
  /** The local day, "YYYY-MM-DD". */
  date: string;
  /**
   * - `brief`: the Daily Brief's line — "Log today's mood", or the day's
   *   mood with Edit.
   * - `chip`: the calendar day panel's chip — "Log mood", or the mood with Edit.
   */
  variant: 'brief' | 'chip';
  summary?: DaySummary | null;
  className?: string;
  /** The form's z-index tier, when this sits inside another modal. */
  modalLayer?: ModalLayer;
}

/**
 * Log or edit one day's mood check-in, at any time of day and on rest days.
 * Shows nothing until the day's check-in is known (or if it can't load), so
 * logging never overwrites one it couldn't see. Never part of the AI brief.
 */
const DayMoodCheckin: React.FC<Props> = ({ date, variant, summary = null, className = '', modalLayer }) => {
  const { checkin } = useDayMoodCheckin(date);
  const onSaved = useMoodCheckinSaved();
  // The form stays on the day it was opened for, even if the clock rolls past it.
  const [modal, setModal] = useState<{ date: string; existing: MoodCheckin | null } | null>(null);

  if (checkin === undefined && !modal) return null;

  const day = parseLocalDate(date);
  const isToday = date === toLocalDateStr(new Date());
  const dayName = isToday ? 'today' : day.toLocaleDateString('en-US', { weekday: 'long' });
  const longName = day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const open = () => setModal({ date, existing: checkin ?? null });

  const face = checkin && (
    <span className="w-5 h-5 shrink-0" style={{ color: moodColor(checkin.mood) }}>
      <MoodFace mood={checkin.mood} filled className="w-full h-full" />
    </span>
  );

  return (
    <>
      {checkin !== undefined && (variant === 'brief' ? (
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 rounded-lg bg-surface-raised text-sm ${className}`}>
          {checkin ? (
            <>
              {face}
              <p className="flex-1 min-w-0 text-text-secondary">
                {isToday ? 'Today' : dayName}&rsquo;s mood: <b className="text-text-primary">{moodLabel(checkin.mood)}</b>
              </p>
              <button type="button" onClick={open} aria-label={`Edit ${dayName}’s mood`} className="font-medium text-accent hover:underline">
                Edit
              </button>
            </>
          ) : (
            <>
              <Smile className="w-4 h-4 text-text-muted shrink-0" aria-hidden="true" />
              <p className="flex-1 basis-56 min-w-0 text-text-secondary">
                {isToday ? 'How’s today going?' : `How was ${dayName}?`} Log your mood any time, and change it later.
              </p>
              <button type="button" onClick={open} className="chip mood-tag">
                Log {dayName}&rsquo;s mood
              </button>
            </>
          )}
        </div>
      ) : checkin ? (
        <span className="chip mood-tag gap-1.5">
          {face}
          <span className="text-text-primary">{moodLabel(checkin.mood)}</span>
          <span aria-hidden="true" className="opacity-40">·</span>
          <button type="button" onClick={open} aria-label={`Edit mood for ${longName}`} className="font-medium text-accent hover:underline">
            Edit
          </button>
        </span>
      ) : (
        <button type="button" onClick={open} aria-label={`Log mood for ${longName}`} className="chip mood-tag">
          <Smile className="w-3.5 h-3.5" aria-hidden="true" />
          Log mood
        </button>
      ))}

      {modal && (
        <MoodCheckinModal
          date={parseLocalDate(modal.date)}
          existing={modal.existing}
          summary={modal.date === date ? summary : null}
          layer={modalLayer}
          onClose={() => setModal(null)}
          onSaved={(saved, previous) => {
            setModal(null);
            onSaved(saved, previous);
          }}
        />
      )}
    </>
  );
};

export default DayMoodCheckin;

/**
 * The Daily Brief's mood line: the check-in day's mood, logged or edited at
 * any time. A day called off past midnight keeps its check-in until the next
 * day starts, as the dashboard nudge does.
 */
export const BriefMoodLine: React.FC<{ profile: ProfileFields; tasks: Task[]; habits: Habit[]; className?: string }> = ({ profile, tasks, habits, className }) => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const date = toLocalDateStr(checkinDayAt(now, profile.dayStartTime, profile.shutoffTime, 'shutoff').day);
  return <DayMoodCheckin date={date} variant="brief" summary={daySummaryFrom(date, tasks, habits)} className={className} />;
};

/**
 * The check-in form for one day, opened from outside a view of that day (a
 * notification): loads the day's check-in first, so it opens as Edit when
 * one exists. Closes itself, with a toast, if it can't load.
 */
export const DayMoodCheckinModal: React.FC<{ date: string; summary?: DaySummary | null; onClose: () => void }> = ({ date, summary = null, onClose }) => {
  const { checkin, failed } = useDayMoodCheckin(date);
  const onSaved = useMoodCheckinSaved();
  const showToast = useToast();
  // Edits the check-in that was there when the form opened, not one saved underneath it.
  const [existing, setExisting] = useState<MoodCheckin | null | undefined>(undefined);
  if (existing === undefined && checkin !== undefined) setExisting(checkin);

  useEffect(() => {
    if (!failed) return;
    showToast("Couldn't open your check-in. Please try again.");
    onClose();
  }, [failed, showToast, onClose]);

  if (existing === undefined) return null;
  return (
    <MoodCheckinModal
      date={parseLocalDate(date)}
      existing={existing}
      summary={summary}
      onClose={onClose}
      onSaved={(saved, previous) => {
        onClose();
        onSaved(saved, previous);
      }}
    />
  );
};
