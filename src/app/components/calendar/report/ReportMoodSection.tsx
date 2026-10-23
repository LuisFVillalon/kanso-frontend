'use client';

import React, { useRef, useState } from 'react';
import { Activity, ChartScatter, Smile } from 'lucide-react';
import { CardShell } from '@/app/components/stats/CardShell';
import MoodCheckinModal, { type DaySummary, type PeriodSummary } from '@/app/components/mood/MoodCheckinModal';
import { MoodFace, moodColor } from '@/app/components/mood/MoodFacePicker';
import { useHabitsContext } from '@/app/context/HabitsContext';
import { useToast } from '@/app/context/ToastContext';
import { deleteMoodCheckin, describeError, saveMoodCheckin } from '@/app/lib/backend-api';
import type { CalendarActivity } from '@/app/types/activity';
import { checkinToSave, MOOD_LABELS, moodLabel, type MoodCheckin, type MoodCheckinSettings, type MoodPeriodKind } from '@/app/types/mood';
import { parseLocalDate, toLocalDateStr } from '@/app/utils/dateUtils';
import { describePeriod, periodContaining, periodLength, type CalendarReport, type ReportPeriod } from '@/app/utils/calendarReport';
import {
  hasMoodCheckins,
  indexMonthCheckins,
  PATTERN_MIN_DAYS,
  summarizeMood,
  weekCheckinsIn,
  type MoodSummary,
} from '@/app/utils/moodReport';
import ReportMoodChart from './ReportMoodChart';
import ReportMoodRelations from './ReportMoodRelations';
import ReportPeriodCheckins from './ReportPeriodCheckins';

/** How the Check-ins card and empty state name the days they cover. */
const scopeName = (period: ReportPeriod): string => {
  const name = describePeriod(period);
  return name.startsWith('this ') || name.startsWith('last ') ? name : `in ${name}`;
};

const CheckinsCard: React.FC<{ summary: MoodSummary; period: ReportPeriod; children?: React.ReactNode }> = ({ summary, period, children }) => {
  const average = summary.average ?? 3;
  const mood = Math.round(average);
  return (
    <CardShell icon={<Smile className="w-4 h-4" style={{ color: moodColor(mood) }} />} header="Check-ins">
      {summary.logged === 0 ? (
        <p className="text-xs text-text-secondary">No daily check-ins {scopeName(period)}.</p>
      ) : (
        <>
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
        </>
      )}

      {children}

      {period.kind !== 'week' && summary.logged < PATTERN_MIN_DAYS && (
        <div className="mt-auto flex flex-col gap-1.5 rounded-lg p-3 bg-surface-raised">
          <p className="text-xs text-text-secondary">
            Patterns in your mood show up after about {PATTERN_MIN_DAYS} days with a check-in — {summary.logged} so far {scopeName(period)}.
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
  /** The report's calendar activity, which "Mood & your activity" compares mood against. */
  activity: CalendarActivity;
  byDay: Map<string, MoodCheckin>;
  /** Every loaded check-in, for the weekly and monthly ones. */
  checkins: MoodCheckin[];
  settings: MoodCheckinSettings;
  /** Puts a saved check-in in place of its period's old one, or removes it (`saved` null). */
  replaceDay: (date: string, saved: MoodCheckin | null, kind?: MoodPeriodKind) => void;
  onSelectPeriod: (monthStart: Date) => void;
}

/**
 * The report's Mood section: "Mood over time" and the Check-ins summary,
 * then "Mood & your activity" and "Tags & mood", or an empty card with
 * "Log today". Any day dot opens its check-in to edit, and a hollow one logs
 * that day; weekly and monthly check-ins open from their spans and the
 * Check-ins list. A week is too short for mood patterns, so in their place
 * it points to its Month report.
 */
const ReportMoodSection: React.FC<ReportMoodSectionProps> = ({ period, report, activity, byDay, checkins, settings, replaceDay, onSelectPeriod }) => {
  const showToast = useToast();
  const { habits } = useHabitsContext();
  const [modal, setModal] = useState<{ kind: MoodPeriodKind; date: string; existing: MoodCheckin | null } | null>(null);
  const summary = summarizeMood(byDay, period.start, period.end);
  const weeks = weekCheckinsIn(checkins, period.start, period.end);
  const months = indexMonthCheckins(checkins);

  const todayStr = toLocalDateStr(new Date());
  const includesToday = todayStr >= toLocalDateStr(period.start) && todayStr <= toLocalDateStr(period.end);
  // The week's Month report: the month holding today while it's the current week, else its last day's.
  const weekMonth = includesToday ? parseLocalDate(todayStr) : period.end;

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

  const periodSummary = (kind: 'week' | 'month', date: string): PeriodSummary => {
    const target = periodContaining(kind, parseLocalDate(date));
    const { average, logged, days } = summarizeMood(byDay, target.start, target.end);
    // Tasks only when the report has the whole week or month: all its days, or the year's month.
    const startStr = toLocalDateStr(target.start);
    const endStr = toLocalDateStr(target.end);
    const inside = period.kind === 'year'
      ? report.buckets.filter(b => b.key === startStr.slice(0, 7))
      : report.buckets.filter(b => b.key >= startStr && b.key <= endStr);
    const covered = inside.length === (period.kind === 'year' ? 1 : periodLength(target));
    return { average, logged, days, tasksDone: covered ? inside.reduce((n, b) => n + b.tasksCompleted, 0) : null };
  };

  // The newest row we saved, so an older "Saved" toast's Undo can tell it has since changed.
  const latestSaved = useRef<MoodCheckin | null>(null);
  const dismissSavedToast = useRef<(() => void) | null>(null);
  const setDay = (date: string, row: MoodCheckin | null, kind: MoodPeriodKind = 'day') => {
    latestSaved.current = row;
    replaceDay(date, row, kind);
  };

  const restore = async (row: MoodCheckin) => {
    try {
      setDay(row.period_start, await saveMoodCheckin(checkinToSave(row)), row.period_kind);
    } catch (err) {
      showToast(describeError(err, "Couldn't undo. Please try again."));
    }
  };

  const handleSaved = (saved: MoodCheckin, previous: MoodCheckin | null) => {
    setModal(null);
    setDay(saved.period_start, saved, saved.period_kind);
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
          .then(() => setDay(saved.period_start, null, saved.period_kind))
          .catch(err => showToast(describeError(err, "Couldn't undo. Please try again.")));
      },
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mt-1">
        <h3 className="text-base sm:text-lg font-semibold text-text-primary">Mood</h3>
        <span className="text-xs text-text-muted">from your check-ins</span>
      </div>

      {!hasMoodCheckins(period, byDay, checkins) ? (
        <div className="card-glass p-8 flex flex-col items-center text-center gap-2">
          <span className="w-10 h-10 rounded-full flex items-center justify-center bg-surface-raised text-text-muted">
            <Smile className="w-5 h-5" aria-hidden="true" />
          </span>
          <h4 className="text-base font-semibold text-text-primary">No mood check-ins {scopeName(period)}</h4>
          <p className="text-sm text-text-muted max-w-md">
            Log how your day felt when you call it a day, and your mood will show up here next to your tasks, notes and
            habits. Reminders are in Settings, under Mood check-ins.
          </p>
          {includesToday && (
            <button type="button" onClick={() => setModal({ kind: 'day', date: todayStr, existing: byDay.get(todayStr) ?? null })} className="btn btn-primary py-1.5 px-3 mt-2">
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
                weeks={weeks}
                months={months}
                onDay={(date, existing) => setModal({ kind: 'day', date, existing })}
                onWeek={week => setModal({ kind: 'week', date: week.period_start, existing: week })}
                onMonth={monthStart => onSelectPeriod(parseLocalDate(monthStart))}
              />
            </CardShell>
          </div>
          <CheckinsCard summary={summary} period={period}>
            <ReportPeriodCheckins
              period={period}
              weeks={weeks}
              months={months}
              settings={settings}
              onOpen={(kind, date, existing) => setModal({ kind, date, existing })}
            />
          </CheckinsCard>
        </div>
      )}

      {summary.average != null && period.kind === 'week' && (
        <div className="card-glass p-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <ChartScatter className="w-4 h-4 shrink-0" style={{ color: 'var(--tm-accent)' }} aria-hidden="true" />
          <p className="text-sm text-text-secondary">
            A week is too short to show patterns in your mood — they appear in the Month and Year reports.
          </p>
          <button type="button" onClick={() => onSelectPeriod(weekMonth)} className="btn btn-secondary py-1 px-3 text-xs sm:ml-auto">
            See {weekMonth.toLocaleDateString('en-US', { month: 'long' })}
          </button>
        </div>
      )}

      {summary.average != null && period.kind !== 'week' && (
        <ReportMoodRelations
          activity={activity}
          byDay={byDay}
          period={period}
          scopeLabel={scopeName(period)}
          average={summary.average}
          byWeek={period.kind === 'year'}
        />
      )}

      {modal && (
        <MoodCheckinModal
          kind={modal.kind}
          date={parseLocalDate(modal.date)}
          existing={modal.existing}
          summary={modal.kind === 'day' ? daySummary(modal.date) : null}
          periodSummary={modal.kind === 'day' ? null : periodSummary(modal.kind, modal.date)}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
};

export default ReportMoodSection;
