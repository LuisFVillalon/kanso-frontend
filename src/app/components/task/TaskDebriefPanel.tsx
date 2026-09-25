'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Newspaper, RefreshCw, AlertTriangle, CalendarCheck, Gauge,
  ChevronDown, ChevronUp, Siren, TrendingUp, Moon, Clock,
} from 'lucide-react';
import { fetchTaskDebrief } from '@/app/lib/backend-api';
import { DailyDebriefReport, DebriefTaskItem, FocusNextItem } from '@/app/types/debrief';
import { getPriorityStyle, formatDueDate } from '@/app/utils/taskUtils';
import { usePersistedPref } from '@/app/hooks/usePersistedPref';
import type { ProfileFields, useProfile } from '@/app/hooks/useProfile';
import type { Task } from '@/app/types/task';
import type { Habit } from '@/app/types/habit';
import { bucketByTag } from '@/app/utils/tagBucketing';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import type { DebriefTag } from '@/app/types/debrief';

type Status = 'idle' | 'loading' | 'done' | 'error';

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Where a bar segment's tooltip attaches. Centering it on the segment lets
 * the tooltip hang past the bar's end for the outermost segments, and even
 * while hidden (opacity 0) it still widens the page and causes sideways
 * scrolling on phones. Anchoring toward the bar's middle keeps it inside.
 */
function tooltipAnchor(segmentCenterPct: number): string {
  return segmentCenterPct < 50 ? 'left-0' : 'right-0';
}

interface TaskDebriefPanelProps {
  profile: ProfileFields;
  onSaveProfile: ReturnType<typeof useProfile>['saveProfile'];
  tasks: Task[];
  habits: Habit[];
  completionSyncToken: number;
}

const isBoolean = (c: unknown): c is boolean => typeof c === 'boolean';

const TaskDebriefPanel: React.FC<TaskDebriefPanelProps> = ({ profile, onSaveProfile, tasks, habits, completionSyncToken }) => {
  const [status, setStatus] = useState<Status>('idle');
  const [debrief, setDebrief] = useState<DailyDebriefReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = usePersistedPref<boolean>(
    'tm-daily-brief-collapsed',
    false,
    isBoolean,
    profile.dailyBriefCollapsed,
    next => { onSaveProfile({ ...profile, dailyBriefCollapsed: next }); },
  );
  const open = !collapsed;

  // Guards against out-of-order responses: run() can be called again (e.g.
  // by the completionSyncToken effect below) while an earlier call is still
  // in flight. Without this, a slower earlier request resolving after a
  // faster later one would silently overwrite fresh data with a stale
  // snapshot, making a just-completed task vanish from the activity log.
  const requestSeq = useRef(0);

  const run = async () => {
    const seq = ++requestSeq.current;
    setStatus('loading');
    setError(null);
    try {
      const result = await fetchTaskDebrief();
      if (seq !== requestSeq.current) return;
      setDebrief(result);
      setStatus('done');
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(err instanceof Error ? err.message : 'Failed to generate task debrief');
      setStatus('error');
    }
  };

  useEffect(() => { run(); }, []);

  // The debrief (including today's completed-task segments) is fetched once
  // above and otherwise never changes on its own — re-fetch whenever a
  // completion toggle is confirmed by the server so completing/uncompleting
  // a task is reflected in the activity log bar without a manual refresh.
  // This keys off completionSyncToken (bumped only after the PUT resolves)
  // rather than `tasks` directly, because `tasks` updates optimistically
  // before the request completes — keying off it fired the debrief GET
  // concurrently with the in-flight PUT, so it often read stale data.
  const lastCompletionSyncToken = useRef(completionSyncToken);
  useEffect(() => {
    if (completionSyncToken === lastCompletionSyncToken.current) return;
    lastCompletionSyncToken.current = completionSyncToken;
    if (status === 'done' || status === 'error') run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completionSyncToken]);

  const toggle = () => {
    const next = !open;
    setCollapsed(!next);
    if (next && status === 'idle') run();
  };

  return (
    <div className="card-glass mb-4 sm:mb-6 relative overflow-x-clip">
      <div className="flex items-center justify-between p-4 sm:p-5">
        <button
          onClick={toggle}
          className="flex items-center gap-2 flex-1"
        >
          <Newspaper className="w-5 h-5" style={{ color: 'var(--tm-accent)' }} />
          <h2 className="text-base font-semibold text-text-primary">Daily Brief</h2>
        </button>
        <div className="flex items-center gap-2">
          {(status === 'done' || status === 'error') && (
            <button
              onClick={run}
              title="Refresh debrief"
              className="p-1.5 rounded-md transition-colors hover:bg-[var(--tm-surface-raised)] disabled:opacity-60"
              style={{ color: 'var(--tm-accent)' }}
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
          <button onClick={toggle}>
            {open ? <ChevronUp className="w-4 h-4 text-text-secondary" /> : <ChevronDown className="w-4 h-4 text-text-secondary" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="px-4 sm:px-5 pb-4 sm:pb-5 space-y-3">

          {status === 'idle' && (
            <p className="text-sm text-text-secondary text-center py-3">
              See what&apos;s overdue, due today, and next on deck — plus today&apos;s workload capacity and how your time breaks down by tag.
            </p>
          )}

          {status === 'loading' && (
            <div className="space-y-3">
              <SkeletonBar />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[0, 1, 2].map(i => (
                  <SkeletonCard key={i} />
                ))}
              </div>
              <SkeletonBar tall />
            </div>
          )}

          {status === 'error' && (
            <p className="text-sm py-2" style={{ color: 'var(--tm-danger)' }}>{error}</p>
          )}

          {status === 'done' && debrief && (
            <div className="space-y-3">
              <WorkloadCard debrief={debrief} />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <SectionCard
                  icon={<AlertTriangle className="w-4 h-4" />}
                  title="Overdue Tasks"
                  accentColor="var(--tm-danger)"
                  isEmpty={debrief.overdue_tasks.length === 0}
                  emptyText="Nothing overdue."
                >
                  {debrief.overdue_tasks.map(task => <TaskRow key={task.id} task={task} />)}
                </SectionCard>

                <SectionCard
                  icon={<CalendarCheck className="w-4 h-4" />}
                  title="Due Today"
                  accentColor="var(--tm-success)"
                  isEmpty={debrief.due_today_tasks.length === 0}
                  emptyText="Nothing due today."
                >
                  {debrief.due_today_tasks.map(task => <TaskRow key={task.id} task={task} />)}
                </SectionCard>

                <FocusNextCard items={debrief.focus_next} />
              </div>

              <TimeByTagCard tasks={tasks} habits={habits} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function SkeletonCard() {
  return (
    <div
      className="rounded-md p-3 space-y-2 animate-pulse"
      style={{ backgroundColor: 'var(--tm-surface-raised)', border: '1px solid var(--tm-border)' }}
    >
      <div className="h-3.5 rounded-sm w-1/2" style={{ backgroundColor: 'var(--tm-border)' }} />
      <div className="h-2.5 rounded-sm" style={{ backgroundColor: 'var(--tm-border)' }} />
      <div className="h-2.5 rounded-sm w-5/6" style={{ backgroundColor: 'var(--tm-border)' }} />
      <div className="h-2.5 rounded-sm w-4/6" style={{ backgroundColor: 'var(--tm-border)' }} />
    </div>
  );
}

function SkeletonBar({ tall = false }: { tall?: boolean }) {
  return (
    <div
      className={`rounded-md p-3 animate-pulse ${tall ? 'space-y-2' : ''}`}
      style={{ backgroundColor: 'var(--tm-surface-raised)', border: '1px solid var(--tm-border)' }}
    >
      <div className="h-3.5 rounded-sm w-1/3 mb-2" style={{ backgroundColor: 'var(--tm-border)' }} />
      <div className="h-2.5 rounded-sm" style={{ backgroundColor: 'var(--tm-border)' }} />
      {tall && <div className="h-2.5 rounded-sm w-5/6" style={{ backgroundColor: 'var(--tm-border)' }} />}
    </div>
  );
}

function SectionCard({
  icon, title, accentColor, isEmpty, emptyText, children,
}: {
  icon: React.ReactNode;
  title: string;
  accentColor: string;
  isEmpty: boolean;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-md p-3"
      style={{ backgroundColor: 'var(--tm-surface-raised)', border: '1px solid var(--tm-border)' }}
    >
      <div className="flex items-center gap-1.5 mb-2" style={{ color: accentColor }}>
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wide">{title}</span>
      </div>
      {isEmpty ? (
        <p className="text-xs text-text-muted py-1">{emptyText}</p>
      ) : (
        <ul>{children}</ul>
      )}
    </div>
  );
}

function TaskRow({ task }: { task: DebriefTaskItem }) {
  const style = getPriorityStyle(task.priority);
  const due = formatDueDate(task.due_date, task.due_time);
  return (
    <li
      className="flex items-start justify-between gap-2 py-1 border-b last:border-b-0"
      style={{ borderColor: 'var(--tm-border-subtle)' }}
    >
      <div className="min-w-0">
        <p className="text-xs font-medium text-text-primary truncate">{task.title}</p>
        <div className="flex items-center gap-1 mt-0.5 flex-wrap text-[10px] text-text-muted">
          {task.due_date && <span>{due}</span>}
          {task.category && <span>· {task.category}</span>}
        </div>
      </div>
      {task.priority != null && (
        <span
          className="chip flex-shrink-0 font-bold"
          style={{ backgroundColor: style.bg, color: style.text, padding: '0.1rem 0.4rem', fontSize: '10px' }}
        >
          {task.priority}
        </span>
      )}
    </li>
  );
}

interface CompletedItem {
  key: string;
  tags: DebriefTag[];
  title: string;
  kindLabel: string;
  minutes: number;
  color: string;
}

// Every completed-today task/habit/note-with-time, normalized to one common
// shape — the single pass over the three source lists
// (completed_today_tasks, habit_status, notes_worked_today) that both the
// Activity Log bar's total/segments and its per-tag breakdown are built
// from, instead of walking them twice for two different output shapes.
function collectCompletedItems(debrief: DailyDebriefReport): CompletedItem[] {
  const items: CompletedItem[] = [];

  for (const task of debrief.completed_today_tasks) {
    const minutes = (task.estimated_time ?? 0) * 60;
    if (minutes <= 0) continue;
    items.push({
      key: `task-${task.id}`,
      tags: task.tags,
      title: task.title,
      kindLabel: 'Task',
      minutes,
      color: task.tags[0]?.color ?? 'var(--tm-accent)',
    });
  }

  for (const habit of debrief.habit_status) {
    if (!habit.logged_today) continue;
    const minutes = (habit.estimated_time ?? 0) * 60;
    if (minutes <= 0) continue;
    items.push({
      key: `habit-${habit.id}`,
      tags: habit.tags,
      title: habit.title,
      kindLabel: 'Habit',
      minutes,
      color: habit.tags[0]?.color ?? 'var(--tm-accent)',
    });
  }

  for (const note of debrief.notes_worked_today) {
    if (note.minutes <= 0) continue;
    items.push({
      key: `note-${note.id}`,
      tags: note.tags,
      title: note.title,
      kindLabel: 'Note',
      minutes: note.minutes,
      color: note.tags[0]?.color ?? 'var(--tm-accent)',
    });
  }

  return items;
}

interface TagContributor {
  title: string;
  // Omitted by callers that don't distinguish kinds in their tooltip (e.g.
  // TimeByTagCard, which never shows "Task:"/"Habit:" prefixes).
  kindLabel?: string;
  value: number;
}

// Fans each item out to every tag it carries (or "Untagged" if none) so a
// tag's segment in a breakdown bar can list, on hover, the specific items
// that contributed to it — shared by WorkloadCard's Activity Log and
// TimeByTagCard's Time Allocation bar. Zero-value entries are dropped so an
// estimate-less task/habit never shows up as a "0m" contributor.
function buildContributorsByTag<T extends { tags: { name: string }[] }>(
  items: T[],
  toContributor: (item: T) => TagContributor,
): Map<string, TagContributor[]> {
  const contributorsByTag = new Map<string, TagContributor[]>();
  for (const item of items) {
    const entry = toContributor(item);
    if (entry.value <= 0) continue;
    const labels = item.tags.length === 0 ? ['Untagged'] : item.tags.map(t => t.name);
    for (const label of labels) {
      const list = contributorsByTag.get(label);
      if (list) list.push(entry);
      else contributorsByTag.set(label, [entry]);
    }
  }
  return contributorsByTag;
}

function WorkloadCard({ debrief }: { debrief: DailyDebriefReport }) {
  const { workload } = debrief;

  if (workload.is_rest_day) {
    return (
      <div
        className="rounded-md p-3 flex items-center gap-2"
        style={{ backgroundColor: 'var(--tm-accent-subtle)', border: '1px solid var(--tm-border)' }}
      >
        <Moon className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--tm-accent)' }} />
        <span className="text-xs font-semibold text-text-primary">Rest day</span>
        <span className="text-xs text-text-secondary">— no workload scheduled today.</span>
      </div>
    );
  }

  const completedItems = collectCompletedItems(debrief);
  const totalMinutes = completedItems.reduce((sum, i) => sum + i.minutes, 0);
  const availableMinutes = workload.available_minutes;

  const tagBuckets = bucketByTag(completedItems, item => item.minutes);
  const tagTotal = tagBuckets.reduce((sum, b) => sum + b.value, 0);
  const workloadContributorsByTag = buildContributorsByTag(completedItems, item => ({
    title: item.title,
    kindLabel: item.kindLabel,
    value: item.minutes,
  }));

  const pct = availableMinutes ? (totalMinutes / availableMinutes) * 100 : null;
  const overCap = availableMinutes != null && totalMinutes > availableMinutes;
  const barPct = pct != null ? Math.min(Math.max(pct, 0), 100) : (totalMinutes > 0 ? 100 : 0);
  const barColor = overCap ? 'var(--tm-danger)' : (pct != null && pct >= 70 ? 'var(--tm-warning)' : 'var(--tm-success)');

  return (
    <div
      className="rounded-md p-3"
      style={{ backgroundColor: 'var(--tm-surface-raised)', border: '1px solid var(--tm-border)' }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5" style={{ color: overCap ? 'var(--tm-danger)' : 'var(--tm-text-primary)' }}>
          <Gauge className="w-4 h-4" />
          <span className="text-xs font-semibold uppercase tracking-wide">Today&apos;s Activity Log</span>
        </div>
        {overCap && (
          <span
            className="chip text-[10px] font-bold"
            style={{ backgroundColor: 'var(--tm-danger-subtle)', color: 'var(--tm-danger)' }}
          >
            Overcommitted
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1 py-1.5 -my-1.5">
          <div className="h-2 rounded-full flex" style={{ backgroundColor: 'var(--tm-border)' }}>
            {tagBuckets.length === 0 ? (
              <div className="h-full rounded-full transition-all" style={{ width: `${barPct}%`, backgroundColor: barColor }} />
            ) : (
              <div className="h-full flex transition-all" style={{ width: `${barPct}%` }}>
                {tagBuckets.filter(b => Math.round((b.value / tagTotal) * 100) >= 1).map((b, i, visible) => {
                  const contributors = workloadContributorsByTag.get(b.label) ?? [];
                  const isFirst = i === 0;
                  const isLast = i === visible.length - 1;
                  const startPct = visible.slice(0, i).reduce((sum, v) => sum + (v.value / tagTotal) * 100, 0);
                  const centerPct = (barPct / 100) * (startPct + (b.value / tagTotal) * 50);
                  return (
                    <div
                      key={b.label}
                      className={`relative group h-full ${isFirst ? 'rounded-l-full' : ''} ${isLast ? 'rounded-r-full' : ''}`}
                      style={{ width: `${(b.value / tagTotal) * 100}%`, minWidth: '6px', flexShrink: 0, backgroundColor: b.color }}
                    >
                      <div
                        role="tooltip"
                        className={`pointer-events-none absolute bottom-full ${tooltipAnchor(centerPct)} mb-2 min-w-[180px] max-w-xs rounded-md px-2.5 py-2 text-[11px] font-medium opacity-0 scale-95 transition-all duration-150 group-hover:opacity-100 group-hover:scale-100 z-10`}
                        style={{ backgroundColor: 'var(--tm-text-primary)', color: 'var(--tm-surface)' }}
                      >
                        <p className="whitespace-nowrap font-semibold">
                          {b.label}: {formatMinutes(b.value)} ({Math.round((b.value / tagTotal) * 100)}%)
                        </p>
                        {contributors.length > 0 && (
                          <ul className="mt-1.5 pt-1.5 space-y-0.5" style={{ borderTop: '1px solid color-mix(in srgb, var(--tm-surface) 25%, transparent)' }}>
                            {contributors.map((c, ci) => (
                              <li key={`${c.kindLabel}-${c.title}-${ci}`} className="flex items-baseline justify-between gap-3 font-normal opacity-90">
                                <span className="truncate">{c.kindLabel}: {c.title}</span>
                                <span className="flex-shrink-0">{formatMinutes(c.value)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <span className="text-xs font-medium text-text-secondary whitespace-nowrap">
          {formatMinutes(totalMinutes)}
          {availableMinutes != null && ` / ${formatMinutes(availableMinutes)}`}
        </span>
      </div>
      {pct == null && completedItems.length === 0 && (
        <p className="text-[11px] text-text-muted mt-1.5">
          Nothing completed with tracked time yet today.
        </p>
      )}
      {(tagTotal > 0 || pct != null) && (
        <div className="flex items-start justify-between gap-3 mt-1.5">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {tagBuckets.filter(b => Math.round((b.value / tagTotal) * 100) >= 1).map(b => (
              <div key={b.label} className="flex items-center gap-1.5 min-w-0">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: b.color }} />
                <span className="text-[11px] text-text-secondary truncate">{b.label}</span>
                <span className="text-[11px] font-semibold text-text-primary flex-shrink-0">
                  {Math.round((b.value / tagTotal) * 100)}%
                </span>
              </div>
            ))}
          </div>
          {pct != null && (
            <p className="text-[11px] text-text-muted whitespace-nowrap flex-shrink-0">
              {Math.round(pct)}% of today&apos;s capacity used
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function FocusNextCard({ items }: { items: FocusNextItem[] }) {
  return (
    <div
      className="rounded-md p-3"
      style={{ backgroundColor: 'var(--tm-surface-raised)', border: '1px solid var(--tm-border)' }}
    >
      <div className="flex items-center gap-1.5 mb-2" style={{ color: 'var(--tm-accent)' }}>
        <TrendingUp className="w-4 h-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">Focus Next</span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-text-muted py-1">Nothing urgent — you&apos;re on top of it.</p>
      ) : (
        <div className="space-y-1.5">
          {items.map(item => <FocusNextRow key={item.task_id} item={item} />)}
        </div>
      )}
    </div>
  );
}

function FocusNextRow({ item }: { item: FocusNextItem }) {
  const style = getPriorityStyle(item.priority);
  const isHighPriority = item.reason === 'high_priority';

  return (
    <div
      className="flex items-center gap-3 rounded-md p-2.5"
      style={{ backgroundColor: 'var(--tm-surface)', border: '1px solid var(--tm-border)' }}
    >
      <span
        className="flex items-center justify-center flex-shrink-0 w-7 h-7 rounded-full"
        style={{
          backgroundColor: isHighPriority ? 'var(--tm-danger-subtle)' : 'var(--tm-accent-subtle)',
          color: isHighPriority ? 'var(--tm-danger)' : 'var(--tm-accent)',
        }}
      >
        {isHighPriority ? <Siren className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-text-primary truncate">{item.title}</p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span
            className="text-[10px] font-semibold uppercase tracking-wide"
            style={{ color: isHighPriority ? 'var(--tm-danger)' : 'var(--tm-accent)' }}
          >
            {isHighPriority ? 'High priority' : 'Plan ahead'}
          </span>
          {item.due_date && (
            <span className="text-[10px] text-text-muted">· due {formatDueDate(item.due_date)}</span>
          )}
          {item.estimated_time != null && (
            <span className="text-[10px] text-text-muted">· {item.estimated_time} hrs</span>
          )}
        </div>
      </div>
      {item.priority != null && (
        <span
          className="chip flex-shrink-0 font-bold"
          style={{ backgroundColor: style.bg, color: style.text, padding: '0.1rem 0.4rem', fontSize: '10px' }}
        >
          {item.priority}
        </span>
      )}
    </div>
  );
}

function TimeByTagCard({ tasks, habits }: { tasks: Task[]; habits: Habit[] }) {
  const todayStr = toLocalDateStr(new Date());
  const todayTasks = tasks.filter(t => t.due_date && toLocalDateStr(t.due_date) === todayStr);

  const todayItems = [
    ...todayTasks.map(t => ({ tags: t.tags, value: t.estimated_time ?? 0, title: t.title })),
    ...habits.map(h => ({ tags: h.tags, value: h.estimated_time ?? 0, title: h.title })),
  ];

  const buckets = bucketByTag(todayItems, item => item.value);
  const total = buckets.reduce((sum, b) => sum + b.value, 0);

  // No kindLabel passed — unlike WorkloadCard's Activity Log, this card's
  // tooltip has never distinguished tasks from habits by name alone.
  const contributorsByTag = buildContributorsByTag(todayItems, item => ({ title: item.title, value: item.value }));

  return (
    <div
      className="rounded-md p-3"
      style={{ backgroundColor: 'var(--tm-surface-raised)', border: '1px solid var(--tm-border)' }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5" style={{ color: 'var(--tm-text-primary)' }}>
          <Clock className="w-4 h-4" />
          <span className="text-xs font-semibold uppercase tracking-wide">Today&apos;s Time Allocation</span>
        </div>
        <span className="text-xs font-medium text-text-secondary whitespace-nowrap">
          {formatMinutes(total * 60)} total
        </span>
      </div>

      {total === 0 ? (
        <p className="text-xs text-text-muted py-1">No estimated time on today&apos;s tasks or habits.</p>
      ) : (
        <>
          <div className="flex h-2.5 rounded-full" style={{ backgroundColor: 'var(--tm-border)' }}>
            {buckets.map((b, i) => {
              const contributors = contributorsByTag.get(b.label) ?? [];
              const startPct = buckets.slice(0, i).reduce((sum, v) => sum + (v.value / total) * 100, 0);
              const centerPct = startPct + (b.value / total) * 50;
              const roundedClass = i === 0 && i === buckets.length - 1
                ? 'rounded-full'
                : i === 0
                  ? 'rounded-l-full'
                  : i === buckets.length - 1
                    ? 'rounded-r-full'
                    : '';
              return (
                <div
                  key={b.label}
                  className="relative group h-full transition-all"
                  style={{ width: `${(b.value / total) * 100}%` }}
                >
                  <div className={`h-full ${roundedClass}`} style={{ backgroundColor: b.color }} />
                  <div
                    role="tooltip"
                    className={`pointer-events-none absolute bottom-full ${tooltipAnchor(centerPct)} mb-2 min-w-[180px] max-w-xs rounded-md px-2.5 py-2 text-[11px] font-medium opacity-0 scale-95 transition-all duration-150 group-hover:opacity-100 group-hover:scale-100 z-10`}
                    style={{ backgroundColor: 'var(--tm-text-primary)', color: 'var(--tm-surface)' }}
                  >
                    <p className="whitespace-nowrap font-semibold">
                      {b.label}: {formatMinutes(b.value * 60)} ({Math.round((b.value / total) * 100)}%)
                    </p>
                    {contributors.length > 0 && (
                      <ul className="mt-1.5 pt-1.5 space-y-0.5" style={{ borderTop: '1px solid color-mix(in srgb, var(--tm-surface) 25%, transparent)' }}>
                        {contributors.map((c, ci) => (
                          <li key={`${c.title}-${ci}`} className="flex items-baseline justify-between gap-3 font-normal opacity-90">
                            <span className="truncate">{c.title}</span>
                            <span className="flex-shrink-0">{formatMinutes(c.value * 60)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
            {buckets.map(b => (
              <div key={b.label} className="flex items-center gap-1.5 min-w-0">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: b.color }} />
                <span className="text-[11px] text-text-secondary truncate">{b.label}</span>
                <span className="text-[11px] font-semibold text-text-primary flex-shrink-0">
                  {Math.round((b.value / total) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default TaskDebriefPanel;
