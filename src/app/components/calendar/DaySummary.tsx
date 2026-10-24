'use client';

import React from 'react';
import { Flame, SquareCheck, FileText, Clock, CheckCircle2, Circle, CalendarClock, Repeat, Archive } from 'lucide-react';
import type { DayData } from '@/app/hooks/useYearCalendarData';
import type { Task } from '@/app/types/task';
import type { Habit } from '@/app/types/habit';
import type { Note } from '@/app/types/notes';
import type { EventOccurrence } from '@/app/types/event';
import { toLocalDateStr, toLocalTimeStr, formatDurationShort } from '@/app/utils/dateUtils';
import { formatTime12Hour } from '@/app/utils/taskUtils';
import { bucketByTag } from '@/app/utils/tagBucketing';
import {
  formatEventMinutes,
  formatEventTime,
  occurrenceKey,
  occurrenceMinutesOn,
  occurrenceSpanOn,
  timeToMinutes,
} from '@/app/utils/eventOccurrences';
import { eventColor, repeatText } from '@/app/utils/events';
import { useNoteTimeTotalsForRange, useNoteTimeTotalsByDay } from '@/app/hooks/useNoteTimeTotals';
import TagChipList from '@/app/components/common/TagChipList';
import { CategoryDonutChart, WeekTrendLineChart, type ChartCategory, type DayPoint } from './DayCharts';

interface DaySummaryProps {
  date: Date;
  data: DayData | undefined;
  totalHabits: number;
  /** All habits (regardless of whether they were completed this day) — used for the "Allocated hours by tag" chart. */
  allHabits: Habit[];
  dayData: Map<string, DayData>;
  /** 'widget' = compact dashboard-card layout (lists | charts side by side, trend graph below); 'page' = full /calendar page layout. */
  variant?: 'page' | 'widget';
}

const fmtHours = (hours: number): string => (Number.isInteger(hours) ? `${hours}` : hours.toFixed(1));

const normalizedTime = (t: Task): string | null =>
  typeof t.due_time === 'string' ? t.due_time : t.due_time instanceof Date ? toLocalTimeStr(t.due_time) : null;

// A day's events as donut items: their hours on that day (an event past
// midnight counts its part on each day).
const eventItems = (events: EventOccurrence[], dateStr: string) =>
  events.map(e => ({ tags: e.tags, value: occurrenceMinutesOn(e, dateStr) / 60, name: e.title, kind: 'Event' }));

const eventHoursOn = (events: EventOccurrence[], dateStr: string) =>
  events.reduce((sum, e) => sum + occurrenceMinutesOn(e, dateStr), 0) / 60;

// Every event the calendar shows is planned time; only the past ones that
// weren't archived (cancelled) count as time actually spent.
const happened = (e: EventOccurrence) => e.past && !e.archived;

const hoursByTag = (tasks: Task[], habits: Habit[], events: EventOccurrence[], dateStr: string): ChartCategory[] => {
  const items = [
    ...tasks.map(t => ({ tags: t.tags, value: t.estimated_time ?? 0, name: t.title, kind: 'Task' })),
    ...habits.map(h => ({ tags: h.tags, value: h.estimated_time ?? 0, name: h.title, kind: 'Habit' })),
    ...eventItems(events, dateStr),
  ];
  return bucketByTag(items, i => i.value, i => i.name, i => i.kind);
};

// Actual hours worked, as opposed to `hoursByTag`'s allocated/estimated
// hours: completed tasks and habits contribute their estimated_time (the
// closest proxy available for time actually spent), notes contribute
// their tracked session time for the day (noteTimeTotals, in seconds), and
// events that took place contribute their length.
const actualHoursByTag = (
  tasksCompleted: Task[],
  habitsCompleted: Habit[],
  notesEdited: Note[],
  noteTimeTotals: Record<number, number>,
  events: EventOccurrence[],
  dateStr: string,
): ChartCategory[] => {
  const items = [
    ...tasksCompleted.map(t => ({ tags: t.tags, value: t.estimated_time ?? 0, name: t.title, kind: 'Task' })),
    ...habitsCompleted.map(h => ({ tags: h.tags, value: h.estimated_time ?? 0, name: h.title, kind: 'Habit' })),
    ...notesEdited.map(n => ({ tags: n.tags, value: (noteTimeTotals[n.id] ?? 0) / 3600, name: n.title || 'Untitled Note', kind: 'Note' })),
    ...eventItems(events.filter(happened), dateStr),
  ];
  return bucketByTag(items, i => i.value, i => i.name, i => i.kind);
};

const DESCRIPTION_TRUNCATE_LENGTH = 80;
// Widget card is narrow, so a "long" description is capped much sooner —
// the goal is a single line, not a couple of wrapped lines like the page view.
const COMPACT_DESCRIPTION_TRUNCATE_LENGTH = 40;

function TaskDueItem({ task, compact = false }: { task: Task; compact?: boolean }) {
  const [expanded, setExpanded] = React.useState(false);
  const description = task.description?.trim() ?? '';
  const truncateLength = compact ? COMPACT_DESCRIPTION_TRUNCATE_LENGTH : DESCRIPTION_TRUNCATE_LENGTH;
  const isLong = description.length > truncateLength;
  const displayText = expanded || !isLong ? description : `${description.slice(0, truncateLength)}…`;

  return (
    <div className="p-2 rounded-md border border-border-subtle space-y-1">
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-1.5 min-w-0">
          {task.completed ? (
            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-[var(--tm-success)]" />
          ) : (
            <Circle className="w-3.5 h-3.5 flex-shrink-0 text-text-muted" />
          )}
          <span className={`text-sm font-medium truncate ${task.completed ? 'line-through text-text-muted' : 'text-text-primary'}`}>
            {task.title}
          </span>
        </span>
        {task.estimated_time != null && (
          <span className="text-xs font-semibold text-text-muted flex-shrink-0">{fmtHours(task.estimated_time)}h</span>
        )}
      </div>
      {description && compact ? (
        <div className="space-y-0.5">
          <p className={`text-xs text-text-muted ${expanded ? 'whitespace-pre-wrap' : 'truncate'}`}>{description}</p>
          {isLong && (
            <button
              type="button"
              onClick={() => setExpanded(e => !e)}
              className="text-[11px] font-semibold text-[var(--tm-accent)] hover:underline"
            >
              {expanded ? 'See less' : 'See more'}
            </button>
          )}
        </div>
      ) : description && (
        <p className="text-xs text-text-muted whitespace-pre-wrap">
          {displayText}
          {isLong && (
            <button
              type="button"
              onClick={() => setExpanded(e => !e)}
              className="ml-1 text-[11px] font-semibold text-[var(--tm-accent)] hover:underline"
            >
              {expanded ? 'See less' : 'See more'}
            </button>
          )}
        </p>
      )}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <TagChipList tags={task.tags} size="xs" />
        {normalizedTime(task) && (
          <span className="inline-flex items-center gap-1 text-[11px] text-text-muted flex-shrink-0">
            <Clock className="w-3 h-3" />
            {formatTime12Hour(normalizedTime(task))}
          </span>
        )}
      </div>
    </div>
  );
}

/** An open task due during an event on the same day: "Essay is due at 1:00 PM, during Studio." */
interface EventClash {
  task: Task;
  event: EventOccurrence;
}

function eventClashes(tasks: Task[], events: EventOccurrence[], dateStr: string): EventClash[] {
  const clashes: EventClash[] = [];
  for (const task of tasks) {
    const time = normalizedTime(task);
    if (task.completed || !time) continue;
    const at = timeToMinutes(time);
    const event = events.find(e => {
      if (e.archived) return false;
      const span = occurrenceSpanOn(e, dateStr);
      return span !== null && at >= span.start && at < span.end;
    });
    if (event) clashes.push({ task, event });
  }
  return clashes;
}

const StatusChip: React.FC<{ children: React.ReactNode; muted?: boolean }> = ({ children, muted }) => (
  <span
    className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none"
    style={{ backgroundColor: 'var(--tm-slipped-subtle)', color: muted ? 'var(--tm-text-muted)' : 'var(--tm-slipped-text)' }}
  >
    {children}
  </span>
);

/**
 * One event in the day report: its time, title, tags, how it repeats, a
 * Past or Archived chip, and its description. Past events are faded and
 * archived ones are hatched and struck through, as on the calendars.
 */
function EventItem({ event, compact = false }: { event: EventOccurrence; compact?: boolean }) {
  const color = eventColor(event.tags);
  const repeat = repeatText(event);
  const description = event.description?.trim() ?? '';
  return (
    <div
      data-event-row
      className="p-2 rounded-md border border-border-subtle space-y-1"
      style={{
        borderLeft: `3px solid ${color}`,
        background: event.archived
          ? `repeating-linear-gradient(135deg, color-mix(in srgb, ${color} 8%, var(--tm-surface)) 0 5px, var(--tm-surface) 5px 10px)`
          : undefined,
        opacity: event.past && !event.archived ? 0.75 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`text-sm font-medium truncate ${event.archived ? 'line-through text-text-muted' : 'text-text-primary'}`}>
          {event.title}
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-text-muted flex-shrink-0">
          <Clock className="w-3 h-3" />
          {formatEventTime(event)}
        </span>
      </div>
      {description && (
        <p className={`text-xs text-text-muted whitespace-pre-wrap ${compact ? 'line-clamp-1' : 'line-clamp-2'}`}>{description}</p>
      )}
      <div className="flex items-center gap-1.5 flex-wrap">
        <TagChipList tags={event.tags} size="xs" />
        {repeat && (
          <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none border border-border text-text-muted bg-surface-raised">
            <Repeat className="w-2.5 h-2.5" aria-hidden />
            {repeat}
          </span>
        )}
        {event.archived ? (
          <StatusChip><Archive className="w-2.5 h-2.5" aria-hidden />Archived</StatusChip>
        ) : event.past ? (
          <StatusChip muted>Past</StatusChip>
        ) : null}
      </div>
    </div>
  );
}

// Pins a section's list content to a fixed (not max) height with its own
// scrollbar, so a day with a lot of habits/tasks/notes can't stretch the
// widget card taller than the calendar card next to it. Using a fixed height
// rather than a max-height matters here: the four list sections are laid out
// two-per-row in a CSS grid, and grid row auto-sizing uses each cell's full
// (uncapped) content height when computing the row's height — so a `maxHeight`
// cap on one cell doesn't stop a long list in the *other* cell of the same row
// from blowing the row out, leaving the capped cell's scrollbar short of the
// row's actual bottom. Giving every list section the same fixed height sidesteps
// that entirely: every cell in a row contributes the same height, so the row
// height and every cell's height are always identical.
const LIST_BOX_HEIGHT = 168;

const ScrollBox: React.FC<{ height: number; children: React.ReactNode }> = ({ height, children }) => (
  <div className="overflow-y-auto scrollbar-custom pr-1" style={{ height }}>{children}</div>
);

const SummaryTile: React.FC<{ icon: React.ReactNode; label: string; value: string; color: string; bg: string; detail?: string }> = ({
  icon, label, value, color, bg, detail,
}) => (
  <div className="p-2.5 rounded-lg border border-border-subtle flex flex-col gap-0.5 min-w-0" style={{ backgroundColor: bg }}>
    <span className="flex items-center gap-1 text-[11px] font-semibold leading-tight" style={{ color }}>{icon}{label}</span>
    <span className="text-lg font-bold leading-none text-text-primary">{value}</span>
    {detail && <span className="text-[10px] text-text-muted truncate">{detail}</span>}
  </div>
);

interface ListSectionProps {
  title: string;
  isEmpty: boolean;
  emptyText: string;
  children: React.ReactNode;
}

// Shared shape for the four habit/task/note list sections: a heading, an
// italic empty-state message, or the (optionally scroll-boxed via `wrap`)
// list itself — kept in one place so the four sections can't drift apart.
const ListSection: React.FC<ListSectionProps> = ({ title, isEmpty, emptyText, children }) => (
  <section>
    <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-1.5">{title}</h3>
    {isEmpty ? <p className="text-xs text-text-muted italic">{emptyText}</p> : children}
  </section>
);

// Full day-detail body (summary tiles, habit/task/note lists, charts) shared
// by the DayDetailModal (dashboard month tile click) and DaySummaryPanel
// (calendar page) so both surfaces stay in sync when this content changes.
const DaySummary: React.FC<DaySummaryProps> = ({ date, data, totalHabits, allHabits, dayData, variant = 'page' }) => {
  const habitsCompleted = data?.habitsCompleted ?? [];
  const tasksDue = data?.tasksDue ?? [];
  const tasksCompleted = data?.tasksCompleted ?? [];
  const notesEdited = data?.notesEdited ?? [];
  const events = data?.events ?? [];

  const dateStr = toLocalDateStr(date);
  const noteTimeTotals = useNoteTimeTotalsForRange(dateStr, dateStr);
  const sunday = new Date(date);
  sunday.setDate(date.getDate() - date.getDay());
  // Planned hours, not "hours actually logged" — every habit counts toward
  // every day (habits recur daily and carry no per-day schedule of their
  // own), same as the "Planned hours by tag" donut above. Only tasks vary
  // by day, via each day's own due tasks.
  const allHabitsHours = allHabits.reduce((sum, h) => sum + (h.estimated_time ?? 0), 0);
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return d;
  });
  const weekDateStrs = weekDates.map(toLocalDateStr);
  const weekDays: DayPoint[] = weekDates.map((d, i) => {
    const ds = weekDateStrs[i];
    const dd = dayData.get(ds);
    const dueTasksHours = (dd?.tasksDue ?? []).reduce((sum, t) => sum + (t.estimated_time ?? 0), 0);
    return { date: d, hours: dueTasksHours + allHabitsHours + eventHoursOn(dd?.events ?? [], ds), isSelected: ds === dateStr };
  });
  const weekEnd = weekDays[6].date;
  const rangeLabel = `Week of ${sunday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${weekEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

  const noteTimeTotalsByDay = useNoteTimeTotalsByDay(weekDateStrs);
  const actualWeekDays: DayPoint[] = weekDates.map((d, i) => {
    const ds = weekDateStrs[i];
    const dd = dayData.get(ds);
    const habitsHours = (dd?.habitsCompleted ?? []).reduce((sum, h) => sum + (h.estimated_time ?? 0), 0);
    const tasksHours = (dd?.tasksCompleted ?? []).reduce((sum, t) => sum + (t.estimated_time ?? 0), 0);
    const dayNoteTotals = noteTimeTotalsByDay[ds] ?? {};
    const notesHours = (dd?.notesEdited ?? []).reduce((sum, n) => sum + (dayNoteTotals[n.id] ?? 0) / 3600, 0);
    const eventsHours = eventHoursOn((dd?.events ?? []).filter(happened), ds);
    return { date: d, hours: habitsHours + tasksHours + notesHours + eventsHours, isSelected: ds === dateStr };
  });

  const donutCategories = hoursByTag(tasksDue, allHabits, events, dateStr);
  const actualDonutCategories = actualHoursByTag(tasksCompleted, habitsCompleted, notesEdited, noteTimeTotals, events, dateStr);

  const eventMinutes = events.filter(e => !e.archived).reduce((sum, e) => sum + occurrenceMinutesOn(e, dateStr), 0);
  const archivedEvents = events.filter(e => e.archived).length;
  const eventsDetail = events.length === 0
    ? undefined
    : [eventMinutes > 0 && formatEventMinutes(eventMinutes), archivedEvents > 0 && `${archivedEvents} archived`].filter(Boolean).join(' · ') || undefined;
  const clashes = eventClashes(tasksDue, events, dateStr);

  const compact = variant === 'widget';
  const wrap = (node: React.ReactNode, height: number): React.ReactNode =>
    compact ? <ScrollBox height={height}>{node}</ScrollBox> : node;

  const habitsList = (
    <div className="space-y-1.5">
      {habitsCompleted.map(h => (
        <div key={h.id} className="flex items-center justify-between gap-2 p-2 rounded-md border border-border-subtle">
          <span className="text-sm font-medium text-text-primary truncate">{h.title}</span>
          <div className="flex items-center gap-2 flex-shrink-0">
            {h.estimated_time != null && (
              <span className="text-xs font-semibold text-text-muted">{fmtHours(h.estimated_time)}h</span>
            )}
            <TagChipList tags={h.tags} size="xs" />
          </div>
        </div>
      ))}
    </div>
  );

  // The day's events lead the report, across the full width.
  const eventsSection = (
    <ListSection title="Events" isEmpty={events.length === 0} emptyText="No events">
      <div className="space-y-1.5">
        {events.map(e => <EventItem key={occurrenceKey(e)} event={e} compact={compact} />)}
        {clashes.map(({ task, event }) => (
          <p key={`clash-${task.id}`} data-event-clash className="flex items-start gap-1.5 text-xs text-text-secondary">
            <span aria-hidden className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--tm-warning)' }} />
            <span>
              <span className="font-semibold text-text-primary">{task.title}</span> is due at {formatTime12Hour(normalizedTime(task))}, during{' '}
              <span className="font-semibold text-text-primary">{event.title}</span> ({formatEventTime(event)}).
            </span>
          </p>
        ))}
      </div>
    </ListSection>
  );

  const habitsSection = (
    <ListSection title="Habits completed" isEmpty={habitsCompleted.length === 0} emptyText="No habits completed">
      {wrap(habitsList, LIST_BOX_HEIGHT)}
    </ListSection>
  );

  const tasksDueSection = (
    <ListSection title="Tasks due" isEmpty={tasksDue.length === 0} emptyText="No tasks due">
      {wrap(
        <div className="space-y-1.5">
          {tasksDue.map(t => (
            <TaskDueItem key={t.id} task={t} compact={compact} />
          ))}
        </div>,
        LIST_BOX_HEIGHT
      )}
    </ListSection>
  );

  const notesList = (
    <div className="space-y-1.5">
      {notesEdited.map(n => (
        <div key={n.id} className="flex items-center justify-between gap-2 p-2 rounded-md border border-border-subtle">
          <span className="text-sm font-medium text-text-primary truncate">{n.title || 'Untitled Note'}</span>
          <div className="flex items-center gap-2 flex-shrink-0">
            <TagChipList tags={n.tags} size="xs" />
            <span className="text-[11px] text-text-muted">
              {formatDurationShort(noteTimeTotals[n.id] ?? 0)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );

  const notesSection = (
    <ListSection title="Notes edited" isEmpty={notesEdited.length === 0} emptyText="No notes edited">
      {wrap(notesList, LIST_BOX_HEIGHT)}
    </ListSection>
  );

  const tasksCompletedSection = (
    <ListSection title="Tasks completed" isEmpty={tasksCompleted.length === 0} emptyText="No tasks completed">
      {wrap(
        <div className="space-y-1.5">
          {tasksCompleted.map(t => (
            <TaskDueItem key={t.id} task={t} compact={compact} />
          ))}
        </div>,
        LIST_BOX_HEIGHT
      )}
    </ListSection>
  );

  const planSection = (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">Plan</h3>
      {wrap(
        <CategoryDonutChart categories={donutCategories} size={compact ? 128 : 168} emptyMessage="No estimated hours today" />,
        196
      )}
    </section>
  );

  const actualSection = (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">Actual</h3>
      {wrap(
        <CategoryDonutChart categories={actualDonutCategories} size={compact ? 128 : 168} emptyMessage="No hours worked today" />,
        196
      )}
    </section>
  );

  const plannedWeekSection = (
    <section className="flex flex-col min-h-0">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2 flex-shrink-0">Planned Week</h3>
      <div className="flex-1 min-h-0">
        <WeekTrendLineChart days={weekDays} rangeLabel={rangeLabel} svgClassName="w-full flex-1 min-h-0" />
      </div>
    </section>
  );

  const actualWeekSection = (
    <section className="flex flex-col min-h-0">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2 flex-shrink-0">Actual Week</h3>
      <div className="flex-1 min-h-0">
        <WeekTrendLineChart days={actualWeekDays} rangeLabel={rangeLabel} svgClassName="w-full flex-1 min-h-0" />
      </div>
    </section>
  );

  return (
    <div className="space-y-5">
      <div className={`grid grid-cols-2 ${compact ? 'sm:grid-cols-3 xl:grid-cols-5' : 'sm:grid-cols-5'} gap-2.5`}>
        <SummaryTile
          icon={<CalendarClock className="w-3.5 h-3.5" />}
          label="Events"
          value={`${events.length}`}
          detail={eventsDetail}
          color="var(--tm-accent)"
          bg="color-mix(in srgb, var(--tm-accent) 10%, var(--tm-surface))"
        />
        <SummaryTile icon={<Flame className="w-3.5 h-3.5" />} label="Habits" value={`${habitsCompleted.length}/${totalHabits}`} color="#F97316" bg="var(--tm-warning-subtle)" />
        <SummaryTile icon={<SquareCheck className="w-3.5 h-3.5" />} label="Tasks due" value={`${tasksDue.length}`} color="var(--tm-danger)" bg="var(--tm-danger-subtle)" />
        <SummaryTile icon={<CheckCircle2 className="w-3.5 h-3.5" />} label="Tasks completed" value={`${tasksCompleted.length}`} color="var(--tm-success)" bg="var(--tm-success-subtle)" />
        <SummaryTile icon={<FileText className="w-3.5 h-3.5" />} label="Notes edited" value={`${notesEdited.length}`} color="var(--tm-accent)" bg="var(--tm-accent-subtle)" />
      </div>

      {eventsSection}

      <div className={`grid grid-cols-1 ${compact ? 'sm:grid-cols-2' : 'xl:grid-cols-2'} gap-5`}>
        {habitsSection}
        {tasksDueSection}
        {notesSection}
        {tasksCompletedSection}
        {planSection}
        {actualSection}
        {plannedWeekSection}
        {actualWeekSection}
      </div>
    </div>
  );
};

export default DaySummary;
