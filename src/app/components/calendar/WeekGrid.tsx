'use client';

import React, { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckCircle2, Circle, FileText, Flame } from 'lucide-react';
import {
  AllDayItem,
  formatMinutes,
  layoutDayEvents,
  MINUTES_PER_DAY,
  PositionedEvent,
  SLOT_MINUTES,
  TimedEvent,
  WorkDayMarks,
} from '@/app/utils/weekLayout';

const HOUR_PX = 48;
const SLOT_PX = (HOUR_PX * SLOT_MINUTES) / 60;
const SLOTS_PER_DAY = MINUTES_PER_DAY / SLOT_MINUTES;
const GUTTER_REM = 3.5;
const GRID_COLUMNS = `${GUTTER_REM}rem repeat(7, minmax(0, 1fr))`;

const minutesToPx = (minutes: number) => (minutes * HOUR_PX) / 60;

/** A kind's block tint: a little of its color over the surface, so tints differ by hue too. */
const kindStyle = (color: string) => ({ bg: `color-mix(in srgb, ${color} 14%, var(--tm-surface))`, edge: color });

const KIND_STYLE: Record<TimedEvent['kind'] | 'habit', { bg: string; edge: string }> = {
  task: kindStyle('var(--tm-week-task)'),
  completed: kindStyle('var(--tm-week-completed)'),
  note: kindStyle('var(--tm-week-note)'),
  habit: kindStyle('var(--tm-week-habit)'),
};

/** The grid's own height; it scrolls the hours inside. A taller box (a dragged week view) stretches it. */
const WEEK_GRID_HEIGHT = 'max(420px, min(72vh, 760px))';

/** Hours outside the work window: a flat wash of the muted text color. */
const OFF_HOURS_BG = 'color-mix(in srgb, var(--tm-text-muted) 9%, transparent)';
/** Rest days: the same wash, hatched, so a day off reads differently from an evening. */
const REST_DAY_BG = 'repeating-linear-gradient(135deg, color-mix(in srgb, var(--tm-text-muted) 14%, transparent) 0 5px, transparent 5px 10px)';
/** The lines where the work window opens and closes. */
const WINDOW_EDGE = 'color-mix(in srgb, var(--tm-accent) 55%, transparent)';

/** Swatches for the work schedule, shown after WEEK_LEGEND. */
export const WORK_DAY_LEGEND = [
  { label: 'Outside work hours', background: OFF_HOURS_BG },
  { label: 'Rest day', background: REST_DAY_BG },
];

export const WEEK_LEGEND = [
  { label: 'Planned task', ...KIND_STYLE.task },
  { label: 'Completed', ...KIND_STYLE.completed },
  { label: 'Note session', ...KIND_STYLE.note },
  { label: 'Habit', ...KIND_STYLE.habit },
];

const dayLabel = (day: Date) =>
  day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

/** "45 min worked" / "1 hr 10 min worked" for a note block. */
const workedText = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${minutes} min worked`;
  return rest === 0 ? `${hours} hr worked` : `${hours} hr ${rest} min worked`;
};

const timedLabel = (e: TimedEvent): string => {
  if (e.kind === 'completed') return `Completed task: ${e.title}, at ${formatMinutes(e.startMin)}`;
  const range = `${formatMinutes(e.startMin)} – ${formatMinutes(e.endMin)}`;
  if (e.kind === 'note') return `Note session: ${e.title}, ${range}, ${workedText(e.workedMin ?? 0)}`;
  return `${e.completed ? 'Planned task (done)' : 'Planned task'}: ${e.title}, ${range}`;
};

interface WeekGridProps {
  days: Date[];
  timed: TimedEvent[];
  allDay: AllDayItem[];
  /** Each day's rest-day flag and work window (see workDayMarks), in the order of `days`. */
  workDays: WorkDayMarks[];
  /** Index of today's column, or null when today isn't in this week. */
  todayIndex: number | null;
  nowMinutes: number;
  /** Minutes from midnight to bring into view whenever `scrollKey` changes. */
  scrollToMinutes: number;
  scrollKey: number;
  canOpenTask: (taskId: number) => boolean;
  canOpenHabit: (habitId: number) => boolean;
  onCreateAt: (day: Date, minutes: number | null) => void;
  onOpenTask: (taskId: number) => void;
  onOpenNote: (noteId: number) => void;
  onOpenHabit: (habitId: number) => void;
  /** Fill the parent's remaining height (a flex column) instead of the grid's own height. */
  fill?: boolean;
}

/**
 * Seven day columns over a 24-hour time grid. The empty grid is made of
 * half-hour slot buttons (one roving tab stop, arrow keys to move, Enter to
 * create a task there); planned tasks, completions and note sessions sit on
 * top as blocks, and undated-time tasks and habit completions fill the
 * all-day row. Hours outside the user's work window are washed out and rest
 * days hatched, with dashed lines where the window opens and closes. Scrolls
 * both ways inside its own box, with the day headers and hour gutter pinned,
 * so it stays usable at phone width.
 */
const WeekGrid: React.FC<WeekGridProps> = ({
  days, timed, allDay, workDays, todayIndex, nowMinutes, scrollToMinutes, scrollKey,
  canOpenTask, canOpenHabit, onCreateAt, onOpenTask, onOpenNote, onOpenHabit, fill = false,
}) => {
  const hintId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [focusedSlot, setFocusedSlot] = useState(() => ({
    day: todayIndex ?? 0,
    slot: Math.floor(scrollToMinutes / SLOT_MINUTES),
  }));

  const positionedByDay = useMemo(() => {
    const byDay: PositionedEvent[][] = days.map(() => []);
    const grouped: TimedEvent[][] = days.map(() => []);
    for (const e of timed) grouped[e.dayIndex]?.push(e);
    grouped.forEach((events, i) => { byDay[i] = layoutDayEvents(events); });
    return byDay;
  }, [days, timed]);

  const allDayByDay = useMemo(() => {
    const byDay: AllDayItem[][] = days.map(() => []);
    for (const item of allDay) byDay[item.dayIndex]?.push(item);
    return byDay;
  }, [days, allDay]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // A little headroom so the target hour's label isn't tucked under the sticky header.
    el.scrollTop = Math.max(0, minutesToPx(scrollToMinutes) - 12);
    if (todayIndex !== null && el.scrollWidth > el.clientWidth) {
      const gutterPx = GUTTER_REM * parseFloat(getComputedStyle(document.documentElement).fontSize);
      el.scrollLeft = todayIndex * ((el.scrollWidth - gutterPx) / 7);
    }
    // Only re-scroll when asked to (mount, "Today"), not on every prop change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollKey]);

  const handleSlotKeyDown = (e: React.KeyboardEvent, day: number, slot: number) => {
    const moves: Record<string, [number, number]> = {
      ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
      Home: [0, -slot], End: [0, SLOTS_PER_DAY - 1 - slot],
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    const next = {
      day: Math.min(6, Math.max(0, day + move[0])),
      slot: Math.min(SLOTS_PER_DAY - 1, Math.max(0, slot + move[1])),
    };
    setFocusedSlot(next);
    slotRefs.current[next.day * SLOTS_PER_DAY + next.slot]?.focus();
  };

  return (
    <div
      ref={scrollRef}
      className={`relative overflow-auto scrollbar-custom rounded-xl border border-border ${fill ? 'flex-1 min-h-0' : 'grow'}`}
      style={{ backgroundColor: 'var(--tm-surface)', height: fill ? undefined : WEEK_GRID_HEIGHT }}
    >
      <div className="min-w-[42rem]">
        {/* Day headers + all-day row, pinned to the top while the hours scroll. */}
        <div className="sticky top-0 z-30 border-b border-border" style={{ backgroundColor: 'var(--tm-surface)' }}>
          <div className="grid" style={{ gridTemplateColumns: GRID_COLUMNS }}>
            <div className="sticky left-0 z-10" style={{ backgroundColor: 'var(--tm-surface)' }} />
            {days.map((day, i) => {
              const isToday = i === todayIndex;
              const { rest } = workDays[i];
              return (
                <div
                  key={i}
                  aria-current={isToday ? 'date' : undefined}
                  title={rest ? 'Rest day' : undefined}
                  className="flex flex-col items-center py-2 border-l border-border-subtle"
                  style={rest ? { backgroundImage: REST_DAY_BG } : undefined}
                >
                  <span
                    className="text-[11px] font-semibold uppercase tracking-wide"
                    style={{ color: isToday ? 'var(--tm-accent)' : 'var(--tm-text-muted)' }}
                  >
                    {day.toLocaleDateString('en-US', { weekday: 'short' })}
                  </span>
                  <span
                    className="mt-0.5 w-8 h-8 flex items-center justify-center rounded-full text-base font-bold"
                    style={isToday
                      ? { backgroundColor: 'var(--tm-accent)', color: 'var(--tm-accent-text)' }
                      : { color: 'var(--tm-text-primary)' }}
                  >
                    {day.getDate()}
                  </span>
                  <span className="sr-only">{workDayText(workDays[i])}</span>
                </div>
              );
            })}
          </div>

          <div className="grid border-t border-border-subtle" style={{ gridTemplateColumns: GRID_COLUMNS }}>
            <div
              className="sticky left-0 z-10 flex items-start justify-end pr-2 pt-1.5 text-[10px] font-medium text-text-muted"
              style={{ backgroundColor: 'var(--tm-surface)' }}
            >
              All day
            </div>
            {allDayByDay.map((items, i) => (
              <div
                key={i}
                className="relative min-h-9 border-l border-border-subtle"
                style={workDays[i].rest ? { backgroundImage: REST_DAY_BG } : undefined}
              >
                <button
                  type="button"
                  onClick={() => onCreateAt(days[i], null)}
                  aria-label={`Create task on ${dayLabel(days[i])} with no time`}
                  className="absolute inset-0 w-full h-full hover:bg-[var(--tm-accent-subtle)] focus-visible:bg-[var(--tm-accent-subtle)] transition-colors"
                  style={{ outlineOffset: -2 }}
                />
                <div className="relative z-10 flex flex-col gap-0.5 p-1 max-h-24 overflow-y-auto scrollbar-custom pointer-events-none">
                  {items.map(item => (
                    <AllDayChip
                      key={item.key}
                      item={item}
                      openable={item.kind === 'habit' ? canOpenHabit(item.habitId!) : canOpenTask(item.taskId!)}
                      onOpen={() => (item.kind === 'habit' ? onOpenHabit(item.habitId!) : onOpenTask(item.taskId!))}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Time grid */}
        <div className="grid" style={{ gridTemplateColumns: GRID_COLUMNS }}>
          <div className="sticky left-0 z-20" style={{ backgroundColor: 'var(--tm-surface)', height: minutesToPx(MINUTES_PER_DAY) }}>
            {Array.from({ length: 23 }, (_, h) => h + 1).map(h => (
              <span
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[10px] font-medium text-text-muted whitespace-nowrap"
                style={{ top: h * HOUR_PX }}
              >
                {formatMinutes(h * 60).replace(':00', '')}
              </span>
            ))}
          </div>

          <p id={hintId} className="sr-only">
            Use the arrow keys to move between half-hour slots and Enter to create a task at that time.
          </p>
          {days.map((day, dayIndex) => {
            const isToday = dayIndex === todayIndex;
            const marks = workDays[dayIndex];
            return (
              <div
                key={dayIndex}
                data-rest-day={marks.rest || undefined}
                className="relative border-l border-border-subtle"
                style={{
                  height: minutesToPx(MINUTES_PER_DAY),
                  backgroundColor: isToday ? 'color-mix(in srgb, var(--tm-accent) 4%, transparent)' : undefined,
                  backgroundImage: 'linear-gradient(to bottom, var(--tm-border-subtle) 1px, transparent 1px)',
                  backgroundSize: `100% ${HOUR_PX}px`,
                }}
              >
                {marks.off.map(([start, end]) => (
                  <div
                    key={start}
                    aria-hidden
                    data-off-hours
                    className="absolute left-0 right-0 pointer-events-none"
                    style={{
                      top: minutesToPx(start),
                      height: minutesToPx(end - start),
                      background: marks.rest ? REST_DAY_BG : OFF_HOURS_BG,
                    }}
                  />
                ))}
                {marks.opensAt !== null && <WindowEdge minutes={marks.opensAt} edge="opens" />}
                {marks.closesAt.map(minutes => <WindowEdge key={minutes} minutes={minutes} edge="closes" />)}

                {Array.from({ length: SLOTS_PER_DAY }, (_, slot) => {
                  const minutes = slot * SLOT_MINUTES;
                  const isFocusTarget = focusedSlot.day === dayIndex && focusedSlot.slot === slot;
                  return (
                    <button
                      key={slot}
                      ref={el => { slotRefs.current[dayIndex * SLOTS_PER_DAY + slot] = el; }}
                      type="button"
                      tabIndex={isFocusTarget ? 0 : -1}
                      onClick={() => onCreateAt(day, minutes)}
                      onFocus={() => { if (!isFocusTarget) setFocusedSlot({ day: dayIndex, slot }); }}
                      onKeyDown={e => handleSlotKeyDown(e, dayIndex, slot)}
                      aria-label={`Create task on ${dayLabel(day)} at ${formatMinutes(minutes)}`}
                      aria-describedby={hintId}
                      className="group relative block w-full text-left px-1 hover:bg-[var(--tm-accent-subtle)] focus-visible:bg-[var(--tm-accent-subtle)] transition-colors"
                      style={{ height: SLOT_PX, outlineOffset: -2 }}
                    >
                      <span className="text-[10px] font-medium opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" style={{ color: 'var(--tm-accent)' }}>
                        + {formatMinutes(minutes)}
                      </span>
                    </button>
                  );
                })}

                {isToday && (
                  <div
                    aria-hidden
                    className="absolute left-0 right-0 z-20 pointer-events-none"
                    style={{ top: minutesToPx(nowMinutes) }}
                  >
                    <div className="relative h-0.5" style={{ backgroundColor: 'var(--tm-danger)' }}>
                      <span className="absolute -left-1 -top-1 w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'var(--tm-danger)' }} />
                    </div>
                  </div>
                )}

                <div className="absolute inset-0 z-10 pointer-events-none">
                  {positionedByDay[dayIndex].map(e => (
                    <EventBlock
                      key={e.key}
                      event={e}
                      openable={e.kind === 'note' || canOpenTask(e.taskId!)}
                      onOpen={() => (e.kind === 'note' ? onOpenNote(e.noteId!) : onOpenTask(e.taskId!))}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/** "10:00 PM", or "midnight" for the bottom of the day. */
const edgeTime = (minutes: number) => (minutes >= MINUTES_PER_DAY ? 'midnight' : formatMinutes(minutes));

/** "Work day, opens at 8:00 AM, closes at 10:00 PM" or "Rest day" for a day header's screen-reader text. */
const workDayText = ({ rest, opensAt, closesAt }: WorkDayMarks): string => {
  const edges = [
    ...(opensAt === null ? [] : [{ at: opensAt, text: `opens at ${formatMinutes(opensAt)}` }]),
    ...closesAt.map(at => ({ at, text: `closes at ${edgeTime(at)}` })),
  ].sort((x, y) => x.at - y.at);
  const day = rest ? 'Rest day' : 'Work day';
  return edges.length ? `${day}, work window ${edges.map(e => e.text).join(', ')}` : day;
};

/** A dashed line where the work window opens or closes, labelled on the side away from the off hours. */
const WindowEdge: React.FC<{ minutes: number; edge: 'opens' | 'closes' }> = ({ minutes, edge }) => (
  <div
    aria-hidden
    data-window-edge={edge}
    className="absolute left-0 right-0 pointer-events-none"
    style={{ top: Math.min(minutesToPx(minutes), minutesToPx(MINUTES_PER_DAY) - 1), borderTop: `1px dashed ${WINDOW_EDGE}` }}
  >
    <span
      className="absolute right-1 text-[9px] font-semibold leading-none whitespace-nowrap"
      style={{ color: 'var(--tm-accent)', ...(edge === 'opens' ? { top: 2 } : { bottom: 2 }) }}
    >
      {edge === 'opens' ? 'Opens' : 'Closes'} {edgeTime(minutes)}
    </span>
  </div>
);

const EventBlock: React.FC<{ event: PositionedEvent; openable: boolean; onOpen: () => void }> = ({ event, openable, onOpen }) => {
  const { bg, edge } = KIND_STYLE[event.kind];
  const height = minutesToPx(event.drawEndMin - event.drawStartMin);
  const label = timedLabel(event);
  const Icon = event.kind === 'note' ? FileText : event.kind === 'completed' ? CheckCircle2 : event.completed ? Check : null;
  const range = `${formatMinutes(event.startMin)} – ${formatMinutes(event.endMin)}`;
  const timeText = event.kind === 'completed'
    ? formatMinutes(event.startMin)
    : event.kind === 'note' ? `${range} · ${workedText(event.workedMin ?? 0)}` : range;
  const style: React.CSSProperties = {
    top: minutesToPx(event.drawStartMin),
    height,
    left: `calc(${(event.column / event.columns) * 100}% + 2px)`,
    width: `calc(${100 / event.columns}% - 4px)`,
    backgroundColor: bg,
    borderLeft: `3px solid ${edge}`,
    opacity: event.kind === 'task' && event.completed ? 0.7 : 1,
  };
  const content = (
    <>
      <span className="flex items-center gap-1 min-w-0">
        {Icon && <Icon className="w-3 h-3 flex-shrink-0" style={{ color: edge }} />}
        <span className={`truncate font-semibold ${event.kind === 'task' && event.completed ? 'line-through' : ''}`}>{event.title}</span>
      </span>
      {height >= 34 && <span className="truncate text-text-secondary">{timeText}</span>}
    </>
  );
  const className = 'absolute pointer-events-auto flex flex-col items-start overflow-hidden rounded-md px-1.5 py-0.5 text-left text-[11px] leading-tight text-text-primary shadow-sm';

  if (!openable) {
    return <div className={className} style={style} title={label} aria-label={label} role="note">{content}</div>;
  }
  return (
    <button type="button" onClick={onOpen} className={`${className} hover:brightness-95 transition-[filter]`} style={style} title={label} aria-label={label}>
      {content}
    </button>
  );
};

const AllDayChip: React.FC<{ item: AllDayItem; openable: boolean; onOpen: () => void }> = ({ item, openable, onOpen }) => {
  const { bg, edge } = KIND_STYLE[item.kind];
  const label = item.kind === 'habit'
    ? `Habit completed: ${item.title}`
    : `${item.completed ? 'Planned task (done)' : 'Planned task'}: ${item.title}, no time set`;
  const Icon = item.kind === 'habit' ? Flame : item.completed ? Check : Circle;
  const className = 'pointer-events-auto flex items-center gap-1 w-full min-w-0 rounded px-1.5 py-0.5 text-left text-[11px] leading-tight text-text-primary';
  const style: React.CSSProperties = { backgroundColor: bg, borderLeft: `3px solid ${edge}`, opacity: item.kind === 'task' && item.completed ? 0.7 : 1 };
  const content = (
    <>
      <Icon className="w-3 h-3 flex-shrink-0" style={{ color: edge }} />
      <span className={`truncate font-medium ${item.kind === 'task' && item.completed ? 'line-through' : ''}`}>{item.title}</span>
    </>
  );

  if (!openable) {
    return <div className={className} style={style} title={label} aria-label={label} role="note">{content}</div>;
  }
  return (
    <button type="button" onClick={onOpen} className={`${className} hover:brightness-95 transition-[filter]`} style={style} title={label} aria-label={label}>
      {content}
    </button>
  );
};

export default WeekGrid;
