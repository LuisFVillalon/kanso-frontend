'use client';

import React, { useRef, useState } from 'react';
import { Activity, Smile } from 'lucide-react';
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
import ReportTagsCard from './ReportTagsCard';

/** Which part of the Mood tab shows: the chart and check-ins, or how mood moved with activity and tags. */
export type MoodView = 'time' | 'patterns';

/** How the Check-ins card and empty state name the days they cover. */
export const scopeName = (period: ReportPeriod): string => {
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
                <span key={i} className="inline-flex items-center gap-1 text-[11px] text-text-muted">
                  <span className="w-3.5 h-3.5 shrink-0" style={{ color: moodColor(i + 1) }}>
                    <MoodFace mood={i + 1} filled className="w-full h-full" />
                  </span>
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
  /** Opens the Year report holding `date`. */
  onSelectYear: (date: Date) => void;
  /** The profile's rest days, which the Tags & moments card compares apart from work days. */
  restDays: number[];
  view: MoodView;
  /** Opens Mood › Patterns, from "About this chart". */
  onSeePatterns: () => void;
}

/**
 * The report's Mood tab: "Over time" shows "Mood over time" and the
 * Check-ins summary, "Patterns" shows "Mood & your activity" beside one
 * "Tags & moments" card that switches between "Your task & note tags" and
 * "Moments"; with no check-ins it's an empty card with "Log today" and, while
 * weekly or monthly check-ins are on, the period's weeks or months to log.
 * Any day dot opens its check-in to edit, and a hollow one logs that day;
 * weekly and monthly check-ins open from their spans, ◇ and the Check-ins
 * list, which also logs a past week or month without one. A week is too
 * short for mood patterns, so its Patterns show the Tags & moments card alone, hatched,
 * pointing to its Month report.
 */
const ReportMoodSection: React.FC<ReportMoodSectionProps> = ({ period, report, activity, byDay, checkins, settings, replaceDay, onSelectPeriod, onSelectYear, restDays, view, onSeePatterns }) => {
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
          {(period.kind === 'year' ? settings.monthly : settings.weekly) && (
            <div className="w-full max-w-md mt-4 text-left">
              <ReportPeriodCheckins
                period={period}
                weeks={weeks}
                months={months}
                settings={settings}
                onOpen={(kind, date, existing) => setModal({ kind, date, existing })}
              />
            </div>
          )}
        </div>
      ) : (
        view === 'time' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
            <div className="lg:col-span-2 min-w-0">
              <CardShell icon={<Activity className="w-4 h-4" style={{ color: moodColor(4) }} />} header="Mood over time">
                <ReportMoodChart
                  period={period}
                  buckets={report.buckets}
                  byDay={byDay}
                  weeks={weeks}
                  months={months}
                  onDay={(date, existing) => setModal({ kind: 'day', date, existing })}
                  onWeek={week => setModal({ kind: 'week', date: week.period_start, existing: week })}
                  onMonth={monthStart => onSelectPeriod(parseLocalDate(monthStart))}
                  onMonthCheckin={month => setModal({ kind: 'month', date: month.period_start, existing: month })}
                  onSeePatterns={onSeePatterns}
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
        ) : period.kind === 'week' ? (
          <ReportTagsCard
            activity={activity}
            byDay={byDay}
            period={period}
            scopeLabel={scopeName(period)}
            restDays={restDays}
            average={summary.average}
            logged={summary.logged}
            widen={{ label: `See ${weekMonth.toLocaleDateString('en-US', { month: 'long' })}`, onClick: () => onSelectPeriod(weekMonth) }}
            wide
          />
        ) : summary.average != null ? (
          <ReportMoodRelations
            activity={activity}
            byDay={byDay}
            period={period}
            scopeLabel={scopeName(period)}
            byWeek={period.kind === 'year'}
            renderTags={headerAction => (
              <ReportTagsCard
                activity={activity}
                byDay={byDay}
                period={period}
                scopeLabel={scopeName(period)}
                restDays={restDays}
                average={summary.average}
                logged={summary.logged}
                widen={period.kind === 'month' ? { label: `See ${period.start.getFullYear()}`, onClick: () => onSelectYear(period.start) } : undefined}
                wide={false}
                headerAction={headerAction}
              />
            )}
          />
        ) : (
          <div className="card-glass p-6 text-center text-sm text-text-muted">
            Mood & your activity, Moments & mood and Your task & note tags use your daily check-ins — there are none {scopeName(period)}.
          </div>
        )
      )}

      {modal && (
        <MoodCheckinModal
          // A fresh form per period, so one never opens with another's answers.
          key={`${modal.kind}:${modal.date}`}
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
