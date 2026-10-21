'use client';

import React, { useRef, useState } from 'react';
import { Activity, Info, Smile } from 'lucide-react';
import { CardShell } from '@/app/components/stats/CardShell';
import MoodCheckinModal, { type DaySummary } from '@/app/components/mood/MoodCheckinModal';
import { MoodFace, moodColor } from '@/app/components/mood/MoodFacePicker';
import { useHabitsContext } from '@/app/context/HabitsContext';
import { useToast } from '@/app/context/ToastContext';
import { deleteMoodCheckin, describeError, saveMoodCheckin } from '@/app/lib/backend-api';
import { checkinToSave, MOOD_LABELS, moodLabel, type MoodCheckin } from '@/app/types/mood';
import { formatDateRange, parseLocalDate, toLocalDateStr } from '@/app/utils/dateUtils';
import { describePeriod, type CalendarReport, type ReportPeriod } from '@/app/utils/calendarReport';
import { PATTERN_MIN_DAYS, summarizeMood, type MoodScope, type MoodSummary } from '@/app/utils/moodReport';
import ReportMoodChart from './ReportMoodChart';

/** How the Check-ins card and empty state name the days they cover. */
const scopeName = (period: ReportPeriod, scope: MoodScope): string => {
  if (scope.widened) {
    return toLocalDateStr(scope.end) === toLocalDateStr(new Date())
      ? 'in the last 4 weeks'
      : `in the 4 weeks to ${scope.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }
  const name = describePeriod(period);
  return name.startsWith('this ') || name.startsWith('last ') ? name : `in ${name}`;
};

const CheckinsCard: React.FC<{ summary: MoodSummary; scope: MoodScope; period: ReportPeriod }> = ({ summary, scope, period }) => {
  const average = summary.average ?? 3;
  const mood = Math.round(average);
  return (
    <CardShell icon={<Smile className="w-4 h-4" style={{ color: moodColor(mood) }} />} header="Check-ins">
      {scope.widened && (
        <span className="self-start inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium bg-warning-subtle text-warning">
          <Info className="w-3 h-3" aria-hidden="true" />
          Using 4 weeks — one week is too short
        </span>
      )}
      <div className="flex items-center gap-3">
        <span className="w-12 h-12 shrink-0" style={{ color: moodColor(mood) }}>
          <MoodFace mood={mood} filled className="w-full h-full" />
        </span>
        <div className="min-w-0">
          <p className="text-2xl font-bold leading-none text-text-primary">
            {moodLabel(mood)} <span className="text-base font-semibold text-text-muted">{average.toFixed(1)}</span>
          </p>
          <p className="text-xs text-text-secondary mt-1">
            average · {summary.logged} of {summary.days} {summary.days === 1 ? 'day' : 'days'} logged
            {scope.widened && <span className="text-text-muted"> · {formatDateRange(scope.start, scope.end)}</span>}
          </p>
        </div>
      </div>

      <div>
        <div className="flex h-2.5 rounded-full overflow-hidden gap-px" role="img" aria-label={`Mood on logged days: ${summary.distribution.map((c, i) => `${c} ${MOOD_LABELS[i]}`).join(', ')}`}>
          {summary.distribution.map((count, i) =>
            count > 0 ? <div key={i} style={{ flexGrow: count, backgroundColor: moodColor(i + 1) }} title={`${MOOD_LABELS[i]}: ${count}`} /> : null,
          )}
        </div>
        <div className="flex flex-wrap justify-between gap-x-2 mt-1.5" aria-hidden="true">
          {summary.distribution.map((count, i) => (
            <span key={i} className="text-[11px] text-text-muted">
              <b className="text-text-secondary">{count}</b> {MOOD_LABELS[i]}
            </span>
          ))}
        </div>
      </div>

      {summary.logged < PATTERN_MIN_DAYS && (
        <div className="mt-auto flex flex-col gap-1.5 rounded-lg p-3 bg-surface-raised">
          <p className="text-xs text-text-secondary">
            Patterns in your mood show up after about {PATTERN_MIN_DAYS} days with a check-in — {summary.logged} so far {scopeName(period, scope)}.
          </p>
          <span className="h-1.5 rounded-full overflow-hidden bg-surface" aria-hidden="true">
            <span className="block h-full rounded-full bg-accent" style={{ width: `${(summary.logged / PATTERN_MIN_DAYS) * 100}%` }} />
          </span>
        </div>
      )}
    </CardShell>
  );
};

interface ReportMoodSectionProps {
  period: ReportPeriod;
  report: CalendarReport;
  byDay: Map<string, MoodCheckin>;
  scope: MoodScope;
  /** Puts a saved check-in in place of its day's old one, or removes it (`saved` null). */
  replaceDay: (date: string, saved: MoodCheckin | null) => void;
  onSelectPeriod: (monthStart: Date) => void;
}

/**
 * The report's Mood section: "Mood over time" and the Check-ins summary, or
 * an empty card with "Log today". Any day dot opens its check-in to edit,
 * and a hollow one logs that day. A week's summary covers the trailing 4
 * weeks, with a note saying so.
 */
const ReportMoodSection: React.FC<ReportMoodSectionProps> = ({ period, report, byDay, scope, replaceDay, onSelectPeriod }) => {
  const showToast = useToast();
  const { habits } = useHabitsContext();
  const [modal, setModal] = useState<{ date: string; existing: MoodCheckin | null } | null>(null);
  const summary = summarizeMood(byDay, scope.start, scope.end);

  const todayStr = toLocalDateStr(new Date());
  const includesToday = todayStr >= toLocalDateStr(period.start) && todayStr <= toLocalDateStr(period.end);

  const daySummary = (date: string): DaySummary | null => {
    const bucket = period.kind === 'year' ? undefined : report.buckets.find(b => b.key === date);
    if (!bucket) return null;
    return {
      tasksDone: bucket.tasksCompleted,
      noteSeconds: bucket.noteSeconds,
      habitsDone: bucket.habitsCompleted,
      habitsTotal: Math.max(habits.length, bucket.habitsCompleted),
    };
  };

  // The newest row we saved, so an older "Saved" toast's Undo can tell it has since changed.
  const latestSaved = useRef<MoodCheckin | null>(null);
  const dismissSavedToast = useRef<(() => void) | null>(null);
  const setDay = (date: string, row: MoodCheckin | null) => {
    latestSaved.current = row;
    replaceDay(date, row);
  };

  const restore = async (row: MoodCheckin) => {
    try {
      setDay(row.period_start, await saveMoodCheckin(checkinToSave(row)));
    } catch (err) {
      showToast(describeError(err, "Couldn't undo. Please try again."));
    }
  };

  const handleSaved = (saved: MoodCheckin, previous: MoodCheckin | null) => {
    setModal(null);
    setDay(saved.period_start, saved);
    dismissSavedToast.current?.();
    dismissSavedToast.current = null;
    if (previous) {
      showToast('Check-in updated.', 'success', { label: 'Undo', onClick: () => restore(previous) });
      return;
    }
    dismissSavedToast.current = showToast(`Saved · ${moodLabel(saved.mood)}`, 'success', {
      label: 'Undo',
      onClick: () => {
        if (latestSaved.current !== saved) return;
        deleteMoodCheckin(saved.id)
          .then(() => setDay(saved.period_start, null))
          .catch(err => showToast(describeError(err, "Couldn't undo. Please try again.")));
      },
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mt-1">
        <h3 className="text-base sm:text-lg font-semibold text-text-primary">Mood</h3>
        <span className="text-xs text-text-muted">from your daily check-ins</span>
      </div>

      {summary.logged === 0 ? (
        <div className="card-glass p-8 flex flex-col items-center text-center gap-2">
          <span className="w-10 h-10 rounded-full flex items-center justify-center bg-surface-raised text-text-muted">
            <Smile className="w-5 h-5" aria-hidden="true" />
          </span>
          <h4 className="text-base font-semibold text-text-primary">No mood check-ins {scopeName(period, scope)}</h4>
          <p className="text-sm text-text-muted max-w-md">
            Log how your day felt when you call it a day, and your mood will show up here next to your tasks, notes and
            habits. Reminders are in Settings, under Mood check-ins.
          </p>
          {includesToday && (
            <button type="button" onClick={() => setModal({ date: todayStr, existing: byDay.get(todayStr) ?? null })} className="btn btn-primary py-1.5 px-3 mt-2">
              Log today
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
          <div className="lg:col-span-2 min-w-0">
            <CardShell icon={<Activity className="w-4 h-4" style={{ color: 'var(--tm-mood-4)' }} />} header="Mood over time">
              <ReportMoodChart
                period={period}
                buckets={report.buckets}
                byDay={byDay}
                onDay={(date, existing) => setModal({ date, existing })}
                onMonth={monthStart => onSelectPeriod(parseLocalDate(monthStart))}
              />
            </CardShell>
          </div>
          <CheckinsCard summary={summary} scope={scope} period={period} />
        </div>
      )}

      {modal && (
        <MoodCheckinModal
          date={parseLocalDate(modal.date)}
          existing={modal.existing}
          summary={daySummary(modal.date)}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
};

export default ReportMoodSection;
