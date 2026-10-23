'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
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
  LayoutDashboard,
  Percent,
  Repeat,
  Smile,
  Star,
  Tag,
  Target,
  Trophy,
} from 'lucide-react';
import SegmentedTabs, { segmentedTabId, type SegmentedTab } from '@/app/components/common/SegmentedTabs';
import { CardShell } from '@/app/components/stats/CardShell';
import { formatHours } from '@/app/components/stats/charts';
import { moodColor } from '@/app/components/mood/MoodFacePicker';
import { useAppShell } from '@/app/context/AppShellContext';
import { useCalendarReport } from '@/app/hooks/useCalendarReport';
import { useReportMood } from '@/app/hooks/useReportMood';
import type { CalendarActivity } from '@/app/types/activity';
import { moodLabel, type MoodCheckin, type MoodCheckinSettings, type MoodPeriodKind } from '@/app/types/mood';
import { formatDurationShort, parseLocalDate } from '@/app/utils/dateUtils';
import {
  describePeriod,
  elapsedDays,
  formatPeriodLabel,
  isSamePeriod,
  periodContaining,
  shiftPeriod,
  type CalendarReport,
  type ReportBucket,
  type ReportPeriod,
  type ReportPeriodKind,
} from '@/app/utils/calendarReport';
import { hasMoodCheckins, indexDayCheckins, summarizeMood, type MoodSummary } from '@/app/utils/moodReport';
import ReportActivityChart, { MetricButton } from './ReportActivityChart';
import ReportHighlights from './ReportHighlights';
import ReportMoodSection, { scopeName, type MoodView } from './ReportMoodSection';
import ReportTagBreakdown, { ReportTagShareBar } from './ReportTagBreakdown';

const KINDS: { kind: ReportPeriodKind; label: string }[] = [
  { kind: 'week', label: 'Week' },
  { kind: 'month', label: 'Month' },
  { kind: 'year', label: 'Year' },
];

const iconClass = 'w-3.5 h-3.5 sm:w-4 sm:h-4';

/** The report's tabs; the open one is the URL's `view` (none for Overview). */
export type ReportView = 'overview' | 'tasks' | 'notes' | 'habits' | 'mood' | 'time';

const VIEWS: readonly SegmentedTab<ReportView>[] = [
  { value: 'overview', label: 'Overview', icon: LayoutDashboard },
  { value: 'tasks', label: 'Tasks', icon: CircleCheck },
  { value: 'notes', label: 'Notes', icon: FileText },
  { value: 'habits', label: 'Habits', icon: Flame },
  { value: 'mood', label: 'Mood', icon: Smile },
  { value: 'time', label: 'Time', icon: Tag },
];

const VIEWS_ID = 'report-views';
const VIEW_PANEL_ID = 'report-views-tabpanel';

const parseView = (value: string | null): ReportView => VIEWS.find(v => v.value === value)?.value ?? 'overview';
const parseMoodView = (value: string | null): MoodView => (value === 'patterns' ? 'patterns' : 'time');

// ── Stat tiles ──────────────────────────────────────────────────────────────

interface StatTileProps {
  icon: React.ReactNode;
  title: string;
  value: React.ReactNode;
  detail: string;
  color: string;
  bg: string;
  /** Makes the tile a button, e.g. to open its tab. */
  onClick?: () => void;
}

const StatTile: React.FC<StatTileProps> = ({ icon, title, value, detail, color, bg, onClick }) => {
  const body = (
    <>
      <span className="flex items-center gap-1 sm:gap-1.5 text-[11px] sm:text-sm font-semibold whitespace-nowrap overflow-hidden" style={{ color }}>
        {icon}
        {title}
      </span>
      <span className="text-lg sm:text-2xl font-bold leading-none text-text-primary whitespace-nowrap">{value}</span>
      {/* Three tiles share a phone's width, so their details wait for the tabs. */}
      <span className="hidden sm:block text-xs text-text-secondary">{detail}</span>
    </>
  );
  const className = 'p-2 sm:p-3 rounded-lg border border-border-subtle flex flex-col gap-1 min-w-0 text-left';
  if (!onClick) return <div className={className} style={{ backgroundColor: bg }}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${className} hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tm-accent)]`}
      style={{ backgroundColor: bg }}
    >
      {body}
    </button>
  );
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const plannedDetail = (report: CalendarReport): string =>
  report.tasksPlanned === 0 ? 'No tasks due' : `${report.plannedCompleted} of ${plural(report.tasksPlanned, 'task')} due`;

const MoodTile: React.FC<{ summary: MoodSummary | null; current: boolean; onClick?: () => void }> = ({ summary, current, onClick }) => {
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
      onClick={onClick}
    />
  );
};

interface StatTilesProps {
  report: CalendarReport;
  /** Null when it failed to load. */
  mood: MoodSummary | null;
  current: boolean;
  /** Opens the tab a tile summarizes. */
  onOpen: (view: ReportView) => void;
}

const StatTiles: React.FC<StatTilesProps> = ({ report, mood, current, onOpen }) => (
  <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
    <StatTile
      icon={<CircleCheck className={iconClass} />}
      title="Completed"
      onClick={() => onOpen('tasks')}
      value={String(report.tasksCompleted)}
      detail={`${plural(report.tasksCompleted, 'task')} finished`}
      color="var(--tm-accent)"
      bg="var(--tm-accent-subtle)"
    />
    <StatTile
      icon={<Percent className={iconClass} />}
      title="Planned done"
      onClick={() => onOpen('tasks')}
      value={report.completionRate === null ? '—' : `${report.completionRate}%`}
      detail={plannedDetail(report)}
      color="var(--tm-success)"
      bg="var(--tm-success-subtle)"
    />
    <StatTile
      icon={<Hourglass className={iconClass} />}
      title="Est. hours"
      onClick={() => onOpen('tasks')}
      value={`${formatHours(report.completedEstimatedHours)}h`}
      detail={report.plannedEstimatedHours > 0 ? `done · ${formatHours(report.plannedEstimatedHours)}h planned` : 'in completed tasks'}
      color="var(--tm-warning)"
      bg="var(--tm-warning-subtle)"
    />
    <StatTile
      icon={<Clock className={iconClass} />}
      title="In notes"
      onClick={() => onOpen('notes')}
      value={report.noteSeconds > 0 ? formatDurationShort(report.noteSeconds) : '0m'}
      detail={`across ${plural(report.notesWorkedOn, 'note')}`}
      color="var(--tm-accent-2)"
      bg="var(--tm-accent-2-subtle)"
    />
    <StatTile
      icon={<Repeat className={iconClass} />}
      title="Habits"
      onClick={() => onOpen('habits')}
      value={String(report.habitCheckIns)}
      detail={plural(report.habitCheckIns, 'check-in')}
      color="var(--tm-success)"
      bg="var(--tm-surface-raised)"
    />
    {mood !== undefined && <MoodTile summary={mood} current={current} onClick={() => onOpen('mood')} />}
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

/** Per habit, one cell per bucket: days checked in (0 or 1 for a day, up to a month's days for a year), null while in the future. */
type HabitCells = Map<number, (number | null)[]>;

const habitCells = (activity: CalendarActivity, buckets: ReportBucket[]): HabitCells => {
  const index = new Map(buckets.map((b, i) => [b.key, i]));
  const cells: HabitCells = new Map();
  for (const c of activity.habit_completions) {
    // A day bucket's key is the date; a year's month bucket's key is its "YYYY-MM".
    const i = index.get(c.date) ?? index.get(c.date.slice(0, 7));
    if (i === undefined) continue;
    const row = cells.get(c.habit_id) ?? buckets.map(b => (b.isFuture ? null : 0));
    row[i] = (row[i] ?? 0) + 1;
    cells.set(c.habit_id, row);
  }
  return cells;
};

const daysInMonth = (monthKey: string) => {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month, 0).getDate();
};

const HabitStrip: React.FC<{ cells: (number | null)[]; buckets: ReportBucket[]; byMonth: boolean }> = ({ cells, buckets, byMonth }) => (
  <span className="flex-1 min-w-0 flex gap-px sm:gap-0.5" aria-hidden="true">
    {cells.map((count, i) => {
      const b = buckets[i];
      if (count === null) return <span key={b.key} className="flex-1 min-w-0 h-3.5 rounded-sm border border-dashed border-border" />;
      const share = byMonth ? Math.min(count / daysInMonth(b.key), 1) : count > 0 ? 1 : 0;
      return (
        <span
          key={b.key}
          className="flex-1 min-w-0 h-3.5 rounded-sm"
          style={{ backgroundColor: share > 0 ? `color-mix(in srgb, var(--tm-success) ${Math.round(25 + share * 75)}%, var(--tm-surface-raised))` : 'var(--tm-surface-raised)' }}
          title={`${b.longLabel}: ${byMonth ? `${count} of ${daysInMonth(b.key)} days` : count > 0 ? 'done' : 'not done'}`}
        />
      );
    })}
  </span>
);

interface HabitListProps {
  report: CalendarReport;
  days: number;
  /** Adds a square per day (or per month in a year) to each habit's row. */
  cells?: HabitCells;
}

const HabitList: React.FC<HabitListProps> = ({ report, days, cells }) => {
  if (report.habits.length === 0) return <EmptyLine>No habits yet.</EmptyLine>;
  const empty = report.buckets.map(b => (b.isFuture ? null : 0));
  return (
    <ul className={`flex flex-col ${cells ? 'gap-3' : 'gap-2'}`}>
      {report.habits.map(h => (
        <li key={h.habitId} className="flex items-center gap-2">
          <span className={`text-xs sm:text-sm text-text-secondary truncate min-w-0 ${cells ? 'w-24 sm:w-40 flex-shrink-0' : 'flex-1'}`} title={h.title}>{h.title}</span>
          {cells && <HabitStrip cells={cells.get(h.habitId) ?? empty} buckets={report.buckets} byMonth={report.buckets[0]?.key.length === 7} />}
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

const ProgressRow: React.FC<{ label: string; detail: string; share: number; color: string }> = ({ label, detail, share, color }) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs sm:text-sm text-text-secondary">{label}</span>
      <span className="text-xs sm:text-sm font-semibold text-text-primary whitespace-nowrap">{detail}</span>
    </div>
    <span className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--tm-surface-raised)' }} aria-hidden="true">
      <span className="block h-full rounded-full" style={{ width: `${Math.min(share, 1) * 100}%`, backgroundColor: color }} />
    </span>
  </div>
);

const PlannedVsDone: React.FC<{ report: CalendarReport }> = ({ report }) => (
  <div className="flex flex-col gap-3">
    <ProgressRow
      label="Tasks due"
      detail={report.tasksPlanned === 0 ? 'None due' : `${report.plannedCompleted} of ${report.tasksPlanned} done`}
      share={report.tasksPlanned === 0 ? 0 : report.plannedCompleted / report.tasksPlanned}
      color="var(--tm-success)"
    />
    <ProgressRow
      label="Estimated hours"
      detail={report.plannedEstimatedHours > 0
        ? `${formatHours(report.completedEstimatedHours)}h done · ${formatHours(report.plannedEstimatedHours)}h planned`
        : `${formatHours(report.completedEstimatedHours)}h done`}
      share={report.plannedEstimatedHours > 0 ? report.completedEstimatedHours / report.plannedEstimatedHours : report.completedEstimatedHours > 0 ? 1 : 0}
      color="var(--tm-warning)"
    />
  </div>
);

// ── Report body ─────────────────────────────────────────────────────────────

const isEmpty = (r: CalendarReport) =>
  r.tasksPlanned === 0 && r.tasksCompleted === 0 && r.noteSeconds === 0 && r.habitCheckIns === 0;

interface ReportMood {
  /** Null when they failed to load. */
  checkins: MoodCheckin[] | null;
  error: string | null;
  retry: () => void;
  replaceDay: (date: string, saved: MoodCheckin | null, kind?: MoodPeriodKind) => void;
  settings: MoodCheckinSettings;
}

interface ReportBodyProps {
  period: ReportPeriod;
  report: CalendarReport;
  activity: CalendarActivity;
  mood: ReportMood;
  view: ReportView;
  moodView: MoodView;
  onOpen: (view: ReportView) => void;
  onSelectPeriod: (period: ReportPeriod) => void;
}

const ReportBody: React.FC<ReportBodyProps> = ({ period, report, activity, mood, view, moodView, onOpen, onSelectPeriod }) => {
  const days = elapsedDays(period);
  const checkins = mood.checkins;
  const byDay = useMemo(() => indexDayCheckins(checkins ?? []), [checkins]);
  const periodMood = checkins ? summarizeMood(byDay, period.start, period.end) : null;
  const hasMood = !!checkins && days > 0 && hasMoodCheckins(period, byDay, checkins);
  const current = isSamePeriod(period, periodContaining(period.kind, new Date()));
  const cells = useMemo(() => (view === 'habits' ? habitCells(activity, report.buckets) : undefined), [view, activity, report.buckets]);

  const moodSection = (
    <ReportMoodSection
      key="mood"
      period={period}
      report={report}
      activity={activity}
      byDay={byDay}
      checkins={checkins ?? []}
      settings={mood.settings}
      replaceDay={mood.replaceDay}
      onSelectPeriod={monthStart => onSelectPeriod(periodContaining('month', monthStart))}
      view={moodView}
    />
  );

  if (isEmpty(report) && !hasMood && !mood.error) {
    // While weekly or monthly check-ins are on, the period's weeks or months stay there to log.
    const offersPeriodCheckins = !!checkins && days > 0 && (period.kind === 'year' ? mood.settings.monthly : mood.settings.weekly);
    const empty = (
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
    if (!offersPeriodCheckins) return empty;
    return (
      <div className="flex flex-col gap-3 sm:gap-4">
        {empty}
        {moodSection}
      </div>
    );
  }

  const activityCard = (
    <CardShell icon={<ChartColumn className="w-4 h-4" style={{ color: 'var(--tm-accent)' }} />} header={period.kind === 'year' ? 'Activity by month' : 'Activity by day'}>
      <ReportActivityChart buckets={report.buckets} kind={period.kind} />
    </CardShell>
  );

  switch (view) {
    case 'tasks':
      return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
          <div className="lg:col-span-2">{activityCard}</div>
          <div className="flex flex-col gap-3 sm:gap-4">
            <CardShell icon={<Target className="w-4 h-4" style={{ color: 'var(--tm-success)' }} />} header="Planned vs done">
              <PlannedVsDone report={report} />
            </CardShell>
            <CardShell icon={<Trophy className="w-4 h-4" style={{ color: 'var(--tm-warning)' }} />} header="Busiest days">
              <BusiestDays report={report} />
              {report.activeDays > 0 && (
                <p className="text-[11px] text-text-muted mt-auto">Active on {plural(report.activeDays, 'day')}{days > 0 ? ` of ${days}` : ''}</p>
              )}
            </CardShell>
          </div>
        </div>
      );
    case 'notes':
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          <CardShell icon={<FileText className="w-4 h-4" style={{ color: 'var(--tm-accent-2)' }} />} header="Top notes by time">
            <TopNotes report={report} />
          </CardShell>
          <CardShell icon={<Clock className="w-4 h-4" style={{ color: 'var(--tm-accent-2)' }} />} header={period.kind === 'year' ? 'Note time by month' : 'Note time by day'}>
            <ReportActivityChart buckets={report.buckets} kind={period.kind} metric="notes" />
          </CardShell>
        </div>
      );
    case 'habits':
      return (
        <CardShell icon={<Flame className="w-4 h-4" style={{ color: '#F97316' }} />} header="Habits">
          <HabitList report={report} days={days} cells={cells} />
          {report.habits.length > 0 && (
            <p className="text-[11px] text-text-muted">
              {period.kind === 'year' ? 'Each square is a month, darker the more days you checked in.' : 'Each square is a day.'} Streaks are as of today.
            </p>
          )}
        </CardShell>
      );
    case 'mood':
      return mood.error ? (
        <div className="card-glass p-4 flex flex-wrap items-center gap-3" role="alert">
          <p className="text-sm text-text-primary flex-1 min-w-0">{mood.error}</p>
          <button type="button" onClick={mood.retry} className="btn btn-secondary py-1.5 px-3">Try again</button>
        </div>
      ) : (
        moodSection
      );
    case 'time':
      return <ReportTagBreakdown period={period} activity={activity} />;
    default:
      return (
        <div className="flex flex-col gap-3 sm:gap-4">
          <StatTiles report={report} mood={periodMood} current={current} onOpen={onOpen} />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
            <div className="lg:col-span-2">{activityCard}</div>
            <ReportHighlights
              period={period}
              report={report}
              activity={activity}
              byDay={checkins ? byDay : null}
              mood={periodMood}
              scopeLabel={scopeName(period)}
              onOpen={onOpen}
            />
          </div>
          {/* A phone has the Time highlight instead, to keep Overview on one screen. */}
          <div className="hidden sm:block">
            <ReportTagShareBar period={period} activity={activity} onOpen={() => onOpen('time')} />
          </div>
        </div>
      );
  }
};

const ReportSkeleton: React.FC = () => (
  <div className="flex flex-col gap-3 sm:gap-4" aria-hidden="true">
    <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-16 sm:h-24 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--tm-surface-raised)' }} />
      ))}
    </div>
    <div className="h-64 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--tm-surface-raised)' }} />
  </div>
);

// ── View ────────────────────────────────────────────────────────────────────

/**
 * Weekly / monthly / yearly report on the /reports page, in tabs so each fits
 * one screen: Overview (the stat tiles, the activity chart, highlights and
 * how the time split by tag), then Tasks, Notes, Habits, Mood (Over time or
 * Patterns) and Time. The open tab lives in the URL (`?view=mood&mood=patterns`),
 * so Back, reloads and links keep it, and switching the period keeps the tab.
 */
const CalendarReportView: React.FC = () => {
  const [period, setPeriod] = useState<ReportPeriod>(() => periodContaining('week', new Date()));
  const { report, activity, loading, error, retry } = useCalendarReport(period);
  const { profile, loaded: profileLoaded } = useAppShell().profileState;
  const mood = useReportMood(period);
  const searchParams = useSearchParams();
  const view = parseView(searchParams.get('view'));
  const moodView = parseMoodView(searchParams.get('mood'));

  const current = periodContaining(period.kind, new Date());
  const isCurrent = isSamePeriod(period, current);
  const label = formatPeriodLabel(period);

  // Each tab is a history entry, so Back returns to the tab before.
  const navigate = (next: ReportView, nextMood: MoodView = 'time') => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'overview') params.delete('view');
    else params.set('view', next);
    if (next === 'mood' && nextMood === 'patterns') params.set('mood', 'patterns');
    else params.delete('mood');
    const query = params.toString();
    window.history.pushState(null, '', query ? `?${query}` : window.location.pathname);
  };

  // On a phone the tabs scroll sideways; keep the open one in sight.
  useEffect(() => {
    document.getElementById(segmentedTabId(VIEWS_ID, view))?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [view]);

  return (
    <section className="flex flex-col gap-3 sm:gap-4" aria-labelledby="calendar-report-heading">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <h1 className="text-2xl sm:text-3xl text-text-primary mr-1 sm:mr-2">Reports</h1>
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
          <h2 id="calendar-report-heading" className="text-base sm:text-lg text-text-primary text-center min-w-0" aria-live="polite">
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

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="max-w-full overflow-x-auto scrollbar-none">
          <SegmentedTabs
            label="Report sections"
            tabs={VIEWS}
            value={view}
            onChange={next => navigate(next)}
            idBase={VIEWS_ID}
            panelId={VIEW_PANEL_ID}
          />
        </div>
        {view === 'mood' && (
          <div className="sm:ml-auto flex items-center gap-1 p-0.5 rounded-lg bg-surface border border-border" role="group" aria-label="Mood view">
            <MetricButton active={moodView === 'time'} onClick={() => navigate('mood', 'time')}>Over time</MetricButton>
            <MetricButton active={moodView === 'patterns'} onClick={() => navigate('mood', 'patterns')}>Patterns</MetricButton>
          </div>
        )}
      </div>

      <div id={VIEW_PANEL_ID} role="tabpanel" aria-labelledby={segmentedTabId(VIEWS_ID, view)} className="flex flex-col gap-3 sm:gap-4">
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
        ) : loading || !report || !activity || !profileLoaded || mood.loading ? (
          <>
            <span className="sr-only" role="status">Loading report…</span>
            <ReportSkeleton />
          </>
        ) : (
          <ReportBody
            period={period}
            report={report}
            activity={activity}
            mood={{ ...mood, settings: profile.moodCheckins }}
            view={view}
            moodView={moodView}
            onOpen={next => navigate(next)}
            onSelectPeriod={setPeriod}
          />
        )}
      </div>

      <p className="text-[11px] sm:text-xs text-text-muted">
        Completions count by the day a task was checked off; tasks completed before completion times were recorded aren’t counted. Habit streaks are as of today.
        {' '}Mood comes from your daily check-ins; days without one are left out of every mood number, never counted as neutral.
      </p>
    </section>
  );
};

export default CalendarReportView;
