'use client';

import React, { useState } from 'react';
import {
  Flame, SquareCheck, FileText, Clock, CheckCircle2, Circle, CalendarClock, CalendarDays, Repeat, Archive, ChevronRight, Smile,
} from 'lucide-react';
import type { DayData } from '@/app/hooks/useYearCalendarData';
import type { ModalLayer } from '@/app/components/common/Modal';
import type { Task } from '@/app/types/task';
import type { Habit } from '@/app/types/habit';
import type { Note } from '@/app/types/notes';
import type { EventOccurrence } from '@/app/types/event';
import { ENERGY_LABELS, STRESS_LABELS, moodLabel, type MoodCheckin } from '@/app/types/mood';
import { parseLocalDate, toLocalDateStr, toLocalTimeStr, formatDurationShort } from '@/app/utils/dateUtils';
import { formatTime12Hour } from '@/app/utils/taskUtils';
import { bucketByTag } from '@/app/utils/tagBucketing';
import {
  formatClock,
  formatEventTime,
  occurrenceKey,
  occurrenceMinutesOn,
  occurrenceSpanOn,
  timeToMinutes,
} from '@/app/utils/eventOccurrences';
import { eventColor, repeatText } from '@/app/utils/events';
import {
  dayTimeline,
  daySentence,
  dayWhen,
  defaultOpenSections,
  minutesOnDay,
  minutesToClock,
  type DayWhen,
  type ReportSectionKey,
} from '@/app/utils/dayReport';
import { useNoteTimeTotalsForRange } from '@/app/hooks/useNoteTimeTotals';
import { useDayMoodCheckin } from '@/app/hooks/useDayMoodCheckin';
import { useWorkDay } from '@/app/hooks/useWorkDay';
import TagChipList from '@/app/components/common/TagChipList';
import { MoodFace, moodColor } from '@/app/components/mood/MoodFacePicker';
import DayMoodChip from './DayMoodChip';

interface DaySummaryProps {
  date: Date;
  data: DayData | undefined;
  totalHabits: number;
  /** All habits (whether or not they were done this day), listed in the Habits section. */
  allHabits: Habit[];
  /** Shows the day's check-in: its face and words, the Mood section and a chip to log or edit it. */
  showMood?: boolean;
  /** The check-in form's z-index tier, when the report sits inside another modal. */
  moodModalLayer?: ModalLayer;
}

const fmtHours = (hours: number): string => {
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
};

const normalizedTime = (t: Task): string | null =>
  typeof t.due_time === 'string' ? t.due_time : t.due_time instanceof Date ? toLocalTimeStr(t.due_time) : null;

// Every event the calendar shows is planned time; only the past ones that
// weren't archived (cancelled) count as time actually spent.
const happened = (e: EventOccurrence) => e.past && !e.archived;

interface TimeCategory {
  label: string;
  value: number;
  color: string;
}

// Hours spent, by tag: finished tasks and habits contribute their
// estimated_time (the closest proxy available for time actually spent),
// notes their tracked writing time for the day (noteTimeTotals, in seconds),
// and events that took place their length.
const timeByTag = (
  tasksCompleted: Task[],
  habitsCompleted: Habit[],
  notesEdited: Note[],
  noteTimeTotals: Record<number, number>,
  events: EventOccurrence[],
  dateStr: string,
): { buckets: TimeCategory[]; total: number } => {
  const items = [
    ...tasksCompleted.map(t => ({ tags: t.tags, value: t.estimated_time ?? 0 })),
    ...habitsCompleted.map(h => ({ tags: h.tags, value: h.estimated_time ?? 0 })),
    ...notesEdited.map(n => ({ tags: n.tags, value: (noteTimeTotals[n.id] ?? 0) / 3600 })),
    ...events.filter(happened).map(e => ({ tags: e.tags, value: occurrenceMinutesOn(e, dateStr) / 60 })),
  ];
  return {
    buckets: bucketByTag(items, i => i.value),
    total: items.reduce((sum, i) => sum + Math.max(i.value, 0), 0),
  };
};

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
 * One event in the day report: its time, title, tags, how it repeats and its
 * description. Archived ones are hatched and struck through, as on the
 * calendars. Only today's report marks the events already over as Past (and
 * fades them): on a past day every event is.
 */
function EventItem({ event, showPast }: { event: EventOccurrence; showPast: boolean }) {
  const color = eventColor(event.tags);
  const repeat = repeatText(event);
  const description = event.description?.trim() ?? '';
  const faded = showPast && event.past && !event.archived;
  return (
    <div
      data-event-row
      className="w-full p-2 rounded-md border border-border-subtle space-y-1 min-w-0"
      style={{
        borderLeft: `3px solid ${color}`,
        background: event.archived
          ? `repeating-linear-gradient(135deg, color-mix(in srgb, ${color} 8%, var(--tm-surface)) 0 5px, var(--tm-surface) 5px 10px)`
          : 'var(--tm-surface)',
        opacity: faded ? 0.75 : 1,
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
      {description && <p className="text-xs text-text-muted whitespace-pre-wrap line-clamp-1">{description}</p>}
      {(event.tags.length > 0 || repeat || event.archived || faded) && (
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
          ) : faded ? (
            <StatusChip muted>Past</StatusChip>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** A check-in's face in its mood color, or a dashed circle where none was logged. */
const DayFace: React.FC<{ mood: number | null; className?: string }> = ({ mood, className = 'w-5 h-5' }) =>
  mood ? (
    <span className={`${className} flex-shrink-0`} style={{ color: moodColor(mood) }}>
      <MoodFace mood={mood} filled className="w-full h-full" />
    </span>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="var(--tm-pencil)" strokeWidth={1.6} strokeDasharray="3 3" aria-hidden="true" className={`${className} flex-shrink-0`}>
      <circle cx="12" cy="12" r="10" />
    </svg>
  );

/** Five dots for a 1–5 answer, filled up to `value`. */
const Scale: React.FC<{ value: number; color: string }> = ({ value, color }) => (
  <span className="inline-flex gap-[3px]" aria-hidden="true">
    {[1, 2, 3, 4, 5].map(i => (
      <span key={i} className="w-2 h-2 rounded-full" style={{ backgroundColor: i <= value ? color : 'var(--tm-border-strong)' }} />
    ))}
  </span>
);

const Moment: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="rounded-full px-2 py-0.5 text-[11px] text-text-secondary" style={{ backgroundColor: 'var(--tm-slipped-subtle)' }}>
    {children}
  </span>
);

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-xs text-text-muted italic">{children}</p>
);

const SubHeading: React.FC<{ children: React.ReactNode; first?: boolean }> = ({ children, first }) => (
  <p className={`text-[11px] text-text-muted ${first ? 'mb-0.5' : 'mt-2 mb-0.5'}`}>{children}</p>
);

const SECTION_LOOK: Record<ReportSectionKey, { title: string; icon: React.ReactNode; color: string; bg: string }> = {
  events: { title: 'Events', icon: <CalendarClock className="w-3.5 h-3.5" />, color: 'var(--tm-accent)', bg: 'var(--tm-accent-subtle)' },
  tasks: { title: 'Tasks', icon: <SquareCheck className="w-3.5 h-3.5" />, color: 'var(--tm-week-completed)', bg: 'var(--tm-success-subtle)' },
  notes: { title: 'Notes', icon: <FileText className="w-3.5 h-3.5" />, color: 'var(--tm-week-note)', bg: 'color-mix(in srgb, var(--tm-week-note) 14%, transparent)' },
  habits: { title: 'Habits', icon: <Flame className="w-3.5 h-3.5" />, color: 'var(--tm-week-habit)', bg: 'var(--tm-warning-subtle)' },
  mood: { title: 'Mood', icon: <Smile className="w-3.5 h-3.5" />, color: 'var(--tm-mood-4)', bg: 'color-mix(in srgb, var(--tm-mood-4) 14%, transparent)' },
  time: { title: 'Where the time went', icon: <Clock className="w-3.5 h-3.5" />, color: 'var(--tm-text-secondary)', bg: 'var(--tm-strip)' },
};

interface ReportSectionProps {
  id: ReportSectionKey;
  count?: string | number | null;
  /** One line that stands in for the section while it's closed. */
  preview: string;
  open: boolean;
  onToggle: (open: boolean) => void;
  children: React.ReactNode;
}

// A section that folds to one line: its name, a count and a preview of what's in it.
const ReportSection: React.FC<ReportSectionProps> = ({ id, count, preview, open, onToggle, children }) => {
  const look = SECTION_LOOK[id];
  return (
    <details
      data-section={id}
      open={open}
      onToggle={e => onToggle(e.currentTarget.open)}
      className="group rounded-lg border border-border bg-surface-raised"
    >
      <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer flex items-center gap-2.5 px-3 py-2.5 min-w-0">
        <span className="w-[26px] h-[26px] rounded-md grid place-items-center flex-shrink-0" style={{ backgroundColor: look.bg, color: look.color }}>
          {look.icon}
        </span>
        <span className="text-sm font-bold text-text-primary flex-shrink-0">
          {look.title}
          {count != null && <span className="font-medium text-text-muted"> · {count}</span>}
        </span>
        <span data-preview className="text-xs text-text-muted truncate flex-1 min-w-0 group-open:invisible">{preview}</span>
        <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 transition-transform group-open:rotate-90" style={{ color: 'var(--tm-pencil)' }} aria-hidden />
      </summary>
      <div className="px-3 pb-3">{children}</div>
    </details>
  );
};

const shortDate = (d: string | Date) => parseLocalDate(toLocalDateStr(d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// One task as a single line: done or open, its title and tags, and when it was done or is due.
function TaskRow({ task, dateStr, when, alsoDone = false }: { task: Task; dateStr: string; when: DayWhen; alsoDone?: boolean }) {
  const time = normalizedTime(task);
  let meta: string;
  if (task.completed) {
    const at = minutesOnDay(task.completed_date, dateStr);
    meta = at === null ? 'Done' : `Done ${minutesToClock(at)}`;
    if (alsoDone) meta += task.due_date ? ` · was due ${shortDate(task.due_date)}` : ' · no due date';
  } else if (when === 'future') {
    meta = time ? `Due ${formatTime12Hour(time)}` : '';
  } else {
    meta = time ? `Due ${formatTime12Hour(time)} · still open` : 'Still open';
  }
  return (
    <div data-task-row className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1 min-w-0">
      {task.completed
        ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--tm-week-completed)' }} aria-label="Done" />
        : <Circle className="w-4 h-4 flex-shrink-0 text-text-muted" aria-label="Open" />}
      <span className={`text-sm font-medium truncate min-w-0 ${task.completed ? 'text-text-secondary' : 'text-text-primary'}`}>{task.title}</span>
      <TagChipList tags={task.tags} size="xs" />
      {meta && <span className="ml-auto text-[11px] text-text-muted">{meta}</span>}
    </div>
  );
}

// The day's report: a face and one plain sentence, count chips, then
// sections that fold to one line (Events as the day in order, Tasks, Notes,
// Habits, Mood and Where the time went). Shared by DayDetailModal (a month
// day clicked on the dashboard) and DaySummaryPanel (the calendar page).
const DaySummary: React.FC<DaySummaryProps> = ({ date, data, totalHabits, allHabits, showMood = false, moodModalLayer }) => {
  const habitsCompleted = data?.habitsCompleted ?? [];
  const tasksDue = data?.tasksDue ?? [];
  const tasksCompleted = data?.tasksCompleted ?? [];
  const notesEdited = data?.notesEdited ?? [];
  const events = data?.events ?? [];

  const dateStr = toLocalDateStr(date);
  const when = dayWhen(dateStr, toLocalDateStr(new Date()));
  const workDay = useWorkDay(date);
  const noteTimeTotals = useNoteTimeTotalsForRange(dateStr, dateStr);
  const moodShown = showMood && when !== 'future';
  const { checkin } = useDayMoodCheckin(moodShown ? dateStr : null);
  const [open, setOpen] = useState(() => defaultOpenSections(isPhoneNow()));
  const toggle = (key: ReportSectionKey) => (next: boolean) => setOpen(o => (o[key] === next ? o : { ...o, [key]: next }));

  const liveEvents = events.filter(e => !e.archived);
  const allDayEvents = events.filter(e => e.all_day);
  const dueIds = new Set(tasksDue.map(t => t.id));
  const tasksDueDone = tasksDue.filter(t => t.completed);
  const alsoDone = tasksCompleted.filter(t => !dueIds.has(t.id));
  const doneIds = new Set(habitsCompleted.map(h => h.id));
  const habits = [...allHabits, ...habitsCompleted.filter(h => !allHabits.some(a => a.id === h.id))];
  const noteSeconds = notesEdited.reduce((sum, n) => sum + (noteTimeTotals[n.id] ?? 0), 0);
  const { buckets: time, total: totalHours } = timeByTag(tasksCompleted, habitsCompleted, notesEdited, noteTimeTotals, events, dateStr);
  const bucketHours = time.reduce((sum, c) => sum + c.value, 0);
  const clashes = eventClashes(tasksDue, events, dateStr);

  // Undefined while the check-in loads, so the sentence doesn't say "No check-in" before it knows.
  const mood: MoodCheckin | null | undefined = moodShown ? checkin : undefined;
  const sentence = daySentence({
    when,
    rest: workDay?.rest ?? false,
    mood: mood === undefined ? undefined : mood?.mood ?? null,
    energy: mood?.energy,
    stress: mood?.stress,
    events: liveEvents.length,
    tasksDue: tasksDue.length,
    tasksDueDone: tasksDueDone.length,
    tasksDone: tasksCompleted.length,
    habitsDone: habitsCompleted.length,
    notes: notesEdited.length,
  });
  const empty = !events.length && !tasksDue.length && !tasksCompleted.length && !notesEdited.length && !habitsCompleted.length && !mood;

  const glance = (
    <div data-day-glance className="flex flex-wrap items-center gap-3 px-3.5 py-3 rounded-xl" style={{ backgroundColor: 'var(--tm-strip)' }}>
      {moodShown
        ? <DayFace mood={mood?.mood ?? null} className="w-10 h-10" />
        : <CalendarDays className="w-8 h-8 flex-shrink-0" style={{ color: 'var(--tm-accent)' }} aria-hidden />}
      <div className="min-w-0 flex-1 basis-48">
        <p data-day-sentence className="text-[15px] font-medium leading-snug text-text-primary">{sentence.main}</p>
        {sentence.sub && <p className="text-xs text-text-muted mt-0.5">{sentence.sub}</p>}
      </div>
      {moodShown && <DayMoodChip date={date} data={data} totalHabits={totalHabits} modalLayer={moodModalLayer} />}
    </div>
  );

  if (empty) return <div className="space-y-3">{glance}</div>;

  const tasksCount = tasksDue.length
    ? when === 'future' ? `${tasksDue.length} due` : `${tasksDueDone.length}/${tasksDue.length}`
    : `${tasksCompleted.length}`;
  const chip = (icon: React.ReactNode, color: string, children: React.ReactNode) => (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs border border-border bg-surface-raised text-text-secondary whitespace-nowrap">
      <span style={{ color }} className="inline-flex">{icon}</span>
      {children}
    </span>
  );
  const counts = (
    <div data-day-counts className="flex flex-wrap gap-1.5">
      {chip(<CalendarClock className="w-3.5 h-3.5" />, 'var(--tm-accent)', <><b className="text-text-primary">{liveEvents.length}</b> {liveEvents.length === 1 ? 'event' : 'events'}</>)}
      {chip(<SquareCheck className="w-3.5 h-3.5" />, 'var(--tm-week-completed)', <><b className="text-text-primary">{tasksCount}</b> {tasksDue.length === 1 || (!tasksDue.length && tasksCompleted.length === 1) ? 'task' : 'tasks'}</>)}
      {chip(<FileText className="w-3.5 h-3.5" />, 'var(--tm-week-note)', <><b className="text-text-primary">{notesEdited.length}</b> {notesEdited.length === 1 ? 'note' : 'notes'}</>)}
      {chip(<Flame className="w-3.5 h-3.5" />, 'var(--tm-week-habit)', <>habits <b className="text-text-primary">{habitsCompleted.length}/{totalHabits}</b></>)}
    </div>
  );

  // ── Events: all-day ones on top, then the day in order ──
  const timeline = dayTimeline({
    dateStr,
    events,
    tasksDone: tasksCompleted,
    checkinAt: mood?.created_at,
    window: workDay?.window,
  });
  const eventsPreview = events.length
    ? events.map(e => {
      const span = occurrenceSpanOn(e, dateStr);
      return `${span ? minutesToClock(span.start) : e.all_day || !e.start_time ? 'All day' : formatClock(e.start_time)} ${e.title}${e.archived ? ' (archived)' : ''}`;
    }).join(' · ')
    : 'None';
  const hasTimeline = timeline.some(t => t.kind === 'event');
  const eventsBody = !events.length ? <Empty>No events.</Empty> : (
    <div className="space-y-2">
      {allDayEvents.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {allDayEvents.map(e => <EventItem key={occurrenceKey(e)} event={e} showPast={when === 'today'} />)}
        </div>
      )}
      {hasTimeline && (
        <div data-timeline className="relative pl-[72px]">
          <span aria-hidden className="absolute left-[61px] top-1 bottom-1 w-0.5 rounded-sm" style={{ backgroundColor: 'var(--tm-border)' }} />
          {timeline.map(entry => {
            const node = (style: React.CSSProperties, size = 'w-3 h-3 -left-[16px] top-[7px]') => (
              <span aria-hidden className={`absolute ${size} rounded-full`} style={style} />
            );
            const label = (
              <span className="absolute -left-[72px] w-[50px] text-right top-[6px] text-[11px] font-medium text-text-muted whitespace-nowrap">
                {minutesToClock(entry.at)}
              </span>
            );
            if (entry.kind === 'event') {
              const c = entry.event.archived ? 'var(--tm-pencil)' : eventColor(entry.event.tags);
              return (
                <div key={`e-${occurrenceKey(entry.event)}`} data-timeline-entry="event" className="relative flex mb-1.5">
                  {label}{node({ backgroundColor: c })}
                  <EventItem event={entry.event} showPast={when === 'today'} />
                </div>
              );
            }
            if (entry.kind === 'task') {
              const { task } = entry;
              return (
                <div key={`t-${task.id}`} data-timeline-entry="task" className="relative flex flex-wrap items-center gap-x-2 gap-y-0.5 min-h-[26px] mb-1.5 text-[13px] min-w-0">
                  {label}{node({ backgroundColor: 'var(--tm-week-completed)' })}
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--tm-week-completed)' }} aria-hidden />
                  <span className="font-medium text-text-primary truncate min-w-0">{task.title}</span>
                  {!dueIds.has(task.id) && (
                    <span className="text-[11px] text-text-muted">{task.due_date ? `was due ${shortDate(task.due_date)}` : 'no due date'}</span>
                  )}
                  <span className="ml-auto"><TagChipList tags={task.tags} size="xs" /></span>
                </div>
              );
            }
            if (entry.kind === 'checkin' && mood) {
              return (
                <div key="checkin" data-timeline-entry="checkin" className="relative flex flex-wrap items-center gap-1.5 min-h-[26px] mb-1.5 text-[13px] min-w-0">
                  {label}{node({ border: `2px solid ${moodColor(mood.mood)}`, backgroundColor: 'var(--tm-surface)' })}
                  <DayFace mood={mood.mood} />
                  <span className="font-medium text-text-primary">Checked in: {moodLabel(mood.mood)}</span>
                  {mood.tags.map(m => <Moment key={m}>{m}</Moment>)}
                </div>
              );
            }
            if (entry.kind === 'window') {
              return (
                <div key={`w-${entry.edge}`} data-timeline-entry="window" className="relative flex items-center min-h-[20px] mb-1.5">
                  {label}{node({ backgroundColor: 'var(--tm-border-strong)' }, 'w-2 h-2 -left-[14px] top-[6px]')}
                  <span className="text-[11px] text-text-muted">Work window {entry.edge}</span>
                </div>
              );
            }
            return null;
          })}
        </div>
      )}
      {hasTimeline && timeline.some(t => t.kind === 'task' || t.kind === 'checkin') && (
        <p className="text-[11px] text-text-muted">
          {timeline.some(t => t.kind === 'checkin') ? 'Shows your finished tasks and check-in between events.' : 'Shows your finished tasks between events.'}
        </p>
      )}
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
  );

  // ── Tasks: due this day (done or still open), then the ones done from other days ──
  const openCount = tasksDue.length - tasksDueDone.length;
  const tasksPreview = [
    tasksDue.length ? (when === 'future' ? `${tasksDue.length} due` : `${tasksDueDone.length} of ${tasksDue.length} done`) : '',
    when !== 'future' && openCount ? `${openCount} still open` : '',
    alsoDone.length ? `+${alsoDone.length} from another day` : '',
  ].filter(Boolean).join(' · ') || 'None';
  const tasksBody = !tasksDue.length && !alsoDone.length ? <Empty>No tasks for this day.</Empty> : (
    <div>
      {tasksDue.length > 0 && (
        <>
          <SubHeading first>Due this day</SubHeading>
          {tasksDue.map(t => <TaskRow key={t.id} task={t} dateStr={dateStr} when={when} />)}
        </>
      )}
      {alsoDone.length > 0 && (
        <>
          <SubHeading first={!tasksDue.length}>Also done</SubHeading>
          {alsoDone.map(t => <TaskRow key={t.id} task={t} dateStr={dateStr} when={when} alsoDone />)}
        </>
      )}
    </div>
  );

  // ── Notes ──
  const notesPreview = notesEdited.length
    ? [noteSeconds > 0 ? `${formatDurationShort(noteSeconds)} writing` : '', notesEdited.map(n => n.title || 'Untitled Note').join(', ')].filter(Boolean).join(' · ')
    : 'None';
  const notesBody = !notesEdited.length ? <Empty>No notes edited.</Empty> : (
    <div>
      {notesEdited.map(n => (
        <div key={n.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1 min-w-0">
          <FileText className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--tm-week-note)' }} aria-hidden />
          <span className="text-sm font-medium text-text-primary truncate min-w-0">{n.title || 'Untitled Note'}</span>
          <TagChipList tags={n.tags} size="xs" />
          {(noteTimeTotals[n.id] ?? 0) > 0 && (
            <span className="ml-auto text-[11px] text-text-muted">{formatDurationShort(noteTimeTotals[n.id])} writing</span>
          )}
        </div>
      ))}
    </div>
  );

  // ── Habits: each one, done or not ──
  const habitsPreview = habitsCompleted.length ? habitsCompleted.map(h => h.title).join(', ') : 'None done';
  const habitsBody = !habits.length ? <Empty>No habits yet.</Empty> : (
    <div>
      {habits.map(h => {
        const done = doneIds.has(h.id);
        return (
          <div key={h.id} className="flex items-center gap-2 py-1 min-w-0">
            {done
              ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--tm-week-completed)' }} aria-label="Done" />
              : <Circle className="w-4 h-4 flex-shrink-0 text-text-muted" aria-label="Not done" />}
            <span className={`text-sm font-medium truncate min-w-0 ${done ? 'text-text-primary' : 'text-text-muted'}`}>{h.title}</span>
            {!done && when !== 'future' && <span className="ml-auto text-[11px] text-text-muted flex-shrink-0">{when === 'today' ? 'Not today' : 'Not done'}</span>}
          </div>
        );
      })}
    </div>
  );

  // ── Mood: the check-in's answers ──
  const moodPreview = mood
    ? [
      moodLabel(mood.mood),
      mood.energy ? `energy ${ENERGY_LABELS[mood.energy - 1].toLowerCase()}` : '',
      mood.stress ? `stress ${STRESS_LABELS[mood.stress - 1].toLowerCase()}` : '',
      mood.tags.join(', '),
    ].filter(Boolean).join(' · ')
    : 'No check-in';
  const checkedInAt = mood ? minutesOnDay(mood.created_at, dateStr) : null;
  const moodBody = !mood ? <Empty>No check-in for this day.</Empty> : (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2.5">
        <DayFace mood={mood.mood} className="w-6 h-6" />
        <b className="text-[15px] text-text-primary">{moodLabel(mood.mood)}</b>
        {checkedInAt !== null && <span className="text-[11px] text-text-muted">checked in at {minutesToClock(checkedInAt)}</span>}
      </div>
      {(mood.energy || mood.stress) && (
        <div className="grid grid-cols-[auto_auto_1fr] gap-x-2.5 gap-y-1 items-center text-xs">
          {mood.energy && <><span className="text-text-muted">Energy</span><Scale value={mood.energy} color="var(--tm-week-completed)" /><span className="text-text-primary">{ENERGY_LABELS[mood.energy - 1]}</span></>}
          {mood.stress && <><span className="text-text-muted">Stress</span><Scale value={mood.stress} color="var(--tm-week-habit)" /><span className="text-text-primary">{STRESS_LABELS[mood.stress - 1]}</span></>}
        </div>
      )}
      {mood.tags.length > 0 && (
        <div>
          <p className="text-[11px] text-text-muted mb-1">Moments</p>
          <div className="flex flex-wrap gap-1.5">{mood.tags.map(m => <Moment key={m}>{m}</Moment>)}</div>
        </div>
      )}
      {mood.note && <p className="text-xs text-text-secondary italic">“{mood.note}”</p>}
    </div>
  );

  // ── Where the time went: one bar by tag ──
  const timePreview = time.length ? time.slice(0, 3).map(c => `${c.label} ${fmtHours(c.value)}h`).join(' · ') : 'None';
  const timeBody = !time.length ? <Empty>{when === 'future' ? 'Nothing logged yet.' : 'No time logged.'}</Empty> : (
    <div>
      <div
        role="img"
        aria-label={time.map(c => `${c.label} ${fmtHours(c.value)} hours`).join(', ')}
        className="flex h-3 rounded-md overflow-hidden gap-0.5"
        style={{ backgroundColor: 'var(--tm-strip)' }}
      >
        {time.map(c => <span key={c.label} title={`${c.label} ${fmtHours(c.value)}h`} className="block h-full" style={{ width: `${(c.value / bucketHours) * 100}%`, backgroundColor: c.color }} />)}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-text-secondary">
        {time.map(c => (
          <span key={c.label} className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c.color }} />
            {c.label} <b className="text-text-primary">{fmtHours(c.value)}h</b>
          </span>
        ))}
      </div>
      <p className="text-[11px] text-text-muted mt-1.5">
        About {fmtHours(totalHours)}h in all: events that took place, tasks and habits you finished (their estimate) and time writing notes.
      </p>
    </div>
  );

  return (
    <div className="space-y-3">
      {glance}
      {counts}
      <div className="space-y-2">
        <ReportSection id="events" count={events.length} preview={eventsPreview} open={open.events} onToggle={toggle('events')}>{eventsBody}</ReportSection>
        <ReportSection id="tasks" count={tasksDue.length + alsoDone.length} preview={tasksPreview} open={open.tasks} onToggle={toggle('tasks')}>{tasksBody}</ReportSection>
        <ReportSection id="notes" count={notesEdited.length} preview={notesPreview} open={open.notes} onToggle={toggle('notes')}>{notesBody}</ReportSection>
        <ReportSection id="habits" count={`${habitsCompleted.length} of ${totalHabits}`} preview={habitsPreview} open={open.habits} onToggle={toggle('habits')}>{habitsBody}</ReportSection>
        {moodShown && (
          <ReportSection id="mood" preview={moodPreview} open={open.mood} onToggle={toggle('mood')}>{moodBody}</ReportSection>
        )}
        <ReportSection id="time" count={time.length ? `about ${fmtHours(totalHours)}h` : null} preview={timePreview} open={open.time} onToggle={toggle('time')}>{timeBody}</ReportSection>
      </div>
    </div>
  );
};

/** Phone-width screens, where the report opens with only Events showing. */
const isPhoneNow = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 767px)').matches;

export default DaySummary;
