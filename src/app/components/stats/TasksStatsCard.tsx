'use client';

import React, { useEffect, useRef, useState } from 'react';
import { CheckSquare, ChevronLeft, ChevronRight } from 'lucide-react';
import { Task } from '@/app/types/task';
import { formatDateRange, toLocalDateStr } from '@/app/utils/dateUtils';
import { CardShell } from './CardShell';
import {
  ProgressRing, SegmentedProgressRing, CategoryBarChart, HoursLineChart, TagPriorityChart,
  formatHours,
  type WeekSegment, type TagPriorityCategory,
} from './charts';
import TileTools from './TileTools';
import type { DragHandleProps } from '@/app/components/common/DraggableGrid';

// Buckets a task list by tag (plus an "Untagged" catch-all), summing each
// tag's estimated_time and collecting the priority number of every
// prioritized task within it. Shared by the Tasks card's Active/Completed
// bar-chart slides (which only need count/hours, via the DonutCategory
// supertype) and its Priority slide (which also needs `priorities`) so the
// tag-bucketing logic lives in exactly one place.
const tagCategoriesFromTasks = (taskList: Task[]): TagPriorityCategory[] => {
  const tagMap = new Map<string, { color: string; count: number; hours: number; priorities: number[] }>();
  for (const task of taskList) {
    const hours = task.estimated_time ?? 0;
    for (const tag of task.tags) {
      const existing = tagMap.get(tag.name);
      if (existing) {
        existing.count++;
        existing.hours += hours;
        if (task.priority != null) existing.priorities.push(task.priority);
      } else {
        tagMap.set(tag.name, {
          color: tag.color ?? 'var(--tm-accent)',
          count: 1,
          hours,
          priorities: task.priority != null ? [task.priority] : [],
        });
      }
    }
  }
  const untaggedTasks = taskList.filter(t => t.tags.length === 0);
  const rows: TagPriorityCategory[] = [
    ...Array.from(tagMap.entries()).map(([label, { color, count, hours, priorities }]) => ({
      label,
      count,
      color,
      hours,
      priorities: [...priorities].sort((a, b) => a - b),
    })),
    ...(untaggedTasks.length > 0 ? [{
      label: 'Untagged',
      count: untaggedTasks.length,
      color: 'var(--tm-border)',
      hours: untaggedTasks.reduce((sum, t) => sum + (t.estimated_time ?? 0), 0),
      priorities: untaggedTasks
        .filter(t => t.priority != null)
        .map(t => t.priority as number)
        .sort((a, b) => a - b),
    }] : []),
  ];
  return rows.sort((a, b) => b.count - a.count);
};

// ── Shared derived stats — used by both the compact tile and the overlay ────

const useTaskStats = (tasks: Task[]) => {
  const todayDate = new Date();
  const todayStr = toLocalDateStr(todayDate);
  const todayDateLabel = todayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const todaysTasks = tasks.filter(t => t.due_date && toLocalDateStr(t.due_date) === todayStr);
  const todayTotal = todaysTasks.length;
  const todayCompleted = todaysTasks.filter(t => t.completed).length;
  const todayPct = todayTotal > 0 ? Math.round((todayCompleted / todayTotal) * 100) : 0;

  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sun .. 6 = Sat
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const weekRangeLabel = formatDateRange(monday, sunday);
  const mondayStr = toLocalDateStr(monday);
  const sundayStr = toLocalDateStr(sunday);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const dStr = toLocalDateStr(d);
    const dTasks = tasks.filter(t => t.due_date && toLocalDateStr(t.due_date) === dStr);
    const hours = dTasks.reduce((sum, t) => sum + (t.estimated_time ?? 0), 0);
    return { date: d, total: dTasks.length, completed: dTasks.filter(t => t.completed).length, isToday: dStr === todayStr, hours };
  });
  const weekTotal = weekDays.reduce((sum, d) => sum + d.total, 0);
  const weekCompleted = weekDays.reduce((sum, d) => sum + d.completed, 0);
  const weekPct = weekTotal > 0 ? Math.round((weekCompleted / weekTotal) * 100) : 0;
  // The week's workload — estimated hours of every task due this week, done
  // or not, same total the Workload slide charts day by day.
  const weekHours = weekDays.reduce((sum, d) => sum + d.hours, 0);

  // The Active/Completed/Priority slides and the Active ring all look at the
  // same Monday–Sunday week as the This Week ring, never every task ever.
  const weekTasks = tasks.filter(t => {
    if (!t.due_date) return false;
    const dStr = toLocalDateStr(t.due_date);
    return dStr >= mondayStr && dStr <= sundayStr;
  });
  const weekActive = weekTasks.filter(t => !t.completed);
  const weekDone = weekTasks.filter(t => t.completed);
  const weekPrioritized = weekActive.filter(t => t.priority != null);
  const activeTagCategories = tagCategoriesFromTasks(weekActive);
  const completedTagCategories = tagCategoriesFromTasks(weekDone);
  const tagPriorityCategories = tagCategoriesFromTasks(weekPrioritized);
  const activeCount = weekActive.length;
  const completedCount = weekDone.length;
  const prioritizedCount = weekPrioritized.length;
  const activePct = weekTotal > 0 ? Math.round((activeCount / weekTotal) * 100) : 0;

  return {
    todayDateLabel, todayTotal, todayCompleted, todayPct,
    weekDays, weekRangeLabel, weekTotal, weekCompleted, weekPct, weekHours,
    activeTagCategories, completedTagCategories, tagPriorityCategories,
    activeCount, completedCount, prioritizedCount, activePct,
  };
};

// ── Compact week sparkline ───────────────────────────────────────────────────
// One bar per day, Monday–Sunday: bar height reflects that day's due-task
// count, the filled (accent) portion reflects how much of it is completed —
// same signal as the overlay's SegmentedProgressRing, at tile scale.

const WEEK_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

interface TaskWeekBarsProps {
  days: { total: number; completed: number; isToday: boolean }[];
}

const TaskWeekBars: React.FC<TaskWeekBarsProps> = ({ days }) => (
  <div className="flex items-end gap-[3px] h-[26px] w-full">
    {days.map((d, i) => (
      <div key={i} className="flex-1 min-w-0 flex flex-col items-center justify-end gap-0.5 h-full">
        <span
          className="w-full rounded-sm relative overflow-hidden flex-shrink-0"
          style={{ height: Math.max(3, Math.min(26, d.total * 4)), backgroundColor: 'var(--tm-surface-raised)' }}
        >
          <span
            className="absolute left-0 right-0 bottom-0"
            style={{ height: `${d.total > 0 ? (d.completed / d.total) * 100 : 0}%`, backgroundColor: 'var(--tm-accent)' }}
          />
        </span>
        <span className="text-[8px] font-semibold leading-none" style={{ color: d.isToday ? 'var(--tm-accent)' : 'var(--tm-text-muted)' }}>
          {WEEK_LETTERS[i]}
        </span>
      </div>
    ))}
  </div>
);

// ── Overlay carousel (today's full detail, unchanged) ────────────────────────

interface TaskCarouselSlide {
  key: string;
  label: string;
  content: React.ReactNode;
}

interface TaskStatsCarouselProps {
  slides: TaskCarouselSlide[];
}

// Like the Notes card's carousel, but slides transform-translate past each
// other instead of swapping instantly — a continuous sliding-glass motion
// (swipeable on touch too) so the Today/Priority/Active/Completed views read
// as one fluid strip of stats rather than a series of unrelated screens.
const TaskStatsCarousel: React.FC<TaskStatsCarouselProps> = ({ slides }) => {
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [height, setHeight] = useState<number | undefined>(undefined);
  const go = (delta: number) => setIndex(prev => (prev + delta + slides.length) % slides.length);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > 40) go(delta < 0 ? 1 : -1);
    touchStartX.current = null;
  };

  // Track the active slide's own height (rather than letting the row
  // stretch to the tallest slide) so switching to a shorter slide doesn't
  // leave dead blank space below its content.
  useEffect(() => {
    const activeEl = slideRefs.current[index];
    if (!activeEl) return;
    setHeight(activeEl.offsetHeight);

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) setHeight(entry.contentRect.height);
    });
    observer.observe(activeEl);
    return () => observer.disconnect();
  }, [index, slides]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          {slides[index].label}
        </span>
        {slides.length > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous stat"
              className="p-1.5 rounded text-text-muted transition-colors hover:bg-surface-raised hover:text-text-primary"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-1">
              {slides.map((s, i) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Show ${s.label}`}
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: i === index ? '14px' : '6px',
                    backgroundColor: i === index ? 'var(--tm-accent)' : 'var(--tm-border)',
                    transitionDuration: 'var(--tm-dur-base)',
                    transitionTimingFunction: 'var(--tm-ease)',
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next stat"
              className="p-1.5 rounded text-text-muted transition-colors hover:bg-surface-raised hover:text-text-primary"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
      <div
        className="overflow-hidden"
        style={{
          height,
          transition: `height var(--tm-dur-slow) var(--tm-ease)`,
        }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="flex items-start"
          style={{
            transform: `translateX(-${index * 100}%)`,
            transition: `transform var(--tm-dur-slow) var(--tm-ease)`,
          }}
        >
          {slides.map((s, i) => (
            <div
              key={s.key}
              ref={el => { slideRefs.current[i] = el; }}
              className="w-full flex-shrink-0 min-w-0"
            >
              {s.content}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/** Full-detail body rendered inside the shared expand overlay. */
export const TasksOverlay: React.FC<{ tasks: Task[]; total: number }> = ({ tasks, total }) => {
  const stats = useTaskStats(tasks);
  const weekSegments: WeekSegment[] = stats.weekDays;

  if (total === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-3 text-center">
        <CheckSquare className="w-5 h-5 text-text-muted" strokeWidth={1.5} />
        <p className="text-xs sm:text-sm text-text-muted">No tasks yet — add one to get moving.</p>
      </div>
    );
  }

  const carouselSlides: TaskCarouselSlide[] = [
    {
      key: 'overview',
      label: 'Overview',
      content: (
        <div className="grid grid-cols-3 gap-x-3 gap-y-3 pt-1 items-start">
          <ProgressRing
            label={`Today (${stats.todayDateLabel})`}
            detail={stats.todayTotal > 0 ? `${stats.todayCompleted} / ${stats.todayTotal} done` : 'No tasks today'}
            pct={stats.todayPct}
            color="color-mix(in srgb, var(--tm-accent) 55%, white)"
            fluid
          />
          <SegmentedProgressRing
            label={`This Week (${stats.weekRangeLabel})`}
            detail={stats.weekTotal > 0 ? `${stats.weekCompleted} / ${stats.weekTotal} done` : 'No tasks this week'}
            pct={stats.weekPct}
            color="var(--tm-accent)"
            segments={weekSegments}
            fluid
          />
          <ProgressRing
            label="Active this week"
            detail={stats.weekTotal > 0 ? `${stats.activeCount} of ${stats.weekTotal} still open` : 'No tasks this week'}
            pct={stats.activePct}
            centerLabel={`${stats.activeCount}`}
            color="color-mix(in srgb, var(--tm-accent) 75%, black)"
            fluid
          />
        </div>
      ),
    },
    {
      key: 'hours',
      label: 'Workload',
      content: (
        <HoursLineChart days={stats.weekDays} rangeLabel={stats.weekRangeLabel} />
      ),
    },
    {
      key: 'priority',
      label: `Priority · This week (${stats.weekRangeLabel})`,
      content: (
        <TagPriorityChart
          categories={stats.tagPriorityCategories}
          total={stats.prioritizedCount}
          totalLabel="prioritized tasks due this week"
          emptyMessage="No prioritized tasks due this week"
        />
      ),
    },
    {
      key: 'active',
      label: `Active · This week (${stats.weekRangeLabel})`,
      content: (
        <CategoryBarChart
          categories={stats.activeTagCategories}
          total={stats.activeCount}
          totalLabel="active tasks due this week"
          emptyMessage="All caught up — nothing active this week"
        />
      ),
    },
    {
      key: 'completed',
      label: `Completed · This week (${stats.weekRangeLabel})`,
      content: (
        <CategoryBarChart
          categories={stats.completedTagCategories}
          total={stats.completedCount}
          totalLabel="completed tasks due this week"
          emptyMessage="Nothing completed this week yet"
        />
      ),
    },
  ];

  return (
    <div className="flex-1 min-h-0 flex flex-col justify-center">
      <TaskStatsCarousel slides={carouselSlides} />
    </div>
  );
};

// ── Compact tile ──────────────────────────────────────────────────────────────

interface TasksStatsCardProps {
  tasks: Task[];
  total: number;
  onExpand: () => void;
  dragHandleProps: DragHandleProps;
}

const TasksStatsCard: React.FC<TasksStatsCardProps> = ({ tasks, total, onExpand, dragHandleProps }) => {
  const stats = useTaskStats(tasks);

  return (
    <CardShell
      compact
      icon={<CheckSquare className="w-3.5 h-3.5" style={{ color: 'var(--tm-accent)' }} />}
      header="Tasks"
      headerAction={<TileTools onExpand={onExpand} dragHandleProps={dragHandleProps} />}
    >
      {total === 0 ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-1.5 text-center">
          <CheckSquare className="w-4 h-4 text-text-muted" strokeWidth={1.5} />
          <p className="text-[11px] text-text-muted">No tasks yet.</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex items-center gap-3">
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <ProgressRing pct={stats.todayPct} color="var(--tm-accent)" size={58} strokeWidth={6} hideLabel />
            {stats.weekHours > 0 && (
              <span
                className="text-[9px] leading-none text-text-muted whitespace-nowrap"
                title={`Estimated hours of tasks due this week (${stats.weekRangeLabel})`}
              >
                {formatHours(stats.weekHours)}h this week
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            <div className="flex items-baseline gap-1">
              <span className="text-[19px] font-bold leading-none" style={{ color: 'var(--tm-text-primary)' }}>
                {stats.todayCompleted} / {stats.todayTotal}
              </span>
              <span className="text-[11px] text-text-muted">due today</span>
            </div>
            <TaskWeekBars days={stats.weekDays} />
            <span className="text-[10px] text-text-muted">This week · {stats.weekRangeLabel}</span>
          </div>
        </div>
      )}
    </CardShell>
  );
};

export default TasksStatsCard;
