'use client';

import React from 'react';
import { CalendarClock } from 'lucide-react';
import TagChipList from '@/app/components/common/TagChipList';
import type { DailyDebriefReport, DebriefTaskItem } from '@/app/types/debrief';
import type { EventOccurrence } from '@/app/types/event';
import type { ProfileFields } from '@/app/hooks/useProfile';
import { dayWindowOn } from '@/app/lib/restDays';
import { parseLocalDate } from '@/app/utils/dateUtils';
import { formatTime12Hour } from '@/app/utils/taskUtils';
import {
  formatClock,
  formatEventMinutes,
  formatEventTime,
  occurrenceKey,
  occurrencesStartingOn,
  occurrenceSpanOn,
  spansOverlap,
  timeToMinutes,
} from '@/app/utils/eventOccurrences';
import { eventColor } from '@/app/utils/events';

const DAY_MINUTES = 24 * 60;

interface Span {
  start: number;
  end: number;
}

interface TimedEvent {
  event: EventOccurrence;
  span: Span;
}

/** Minutes since midnight as "1 PM" / "1:30 PM". */
const clockAt = (minutes: number) => {
  const m = Math.round(minutes) % DAY_MINUTES;
  return formatClock(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
};

/** Today's work window in minutes; one past midnight is cut at midnight. Null on a rest day. */
function workWindow(date: Date, profile: ProfileFields, isRestDay: boolean): Span | null {
  if (isRestDay) return null;
  const { start, end } = dayWindowOn(date.getDay(), profile.dayStartTime, profile.shutoffTime, profile.dayWindows);
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  return { start: s, end: e > s ? e : DAY_MINUTES };
}

/** The open tasks due today at a time that falls inside a live event. */
function taskClashes(tasks: DebriefTaskItem[], live: TimedEvent[]): { task: DebriefTaskItem; event: TimedEvent }[] {
  const clashes: { task: DebriefTaskItem; event: TimedEvent }[] = [];
  for (const task of tasks) {
    if (!task.due_time) continue;
    const at = timeToMinutes(task.due_time);
    const event = live.find(t => at >= t.span.start && at < t.span.end);
    if (event) clashes.push({ task, event });
  }
  return clashes;
}

interface BriefScheduleProps {
  debrief: DailyDebriefReport;
  profile: ProfileFields;
  /** The current time; the brief passes its own so tests can fix it. */
  now?: Date;
}

/**
 * Today's schedule in the daily brief: a strip from the work window's start
 * to its end (wider when an event falls outside it) with today's events in
 * their tag colors (only events that start today), ticks for tasks due at a time, and a line at now. Below
 * it, every event today (all-day ones first, then by start time) with its
 * time, tags and whether it has passed, is on now or is coming up, then how
 * much event time there is and how much of the work window is left
 * after events and tasks due, then any clashes: a task due during an event,
 * an event outside the work window (which doesn't take from your free time), or two events
 * that overlap. Shown on rest days too; hidden when no event starts today.
 */
const BriefSchedule: React.FC<BriefScheduleProps> = ({ debrief, profile, now = new Date() }) => {
  const today = debrief.report_date;
  const events = occurrencesStartingOn(debrief.events_today, today);
  if (events.length === 0) return null;

  const { workload } = debrief;
  const workSpan = workWindow(parseLocalDate(today), profile, workload.is_rest_day);
  const timed: TimedEvent[] = events.flatMap(event => {
    const span = occurrenceSpanOn(event, today);
    return span ? [{ event, span }] : [];
  });
  const listed = [...events].sort((a, b) => Number(b.all_day) - Number(a.all_day) || a.starts_at.localeCompare(b.starts_at));
  const live = timed.filter(t => !t.event.archived);

  const starts = [...timed.map(t => t.span.start), ...(workSpan ? [workSpan.start] : [])];
  const ends = [...timed.map(t => t.span.end), ...(workSpan ? [workSpan.end] : [])];
  const lo = starts.length ? Math.floor(Math.min(...starts) / 60) * 60 : 8 * 60;
  const hi = Math.max(lo + 60, ends.length ? Math.ceil(Math.max(...ends) / 60) * 60 : 22 * 60);
  const pct = (m: number) => `${((Math.min(Math.max(m, lo), hi) - lo) / (hi - lo)) * 100}%`;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const current = live.find(t => t.span.start <= nowMinutes && nowMinutes < t.span.end);
  const next = live.find(t => t.span.start > nowMinutes);
  const tasksAtTime = debrief.due_today_tasks.filter(t => t.due_time);
  const clashes = taskClashes(tasksAtTime, live);
  const clashIds = new Set(clashes.map(c => c.task.id));
  const outside = workSpan
    ? live.filter(t => t.span.start < workSpan.start || t.span.end > workSpan.end).map(t => ({
      ...t,
      fully: t.span.end <= workSpan.start || t.span.start >= workSpan.end,
    }))
    : [];
  const overlaps: [TimedEvent, TimedEvent][] = [];
  live.forEach((a, i) => live.slice(i + 1).forEach(b => { if (spansOverlap(a.span, b.span)) overlaps.push([a, b]); }));

  const liveMinutes = live.reduce((sum, t) => sum + t.span.end - t.span.start, 0);
  const liveCount = events.filter(e => !e.archived).length;
  const axis: number[] = [];
  for (let m = lo; m <= hi; m += 120) axis.push(m);
  const describe = timed.map(t => `${t.event.title} ${formatEventTime(t.event)}${t.event.archived ? ' (archived)' : ''}`);

  return (
    <div
      data-brief-schedule
      className="rounded-md p-3"
      style={{ backgroundColor: 'var(--tm-surface-raised)', border: '1px solid var(--tm-border)' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-2">
        <div className="flex items-center gap-1.5" style={{ color: 'var(--tm-accent)' }}>
          <CalendarClock className="w-4 h-4" />
          <span className="text-xs font-semibold uppercase tracking-wide">Today&apos;s schedule</span>
        </div>
        <span className="text-[11px] text-text-secondary">
          {current ? (
            <>Now: <span className="font-semibold text-text-primary">{current.event.title}</span> until {clockAt(current.span.end)}</>
          ) : next ? (
            <>
              Next: <span className="font-semibold text-text-primary">{next.event.title}</span> at {clockAt(next.span.start)}
              {' · '}in {formatEventMinutes(next.span.start - nowMinutes)}
            </>
          ) : (
            'No more events today'
          )}
        </span>
      </div>

      {timed.length > 0 && (
        <div
          role="img"
          aria-label={`Today's schedule from ${clockAt(lo)} to ${clockAt(hi)}: ${describe.join(', ')}`}
          className="relative h-9 mt-7 mb-5 rounded-md"
          style={{ backgroundColor: 'var(--tm-surface)', border: '1px solid var(--tm-border-subtle)' }}
        >
          {workSpan && (
            <div
              data-work-window
              className="absolute inset-y-0"
              style={{
                left: pct(workSpan.start),
                width: `calc(${pct(workSpan.end)} - ${pct(workSpan.start)})`,
                backgroundColor: 'color-mix(in srgb, var(--tm-success) 12%, transparent)',
              }}
            />
          )}
          {timed.map(({ event, span }) => {
            const color = eventColor(event.tags);
            return (
              <div
                key={occurrenceKey(event)}
                data-schedule-event
                title={`${event.title} · ${formatEventTime(event)}${event.archived ? ' · archived' : ''}`}
                className="absolute top-1 bottom-1 rounded-sm px-1 overflow-hidden text-[10px] font-semibold leading-7 whitespace-nowrap text-ellipsis text-text-primary"
                style={{
                  left: pct(span.start),
                  width: `calc(${pct(span.end)} - ${pct(span.start)})`,
                  borderLeft: `2px solid ${color}`,
                  background: event.archived
                    ? `repeating-linear-gradient(135deg, color-mix(in srgb, ${color} 18%, var(--tm-surface)) 0 4px, var(--tm-surface) 4px 8px)`
                    : `color-mix(in srgb, ${color} ${event.past ? 16 : 30}%, var(--tm-surface))`,
                  opacity: event.past && !event.archived ? 0.7 : 1,
                  textDecoration: event.archived ? 'line-through' : undefined,
                }}
              >
                {event.title}
              </div>
            );
          })}
          {tasksAtTime.map((task, i) => {
            const at = timeToMinutes(task.due_time!);
            if (at < lo || at > hi) return null;
            const clash = clashIds.has(task.id);
            const nearEnd = (at - lo) / (hi - lo) > 0.7;
            return (
              <div
                key={task.id}
                data-schedule-task
                className="absolute bottom-0 w-px"
                style={{
                  left: pct(at),
                  top: i % 2 ? -26 : -14,
                  borderLeft: `1.5px dotted ${clash ? 'var(--tm-warning)' : 'var(--tm-week-task)'}`,
                }}
              >
                <span
                  className={`absolute top-[-3px] whitespace-nowrap text-[9px] font-semibold ${nearEnd ? 'right-1' : 'left-1'}`}
                  style={{ color: clash ? 'var(--tm-warning)' : 'var(--tm-text-secondary)' }}
                >
                  {task.title.length > 18 ? `${task.title.slice(0, 17)}…` : task.title} · {clockAt(at)}
                </span>
              </div>
            );
          })}
          {nowMinutes >= lo && nowMinutes <= hi && (
            <div
              data-schedule-now
              className="absolute -top-1 -bottom-1 w-0.5 rounded-full"
              style={{ left: pct(nowMinutes), backgroundColor: 'var(--tm-danger)' }}
            />
          )}
          {axis.map((m, i) => (
            <span
              key={m}
              aria-hidden
              className={`absolute top-full mt-0.5 -translate-x-1/2 text-[9px] text-text-muted whitespace-nowrap ${i % 2 ? 'hidden sm:block' : ''}`}
              style={{ left: pct(m) }}
            >
              {clockAt(m)}
            </span>
          ))}
        </div>
      )}

      <ul data-schedule-list className="mb-2 space-y-1" aria-label="Today's events">
        {listed.map(event => (
          <ScheduleRow key={occurrenceKey(event)} event={event} isNow={current?.event === event} />
        ))}
      </ul>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-secondary">
        <span>
          <span className="font-semibold text-text-primary">{liveCount}</span> event{liveCount === 1 ? '' : 's'}
          {liveMinutes > 0 && <> · {formatEventMinutes(liveMinutes)}</>}
        </span>
        {!workload.is_rest_day && workload.free_minutes != null && (
          <span>
            <span className="font-semibold text-text-primary">{formatEventMinutes(workload.free_minutes)}</span> free in your work window after events and tasks due
          </span>
        )}
      </div>

      {(clashes.length > 0 || outside.length > 0 || overlaps.length > 0) && (
        <ul className="mt-2 space-y-1">
          {clashes.map(({ task, event }) => (
            <ClashLine key={`task-${task.id}`}>
              <b className="text-text-primary">{task.title}</b> is due at {formatTime12Hour(task.due_time)}, during{' '}
              <b className="text-text-primary">{event.event.title}</b>. Do it before {clockAt(event.span.start)} or after {clockAt(event.span.end)}.
            </ClashLine>
          ))}
          {outside.map(({ event, fully }) => (
            <ClashLine key={`out-${occurrenceKey(event)}`} muted>
              <b className="text-text-primary">{event.title}</b> ({formatEventTime(event)}){' '}
              {fully
                ? 'is outside your work window, so it doesn’t take from your free time today.'
                : 'runs outside your work window; only the part inside takes from your free time today.'}
            </ClashLine>
          ))}
          {overlaps.map(([a, b]) => (
            <ClashLine key={`overlap-${occurrenceKey(a.event)}-${occurrenceKey(b.event)}`}>
              <b className="text-text-primary">{a.event.title}</b> and <b className="text-text-primary">{b.event.title}</b> overlap.
            </ClashLine>
          ))}
        </ul>
      )}
    </div>
  );
};

/** One of today's events in the list under the strip. */
function ScheduleRow({ event, isNow }: { event: EventOccurrence; isNow: boolean }) {
  const color = eventColor(event.tags);
  const status = event.archived ? 'Archived' : event.past ? 'Passed' : isNow ? 'Now' : event.all_day ? null : 'Upcoming';
  return (
    <li
      data-schedule-row
      className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-sm py-1 pl-2 pr-1 text-xs"
      style={{ borderLeft: `3px solid ${color}`, opacity: event.past && !event.archived ? 0.75 : 1 }}
    >
      <span className="w-[7.5rem] flex-shrink-0 text-[11px] font-semibold tabular-nums text-text-secondary">{formatEventTime(event)}</span>
      <span className={`min-w-0 font-medium ${event.archived ? 'line-through text-text-muted' : 'text-text-primary'}`}>{event.title}</span>
      <TagChipList tags={event.tags} size="2xs" />
      {status && (
        <span
          className="ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none"
          style={
            status === 'Now'
              ? { color: 'var(--tm-surface)', backgroundColor: 'var(--tm-accent)' }
              : { color: 'var(--tm-text-muted)', border: '1px solid var(--tm-border)' }
          }
        >
          {status}
        </span>
      )}
    </li>
  );
}

function ClashLine({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <li className="flex items-start gap-1.5 text-[11px] text-text-secondary">
      <span
        aria-hidden
        className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: muted ? 'var(--tm-text-muted)' : 'var(--tm-warning)' }}
      />
      <span>{children}</span>
    </li>
  );
}

export default BriefSchedule;
