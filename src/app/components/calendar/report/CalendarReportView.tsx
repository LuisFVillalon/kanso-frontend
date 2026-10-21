'use client';

import React, { useMemo, useState } from 'react';
import {
  CalendarRange,
  ChartColumn,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  FileText,
  Flame,
  Hourglass,
  Percent,
  Repeat,
  Smile,
  Star,
  Trophy,
} from 'lucide-react';
import { CardShell } from '@/app/components/stats/CardShell';
import { formatHours } from '@/app/components/stats/charts';
import { moodColor } from '@/app/components/mood/MoodFacePicker';
import { useAuth } from '@/app/context/AuthContext';
import { useCalendarReport } from '@/app/hooks/useCalendarReport';
import { useProfile } from '@/app/hooks/useProfile';
import { useReportMood } from '@/app/hooks/useReportMood';
import { moodLabel, type MoodCheckin } from '@/app/types/mood';
import { formatDurationShort, parseLocalDate } from '@/app/utils/dateUtils';
import {
  describePeriod,
  elapsedDays,
  formatPeriodLabel,
  isSamePeriod,
  periodContaining,
  shiftPeriod,
  type CalendarReport,
  type ReportPeriod,
  type ReportPeriodKind,
} from '@/app/utils/calendarReport';
import { indexDayCheckins, moodSummaryScope, summarizeMood, type MoodSummary } from '@/app/utils/moodReport';
import ReportActivityChart from './ReportActivityChart';
import ReportMoodSection from './ReportMoodSection';

const KINDS: { kind: ReportPeriodKind; label: string }[] = [
  { kind: 'week', label: 'Week' },
  { kind: 'month', label: 'Month' },
  { kind: 'year', label: 'Year' },
];

const iconClass = 'w-3.5 h-3.5 sm:w-4 sm:h-4';

// ── Stat tiles ──────────────────────────────────────────────────────────────

interface StatTileProps {
  icon: React.ReactNode;
  title: string;
  value: React.ReactNode;
  detail: string;
  color: string;
  bg: string;
}

const StatTile: React.FC<StatTileProps> = ({ icon, title, value, detail, color, bg }) => (
  <div className="p-3 rounded-lg border border-border-subtle flex flex-col gap-1 min-w-0" style={{ backgroundColor: bg }}>
    <span className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold" style={{ color }}>
      {icon}
      {title}
    </span>
    <span className="text-xl sm:text-2xl font-bold leading-none text-text-primary">{value}</span>
    <span className="text-[11px] sm:text-xs text-text-secondary">{detail}</span>
  </div>
);

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const plannedDetail = (report: CalendarReport): string =>
  report.tasksPlanned === 0 ? 'No tasks due' : `${report.plannedCompleted} of ${plural(report.tasksPlanned, 'task')} due`;

const MoodTile: React.FC<{ summary: MoodSummary | null; current: boolean }> = ({ summary, current }) => {
  const mood = summary?.average != null ? Math.round(summary.average) : null;
  const color = mood ? moodColor(mood) : 'var(--tm-text-muted)';
  return (
    <StatTile
      icon={<Smile className={iconClass} />}
      title="Mood"
      value={summary?.average != null ? (
        <>
          {moodLabel(mood!)} <span className="text-sm font-semibold text-text-muted">{summary.average.toFixed(1)}</span>
        </>
      ) : '—'}
      detail={!summary
        ? 'Couldn’t load check-ins'
        : summary.logged > 0
          ? `${summary.logged} of ${plural(summary.days, 'day')} logged`
          : current ? 'No check-ins yet' : 'No check-ins'}
      color={color}
      bg={`color-mix(in srgb, ${color} 10%, var(--tm-surface))`}
    />
  );
};

/** `mood` undefined hides the Mood tile ("Show mood in reports" is off); null means it failed to load. */
const StatTiles: React.FC<{ report: CalendarReport; mood?: MoodSummary | null; current: boolean }> = ({ report, mood, current }) => (
  <div className={`grid grid-cols-2 sm:grid-cols-3 ${mood === undefined ? 'lg:grid-cols-5' : 'lg:grid-cols-6'} gap-2 sm:gap-3`}>
    <StatTile
      icon={<CircleCheck className={iconClass} />}
      title="Completed"
      value={String(report.tasksCompleted)}
      detail={`${plural(report.tasksCompleted, 'task')} finished`}
      color="var(--tm-accent)"
      bg="var(--tm-accent-subtle)"
    />
    <StatTile
      icon={<Percent className={iconClass} />}
      title="Planned done"
      value={report.completionRate === null ? '—' : `${report.completionRate}%`}
      detail={plannedDetail(report)}
      color="var(--tm-success)"
      bg="var(--tm-success-subtle)"
    />
    <StatTile
      icon={<Hourglass className={iconClass} />}
      title="Est. hours"
      value={`${formatHours(report.completedEstimatedHours)}h`}
      detail={report.plannedEstimatedHours > 0 ? `done · ${formatHours(report.plannedEstimatedHours)}h planned` : 'in completed tasks'}
      color="var(--tm-warning)"
      bg="var(--tm-warning-subtle)"
    />
    <StatTile
      icon={<Clock className={iconClass} />}
      title="In notes"
      value={report.noteSeconds > 0 ? formatDurationShort(report.noteSeconds) : '0m'}
      detail={`across ${plural(report.notesWorkedOn, 'note')}`}
      color="var(--tm-accent-2)"
      bg="var(--tm-accent-2-subtle)"
    />
    <StatTile
      icon={<Repeat className={iconClass} />}
      title="Habits"
      value={String(report.habitCheckIns)}
      detail={plural(report.habitCheckIns, 'check-in')}
      color="var(--tm-success)"
      bg="var(--tm-surface-raised)"
    />
    {mood !== undefined && <MoodTile summary={mood} current={current} />}
  </div>
);

// ── Lists ───────────────────────────────────────────────────────────────────

const EmptyLine: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-xs sm:text-sm text-text-muted italic py-2">{children}</p>
);

const BusiestDays: React.FC<{ report: CalendarReport }> = ({ report }) => {
  if (report.busiestDays.length === 0) return <EmptyLine>No activity recorded yet.</EmptyLine>;
  return (
    <ol className="flex flex-col gap-2">
      {report.busiestDays.map((d, i) => {
        const parts = [
          d.tasksCompleted > 0 && plural(d.tasksCompleted, 'task'),
          d.habitsCompleted > 0 && plural(d.habitsCompleted, 'habit'),
          d.noteSeconds > 0 && `${formatDurationShort(d.noteSeconds)} notes`,
        ].filter(Boolean);
        return (
          <li key={d.dateStr} className="flex items-center gap-3 p-2 rounded-lg" style={{ backgroundColor: 'var(--tm-surface-raised)' }}>
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={i === 0 ? { backgroundColor: 'var(--tm-accent)', color: 'var(--tm-accent-text)' } : { backgroundColor: 'var(--tm-surface)', color: 'var(--tm-text-secondary)' }}
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex flex-col">
              <span className="text-sm font-semibold text-text-primary">
                {parseLocalDate(d.dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </span>
              <span className="text-xs text-text-secondary truncate">{parts.join(' · ')}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
};

const TopNotes: React.FC<{ report: CalendarReport }> = ({ report }) => {
  if (report.topNotes.length === 0) return <EmptyLine>No time spent in notes.</EmptyLine>;
  const max = report.topNotes[0].seconds;
  return (
    <ul className="flex flex-col gap-2">
      {report.topNotes.map(n => (
        <li key={n.noteId} className="flex items-center gap-2">
          <span className="text-xs sm:text-sm text-text-secondary truncate flex-shrink-0 w-28 sm:w-36" title={n.title || 'Untitled Note'}>
            {n.title || 'Untitled Note'}
          </span>
          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--tm-surface-raised)' }} aria-hidden="true">
            <div className="h-full rounded-full" style={{ width: `${Math.max((n.seconds / max) * 100, 6)}%`, backgroundColor: 'var(--tm-accent-2)' }} />
          </div>
          <span className="text-xs sm:text-sm font-semibold text-text-primary whitespace-nowrap w-14 text-right">{formatDurationShort(n.seconds)}</span>
        </li>
      ))}
    </ul>
  );
};

const StreakBadge: React.FC<{ icon: React.ReactNode; value: number; color: string; label: string }> = ({ icon, value, color, label }) => (
  <span
    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full flex-shrink-0"
    style={{ backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
    title={label}
  >
    {icon}
    <span className="text-xs font-semibold leading-none">
      <span className="sr-only">{label}: </span>
      {value}
    </span>
  </span>
);

const HabitList: React.FC<{ report: CalendarReport; days: number }> = ({ report, days }) => {
  if (report.habits.length === 0) return <EmptyLine>No habits yet.</EmptyLine>;
  return (
    <ul className="flex flex-col gap-2">
      {report.habits.map(h => (
        <li key={h.habitId} className="flex items-center gap-2">
          <span className="text-xs sm:text-sm text-text-secondary truncate flex-1 min-w-0" title={h.title}>{h.title}</span>
          <span className="text-xs sm:text-sm text-text-primary whitespace-nowrap">
            <span className="font-semibold">{h.completions}</span>
            {days > 0 && <span className="text-text-muted"> / {days} days</span>}
          </span>
          {h.currentStreak !== null && (
            <StreakBadge icon={<Flame className="w-3 h-3" aria-hidden="true" />} value={h.currentStreak} color="#F97316" label="Current streak" />
          )}
          {h.bestStreak !== null && (
            <StreakBadge icon={<Star className="w-3 h-3" aria-hidden="true" />} value={h.bestStreak} color="#EAB308" label="Best streak" />
          )}
        </li>
      ))}
    </ul>
  );
};

// ── Report body ─────────────────────────────────────────────────────────────

const isEmpty = (r: CalendarReport) =>
  r.tasksPlanned === 0 && r.tasksCompleted === 0 && r.noteSeconds === 0 && r.habitCheckIns === 0;

interface ReportMood {
  /** Null when they failed to load. */
  checkins: MoodCheckin[] | null;
  error: string | null;
  retry: () => void;
  replaceDay: (date: string, saved: MoodCheckin | null) => void;
}

interface ReportBodyProps {
  period: ReportPeriod;
  report: CalendarReport;
  /** Null when "Show mood in reports" is off. */
  mood: ReportMood | null;
  onSelectPeriod: (period: ReportPeriod) => void;
}

const ReportBody: React.FC<ReportBodyProps> = ({ period, report, mood, onSelectPeriod }) => {
  const days = elapsedDays(period);
  const checkins = mood?.checkins;
  const byDay = useMemo(() => indexDayCheckins(checkins ?? []), [checkins]);
  const periodMood = checkins ? summarizeMood(byDay, period.start, period.end) : null;
  const current = isSamePeriod(period, periodContaining(period.kind, new Date()));

  if (isEmpty(report) && !periodMood?.logged) {
    return (
      <div className="card-glass p-8 flex flex-col items-center text-center gap-2">
        <CalendarRange className="w-8 h-8 text-text-muted" aria-hidden="true" />
        <h3 className="text-base font-semibold text-text-primary">
          {days === 0 ? 'This period hasn’t started yet' : `Nothing recorded for ${describePeriod(period)}`}
        </h3>
        <p className="text-sm text-text-muted max-w-sm">
          Tasks you plan and complete, time in notes and habit check-ins will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <StatTiles report={report} mood={mood ? periodMood : undefined} current={current} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        <div className="lg:col-span-2">
          <CardShell icon={<ChartColumn className="w-4 h-4" style={{ color: 'var(--tm-accent)' }} />} header={period.kind === 'year' ? 'Activity by month' : 'Activity by day'}>
            <ReportActivityChart buckets={report.buckets} kind={period.kind} />
          </CardShell>
        </div>
        <CardShell icon={<Trophy className="w-4 h-4" style={{ color: 'var(--tm-warning)' }} />} header="Busiest days">
          <BusiestDays report={report} />
          {report.activeDays > 0 && (
            <p className="text-[11px] text-text-muted mt-auto">Active on {plural(report.activeDays, 'day')}{days > 0 ? ` of ${days}` : ''}</p>
          )}
        </CardShell>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        <CardShell icon={<FileText className="w-4 h-4" style={{ color: 'var(--tm-accent-2)' }} />} header="Top notes by time">
          <TopNotes report={report} />
        </CardShell>
        <CardShell icon={<Flame className="w-4 h-4" style={{ color: '#F97316' }} />} header="Habits">
          <HabitList report={report} days={days} />
        </CardShell>
      </div>

      {mood && (mood.error ? (
        <div className="card-glass p-4 flex flex-wrap items-center gap-3" role="alert">
          <p className="text-sm text-text-primary flex-1 min-w-0">{mood.error}</p>
          <button type="button" onClick={mood.retry} className="btn btn-secondary py-1.5 px-3">Try again</button>
        </div>
      ) : (
        <ReportMoodSection
          period={period}
          report={report}
          byDay={byDay}
          scope={moodSummaryScope(period)}
          replaceDay={mood.replaceDay}
          onSelectPeriod={monthStart => onSelectPeriod(periodContaining('month', monthStart))}
        />
      ))}
    </div>
  );
};

const ReportSkeleton: React.FC<{ tiles: number }> = ({ tiles }) => (
  <div className="flex flex-col gap-3 sm:gap-4" aria-hidden="true">
    <div className={`grid grid-cols-2 sm:grid-cols-3 ${tiles === 6 ? 'lg:grid-cols-6' : 'lg:grid-cols-5'} gap-2 sm:gap-3`}>
      {Array.from({ length: tiles }, (_, i) => (
        <div key={i} className="h-24 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--tm-surface-raised)' }} />
      ))}
    </div>
    <div className="h-64 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--tm-surface-raised)' }} />
  </div>
);

// ── View ────────────────────────────────────────────────────────────────────

/**
 * Weekly / monthly / yearly report on the calendar page: tasks completed vs
 * planned, estimated hours, time in notes, habit check-ins and streaks, the
 * busiest days and an activity chart — plus mood from the daily check-ins,
 * unless "Show mood in reports" is off.
 */
const CalendarReportView: React.FC = () => {
  const [period, setPeriod] = useState<ReportPeriod>(() => periodContaining('week', new Date()));
  const { report, loading, error, retry } = useCalendarReport(period);
  const { user } = useAuth();
  const { profile, loaded: profileLoaded } = useProfile(user);
  // Until the profile loads we don't know whether mood is hidden, so it's fetched meanwhile.
  const moodHidden = profileLoaded && !profile.moodCheckins.show_in_reports;
  const mood = useReportMood(period, !moodHidden);

  const current = periodContaining(period.kind, new Date());
  const isCurrent = isSamePeriod(period, current);
  const label = formatPeriodLabel(period);

  return (
    <section className="flex flex-col gap-3 sm:gap-4" aria-labelledby="calendar-report-heading">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-surface border border-border" role="group" aria-label="Report period">
          {KINDS.map(({ kind, label: kindLabel }) => (
            <button
              key={kind}
              type="button"
              onClick={() => setPeriod(periodContaining(kind, new Date()))}
              aria-pressed={period.kind === kind}
              className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                period.kind === kind ? 'bg-surface-raised text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {kindLabel}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 min-w-0">
          <button
            type="button"
            onClick={() => setPeriod(p => shiftPeriod(p, -1))}
            aria-label={`Previous ${period.kind}`}
            className="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 id="calendar-report-heading" className="text-base sm:text-lg font-semibold text-text-primary text-center min-w-0" aria-live="polite">
            {label}
          </h2>
          <button
            type="button"
            onClick={() => setPeriod(p => shiftPeriod(p, 1))}
            disabled={isCurrent}
            aria-label={`Next ${period.kind}`}
            className="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {!isCurrent && (
          <button
            type="button"
            onClick={() => setPeriod(current)}
            className="px-2.5 py-1.5 rounded-md text-xs sm:text-sm font-medium border border-border text-text-secondary hover:text-text-primary transition-colors"
          >
            This {period.kind}
          </button>
        )}
      </div>

      {error ? (
        <div className="card-glass p-6 flex flex-col items-center text-center gap-3" role="alert">
          <p className="text-sm text-text-primary">{error}</p>
          <button
            type="button"
            onClick={retry}
            className="px-3 py-1.5 rounded-md text-sm font-medium"
            style={{ backgroundColor: 'var(--tm-accent)', color: 'var(--tm-accent-text)' }}
          >
            Try again
          </button>
        </div>
      ) : loading || !report || !profileLoaded || mood.loading ? (
        <>
          <span className="sr-only" role="status">Loading report…</span>
          <ReportSkeleton tiles={moodHidden ? 5 : 6} />
        </>
      ) : (
        <ReportBody
          period={period}
          report={report}
          mood={moodHidden ? null : mood}
          onSelectPeriod={setPeriod}
        />
      )}

      <p className="text-[11px] sm:text-xs text-text-muted">
        Completions count by the day a task was checked off; tasks completed before completion times were recorded aren’t counted. Habit streaks are as of today.
        {!moodHidden && ' Mood comes from your daily check-ins; days without one are left out of every mood number, never counted as neutral.'}
      </p>
    </section>
  );
};

export default CalendarReportView;
