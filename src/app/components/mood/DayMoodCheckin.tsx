'use client';

import React, { useEffect, useState } from 'react';
import { Moon, Smile } from 'lucide-react';
import type { ModalLayer } from '@/app/components/common/Modal';
import MoodCheckinModal, { type DaySummary } from '@/app/components/mood/MoodCheckinModal';
import { MoodFace, moodColor } from '@/app/components/mood/MoodFacePicker';
import { useToast } from '@/app/context/ToastContext';
import { useDailyMood } from '@/app/hooks/useDailyMood';
import { useDayMoodCheckin, useMoodCheckinSaved } from '@/app/hooks/useDayMoodCheckin';
import type { Habit } from '@/app/types/habit';
import { moodLabel, type MoodCheckin } from '@/app/types/mood';
import type { Task } from '@/app/types/task';
import { parseLocalDate, toLocalDateStr } from '@/app/utils/dateUtils';
import { checkinDayAt, dayCalledOffAt } from '@/app/utils/moodCheckinDay';
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
   * - `brief`: the Daily Brief's chip in Today's Activity Log, named for
   *   the check-in day ("Log today's mood").
   * - `chip`: the calendar day panel's chip, named for the full date.
   *
   * Both show "Log mood", or the day's mood with Edit.
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
      {checkin !== undefined && (checkin ? (
        <span className={`chip mood-tag gap-1.5 ${className}`}>
          {face}
          {variant === 'brief' && <span className="sr-only">{isToday ? 'Today' : dayName}&rsquo;s mood: </span>}
          <span className="text-text-primary">{moodLabel(checkin.mood)}</span>
          <span aria-hidden="true" className="opacity-40">·</span>
          <button type="button" onClick={open} aria-label={variant === 'brief' ? `Edit ${dayName}’s mood` : `Edit mood for ${longName}`} className="font-medium text-accent hover:underline">
            Edit
          </button>
        </span>
      ) : (
        <button type="button" onClick={open} aria-label={variant === 'brief' ? `Log ${dayName}’s mood` : `Log mood for ${longName}`} className={`chip mood-tag ${className}`}>
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

/** The current time, ticking each minute. */
function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * The Daily Brief's mood chip: the check-in day's mood, logged or edited at
 * any time. A day called off past midnight keeps its check-in until the next
 * day starts.
 */
export const BriefMoodLine: React.FC<{ profile: ProfileFields; tasks: Task[]; habits: Habit[]; className?: string }> = ({ profile, tasks, habits, className }) => {
  const now = useMinuteClock();
  const date = toLocalDateStr(checkinDayAt(now, profile.dayStartTime, profile.shutoffTime));
  return <DayMoodCheckin date={date} variant="brief" summary={daySummaryFrom(date, tasks, habits)} className={className} />;
};

/**
 * The dashboard's reminder above the Daily Brief: once the check-in day is
 * called off (past Call it a day) and its mood isn't logged, a calm line with
 * a way to log it. Gone as soon as it's logged, and never before the day is
 * called off or while the mood check-in reminder (daily check-ins) is off.
 */
export const DayClosedMoodReminder: React.FC<{ profile: ProfileFields; profileLoaded: boolean; tasks: Task[]; habits: Habit[] }> = ({ profile, profileLoaded, tasks, habits }) => {
  const now = useMinuteClock();
  const dailyMood = useDailyMood();
  const closed = profileLoaded && dailyMood && dayCalledOffAt(now, profile.dayStartTime, profile.shutoffTime);
  const date = closed ? toLocalDateStr(checkinDayAt(now, profile.dayStartTime, profile.shutoffTime)) : null;
  const { checkin } = useDayMoodCheckin(date);
  const onSaved = useMoodCheckinSaved();
  // The form stays on the day it was opened for, even if the clock rolls past it.
  const [modalDate, setModalDate] = useState<string | null>(null);

  const dayName = date === toLocalDateStr(now) ? 'today' : date && parseLocalDate(date).toLocaleDateString('en-US', { weekday: 'long' });

  return (
    <>
      {date && checkin === null && (
        <div role="status" className="card-glass mb-4 sm:mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
          <Moon className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--tm-accent)' }} aria-hidden="true" />
          <p className="flex-1 min-w-[180px] text-sm text-text-primary">
            You&rsquo;ve called it a day.{' '}
            <span className="text-text-secondary">How did {dayName} feel?</span>
          </p>
          <button type="button" onClick={() => setModalDate(date)} aria-label={`Log ${dayName}’s mood now`} className="btn btn-primary text-xs px-2.5 py-1 gap-1.5">
            <Smile className="w-3.5 h-3.5" aria-hidden="true" />
            Log mood
          </button>
        </div>
      )}

      {modalDate && (
        <MoodCheckinModal
          date={parseLocalDate(modalDate)}
          existing={null}
          summary={daySummaryFrom(modalDate, tasks, habits)}
          onClose={() => setModalDate(null)}
          onSaved={(saved, previous) => {
            setModalDate(null);
            onSaved(saved, previous);
          }}
        />
      )}
    </>
  );
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
