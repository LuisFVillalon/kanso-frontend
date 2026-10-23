'use client';

import React, { useMemo } from 'react';
import { ChartScatter, ChevronRight, FileText, Flame, Smile, Star, Tag as TagIcon, Trophy } from 'lucide-react';
import { CardShell } from '@/app/components/stats/CardShell';
import type { CalendarActivity } from '@/app/types/activity';
import { moodLabel, type MoodCheckin } from '@/app/types/mood';
import { formatDurationShort, parseLocalDate, toLocalDateStr } from '@/app/utils/dateUtils';
import {
  analyseCorrelation,
  CORRELATION_LABELS,
  dailyActivity,
  MOOD_METRICS,
  moodActivityPoints,
  type CalendarReport,
  type CorrelationLevel,
  type ReportPeriod,
} from '@/app/utils/calendarReport';
import { PATTERN_MIN_DAYS, type MoodSummary } from '@/app/utils/moodReport';
import { buildTagBreakdown, collectTagItems, UNTAGGED_KEY } from '@/app/utils/tagReport';
import { METRIC_INFO } from './ReportMoodRelationChart';
import { formatTagHours } from './ReportTagBreakdown';
import type { ReportView } from './CalendarReportView';
import type { MoodView } from './ReportMoodSection';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Links strong enough to name, strongest first. */
const NAMED_LEVELS: CorrelationLevel[] = ['strong', 'moderate', 'slight', 'early'];

interface Highlight {
  view: ReportView;
  moodView?: MoodView;
  icon: React.ReactNode;
  title: string;
  text: string;
}

interface ReportHighlightsProps {
  period: ReportPeriod;
  report: CalendarReport;
  activity: CalendarActivity;
  /** Daily check-ins by day; null while they failed to load. */
  byDay: Map<string, MoodCheckin> | null;
  /** The period's mood; null while check-ins failed to load. */
  mood: MoodSummary | null;
  /** How the period is named in a sentence: "this month", "in 2025". */
  scopeLabel: string;
  onOpen: (view: ReportView, moodView?: MoodView) => void;
}

/**
 * The report Overview's one-line answers — the busiest day, the note with the
 * most time, the current habit streak, the week's mood or how a month's or
 * year's mood moved with activity, and the tag that took the most time — each
 * opening the tab that explains it.
 */
const ReportHighlights: React.FC<ReportHighlightsProps> = ({ period, report, activity, byDay, mood, scopeLabel, onOpen }) => {
  const periodKey = `${period.kind}:${toLocalDateStr(period.start)}`;

  // A week is too short for mood patterns (the Mood tab sends it to its month).
  const moodLink = useMemo(() => {
    if (!byDay || period.kind === 'week') return null;
    const days = dailyActivity(activity, period.start, period.end);
    const results = MOOD_METRICS.map(metric => ({ metric, result: analyseCorrelation(moodActivityPoints(byDay, days, period.start, period.end, metric)) }));
    for (const level of NAMED_LEVELS) {
      const found = results.find(r => r.result.level === level);
      if (found) return { ...found, n: found.result.n };
    }
    return { metric: null, result: results[0].result, n: results[0].result.n };
    // `periodKey` identifies the period; its Date objects change identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity, byDay, periodKey]);

  const topTag = useMemo(() => {
    const { rows, total } = buildTagBreakdown(collectTagItems(activity, period.start, period.end), 'time', { task: true, note: true, habit: true });
    const top = rows.find(r => r.key !== UNTAGGED_KEY && !r.foldedKeys);
    return top && total > 0 ? { name: top.name, hours: top.total, share: Math.round((top.total / total) * 100), total } : null;
    // `periodKey` identifies the period; its Date objects change identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity, periodKey]);

  const busiest = report.busiestDays[0];
  const topNote = report.topNotes[0];
  const streak = report.habits
    .filter(h => (h.currentStreak ?? 0) > 0)
    .sort((a, b) => (b.currentStreak ?? 0) - (a.currentStreak ?? 0))[0];

  const highlights: Highlight[] = [
    {
      view: 'tasks',
      icon: <Trophy className="w-4 h-4" style={{ color: 'var(--tm-warning)' }} />,
      title: 'Busiest day',
      text: busiest
        ? [
          parseLocalDate(busiest.dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
          busiest.tasksCompleted > 0 && plural(busiest.tasksCompleted, 'task'),
          busiest.habitsCompleted > 0 && plural(busiest.habitsCompleted, 'habit'),
          busiest.noteSeconds > 0 && `${formatDurationShort(busiest.noteSeconds)} notes`,
        ].filter(Boolean).join(' · ')
        : 'No activity recorded yet',
    },
    {
      view: 'notes',
      icon: <FileText className="w-4 h-4" style={{ color: 'var(--tm-accent-2)' }} />,
      title: 'Most time in a note',
      text: topNote ? `${topNote.title || 'Untitled Note'} · ${formatDurationShort(topNote.seconds)}` : 'No time spent in notes',
    },
    {
      view: 'habits',
      icon: <Flame className="w-4 h-4" style={{ color: '#F97316' }} />,
      title: 'Current streak',
      text: streak
        ? `${streak.title} · ${plural(streak.currentStreak ?? 0, 'day')}${streak.bestStreak ? ` (best ${streak.bestStreak})` : ''}`
        : 'No habit streaks going',
    },
  ];
  if (period.kind === 'week' && mood && mood.average != null) {
    highlights.push({
      view: 'mood',
      icon: <Smile className="w-4 h-4" style={{ color: 'var(--tm-accent)' }} />,
      title: 'Mood',
      text: `${moodLabel(Math.round(mood.average))} ${mood.average.toFixed(1)} · ${mood.logged} of ${plural(mood.days, 'day')} logged`,
    });
  }
  if (moodLink) {
    const { metric, result, n } = moodLink;
    highlights.push({
      view: 'mood',
      moodView: 'patterns',
      icon: <ChartScatter className="w-4 h-4" style={{ color: 'var(--tm-accent)' }} />,
      title: 'Mood & your activity',
      text: metric
        ? `${CORRELATION_LABELS[result.level]} with ${METRIC_INFO[metric].label.toLowerCase()} ${scopeLabel}`
        : n < PATTERN_MIN_DAYS
          ? `Shows up after about ${PATTERN_MIN_DAYS} days with a check-in — ${n} so far`
          : `No clear link with tasks, note time or habits ${scopeLabel}`,
    });
  }
  if (topTag) {
    highlights.push({
      view: 'time',
      icon: <TagIcon className="w-4 h-4" style={{ color: 'var(--tm-accent)' }} />,
      title: 'Where your time went',
      text: `${topTag.name} · ${formatTagHours(topTag.hours)}, ${topTag.share}% of ${formatTagHours(topTag.total)}`,
    });
  }

  return (
    <CardShell icon={<Star className="w-4 h-4" style={{ color: 'var(--tm-warning)' }} />} header="Highlights">
      <ul className="flex flex-col m-0 p-0 list-none">
        {highlights.map(h => (
          <li key={h.title}>
            <button
              type="button"
              onClick={() => onOpen(h.view, h.moodView)}
              className="w-full flex items-center gap-3 px-2 py-1 sm:py-1.5 rounded-lg text-left hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tm-accent)]"
            >
              <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-surface-raised" aria-hidden="true">{h.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] leading-tight font-semibold uppercase tracking-wide text-text-muted">{h.title}</span>
                <span className="block text-sm text-text-primary truncate" title={h.text}>{h.text}</span>
              </span>
              <ChevronRight className="w-4 h-4 text-text-muted flex-shrink-0" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </CardShell>
  );
};

export default ReportHighlights;
