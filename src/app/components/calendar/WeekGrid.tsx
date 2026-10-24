'use client';

import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Archive, CalendarDays, Check, CheckCircle2, Circle, FileText, Flame, Repeat } from 'lucide-react';
import {
  AllDayItem,
  DRAG_SNAP_MINUTES,
  EventPlacement,
  formatMinutes,
  layoutDayEvents,
  MINUTES_PER_DAY,
  parseTimeToMinutes,
  PositionedEvent,
  SLOT_MINUTES,
  TimedEvent,
  WorkDayMarks,
} from '@/app/utils/weekLayout';
import { eventColor } from '@/app/utils/events';

const HOUR_PX = 48;
const SLOT_PX = (HOUR_PX * SLOT_MINUTES) / 60;
const SLOTS_PER_DAY = MINUTES_PER_DAY / SLOT_MINUTES;
const GUTTER_REM = 3.5;
const GRID_COLUMNS = `${GUTTER_REM}rem repeat(7, minmax(0, 1fr))`;

const minutesToPx = (minutes: number) => (minutes * HOUR_PX) / 60;

/** A kind's block tint: a little of its color over the surface, so tints differ by hue too. */
const kindStyle = (color: string) => ({ bg: `color-mix(in srgb, ${color} 14%, var(--tm-surface))`, edge: color });

const KIND_STYLE: Record<Exclude<TimedEvent['kind'], 'event'> | 'habit', { bg: string; edge: string }> = {
  task: kindStyle('var(--tm-week-task)'),
  completed: kindStyle('var(--tm-week-completed)'),
  note: kindStyle('var(--tm-week-note)'),
  habit: kindStyle('var(--tm-week-habit)'),
};

/**
 * An event's block in its tag's color, with a full border so it never reads
 * as a task even when the tag is close to the task blue. A past event fades;
 * an archived one (always past on the calendar: upcoming archived ones are
 * left off) is hatched and dashed.
 */
export const eventStyle = (color: string, { past, archived }: Pick<EventPlacement, 'past' | 'archived'>): React.CSSProperties => {
  const mix = (pct: number, base = 'var(--tm-surface)') => `color-mix(in srgb, ${color} ${pct}%, ${base})`;
  if (archived) {
    return {
      background: `repeating-linear-gradient(135deg, ${mix(14)} 0 5px, var(--tm-surface) 5px 10px)`,
      border: `1px dashed ${mix(45, 'transparent')}`,
      borderLeft: `3px dashed ${color}`,
      color: 'var(--tm-text-muted)',
    };
  }
  if (past) {
    return {
      backgroundColor: mix(8),
      border: `1px solid ${mix(25, 'transparent')}`,
      borderLeft: `3px solid ${mix(60, 'transparent')}`,
      color: 'var(--tm-text-secondary)',
      opacity: 0.78,
    };
  }
  return { backgroundColor: mix(20), border: `1px solid ${mix(45, 'transparent')}`, borderLeft: `3px solid ${color}` };
};

/** The amber ring on a planned task that falls during an event. */
const CLASH_RING = '2px solid var(--tm-warning)';

/** The grid's own height; it scrolls the hours inside. A taller box (a dragged week view) stretches it. */
const WEEK_GRID_HEIGHT = 'max(420px, min(72vh, 760px))';

/** Hours outside the work window: a flat wash of the muted text color. */
const OFF_HOURS_BG = 'color-mix(in srgb, var(--tm-text-muted) 9%, transparent)';
/** Rest days: the same wash, hatched, so a day off reads differently from an evening. */
const REST_DAY_BG = 'repeating-linear-gradient(135deg, color-mix(in srgb, var(--tm-text-muted) 14%, transparent) 0 5px, transparent 5px 10px)';
/** The lines where the work window opens and closes. */
const WINDOW_EDGE = 'color-mix(in srgb, var(--tm-accent) 55%, transparent)';

/** A sample tag color for the legend's event swatches. */
const LEGEND_EVENT_COLOR = '#8b5cf6';

/** The week's legend: each kind's swatch, then the event states, then the work schedule. */
export const WEEK_LEGEND: { label: string; swatch: React.CSSProperties }[] = [
  { label: 'Planned task', swatch: { backgroundColor: KIND_STYLE.task.edge } },
  { label: 'Completed', swatch: { backgroundColor: KIND_STYLE.completed.edge } },
  { label: 'Note session', swatch: { backgroundColor: KIND_STYLE.note.edge } },
  { label: 'Habit', swatch: { backgroundColor: KIND_STYLE.habit.edge } },
  { label: 'Event (tag color)', swatch: eventStyle(LEGEND_EVENT_COLOR, { past: false, archived: false }) },
  { label: 'Past', swatch: { ...eventStyle(LEGEND_EVENT_COLOR, { past: true, archived: false }), opacity: 1 } },
  { label: 'Archived', swatch: eventStyle(LEGEND_EVENT_COLOR, { past: true, archived: true }) },
  { label: 'Clash', swatch: { outline: CLASH_RING, outlineOffset: -2 } },
  { label: 'Outside work hours', swatch: { background: OFF_HOURS_BG, border: '1px solid var(--tm-border-subtle)' } },
  { label: 'Rest day', swatch: { background: REST_DAY_BG, border: '1px solid var(--tm-border-subtle)' } },
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

/** "1:00 – 3:50 PM" for an event, from its own start and end rather than one day's piece of it. */
const eventRange = ({ occurrence }: EventPlacement): string => {
  const time = (t: string | null) => formatMinutes(parseTimeToMinutes(t ?? '') ?? 0);
  return `${time(occurrence.start_time)} – ${time(occurrence.end_time)}`;
};

/** ", past" / ", archived" for an event's screen-reader label. */
const eventState = ({ past, archived }: EventPlacement) => (archived ? ', archived' : past ? ', past' : '');

const timedLabel = (e: TimedEvent): string => {
  if (e.kind === 'completed') return `Completed task: ${e.title}, at ${formatMinutes(e.startMin)}`;
  const range = `${formatMinutes(e.startMin)} – ${formatMinutes(e.endMin)}`;
  if (e.kind === 'note') return `Note session: ${e.title}, ${range}, ${workedText(e.workedMin ?? 0)}`;
  if (e.kind === 'event' && e.event) {
    const runs = e.event.intoNextDay ? ', runs past midnight' : e.event.fromPreviousDay ? ', from the day before' : '';
    return `Event: ${e.title}, ${eventRange(e.event)}${runs}${eventState(e.event)}`;
  }
  const clash = e.clashWith ? `, during ${e.clashWith}` : '';
  return `${e.completed ? 'Planned task (done)' : 'Planned task'}: ${e.title}, ${range}${clash}`;
};

/** A range of one day picked on the grid, as minutes from midnight. */
export interface GridSelection {
  dayIndex: number;
  startMin: number;
  endMin: number;
}

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
  /** An empty half-hour slot was clicked (or Enter pressed on it); `anchor` is the slot's box. */
  onSlotClick: (day: Date, minutes: number, anchor: DOMRect) => void;
  /** The all-day row of a day was clicked. */
  onAllDayClick: (day: Date) => void;
  /** A range was dragged out on a day; `anchor` is the dragged box. */
  onDragCreate: (day: Date, startMin: number, endMin: number, anchor: DOMRect) => void;
  /** An event's block or chip was clicked. */
  onOpenEvent: (event: EventPlacement, anchor: DOMRect) => void;
  /** A range to keep highlighted, e.g. while a quick-add for it is open. */
  selection?: GridSelection | null;
  onOpenTask: (taskId: number) => void;
  onOpenNote: (noteId: number) => void;
  onOpenHabit: (habitId: number) => void;
  /** Fill the parent's remaining height (a flex column) instead of the grid's own height. */
  fill?: boolean;
}

/**
 * Seven day columns over a 24-hour time grid. The empty grid is made of
 * half-hour slot buttons (one roving tab stop, arrow keys to move, Enter or a
 * click to add something there); dragging down a day with a mouse or pen picks
 * a range, in 15-minute steps, for a new event. Events, planned tasks,
 * completions and note sessions sit on top as blocks, side by side where they
 * overlap, and all-day events, undated-time tasks and habit completions fill
 * the all-day row. Hours outside the user's work window are washed out and rest
 * days hatched, with dashed lines where the window opens and closes. Scrolls
 * both ways inside its own box, with the day headers and hour gutter pinned,
 * so it stays usable at phone width.
 */
const WeekGrid: React.FC<WeekGridProps> = ({
  days, timed, allDay, workDays, todayIndex, nowMinutes, scrollToMinutes, scrollKey,
  canOpenTask, canOpenHabit, onSlotClick, onAllDayClick, onDragCreate, onOpenEvent, selection = null,
  onOpenTask, onOpenNote, onOpenHabit, fill = false,
}) => {
  const hintId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const { drag, startDrag, clickWasDrag } = useDragSelect(onDragCreate, days);
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
                  onClick={() => onAllDayClick(days[i])}
                  aria-label={`Create task on ${dayLabel(days[i])} with no time`}
                  className="absolute inset-0 w-full h-full hover:bg-[var(--tm-accent-subtle)] focus-visible:bg-[var(--tm-accent-subtle)] transition-colors"
                  style={{ outlineOffset: -2 }}
                />
                <div className="relative z-10 flex flex-col gap-0.5 p-1 max-h-24 overflow-y-auto scrollbar-custom pointer-events-none">
                  {items.map(item => (
                    <AllDayChip
                      key={item.key}
                      item={item}
                      openable={item.kind === 'event' || (item.kind === 'habit' ? canOpenHabit(item.habitId!) : canOpenTask(item.taskId!))}
                      onOpen={anchor => {
                        if (item.kind === 'event') onOpenEvent(item.event!, anchor);
                        else if (item.kind === 'habit') onOpenHabit(item.habitId!);
                        else onOpenTask(item.taskId!);
                      }}
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
            Use the arrow keys to move between half-hour slots and Enter to add a task or event at that time.
          </p>
          {days.map((day, dayIndex) => {
            const isToday = dayIndex === todayIndex;
            const marks = workDays[dayIndex];
            const picked = drag?.dayIndex === dayIndex ? drag : selection?.dayIndex === dayIndex ? selection : null;
            return (
              <div
                key={dayIndex}
                data-rest-day={marks.rest || undefined}
                data-day-column={dayIndex}
                onPointerDown={e => startDrag(e, dayIndex)}
                className="relative border-l border-border-subtle select-none"
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
                      onClick={e => {
                        if (clickWasDrag()) return;
                        onSlotClick(day, minutes, e.currentTarget.getBoundingClientRect());
                      }}
                      onFocus={() => { if (!isFocusTarget) setFocusedSlot({ day: dayIndex, slot }); }}
                      onKeyDown={e => handleSlotKeyDown(e, dayIndex, slot)}
                      aria-label={`Add a task or event on ${dayLabel(day)} at ${formatMinutes(minutes)}`}
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
                      openable={e.kind === 'note' || e.kind === 'event' || canOpenTask(e.taskId!)}
                      onOpen={anchor => {
                        if (e.kind === 'event') onOpenEvent(e.event!, anchor);
                        else if (e.kind === 'note') onOpenNote(e.noteId!);
                        else onOpenTask(e.taskId!);
                      }}
                    />
                  ))}
                </div>

                {picked && (
                  <div
                    aria-hidden
                    data-grid-selection
                    className="absolute left-0.5 right-0.5 z-[25] pointer-events-none rounded-md px-1.5 py-0.5 text-[10.5px] font-bold"
                    style={{
                      top: minutesToPx(picked.startMin),
                      height: minutesToPx(Math.max(DRAG_SNAP_MINUTES, picked.endMin - picked.startMin)),
                      backgroundColor: 'color-mix(in srgb, var(--tm-accent) 22%, transparent)',
                      border: '1.5px solid var(--tm-accent)',
                      color: 'var(--tm-accent)',
                    }}
                  >
                    {formatMinutes(picked.startMin)} – {edgeTime(picked.endMin)}
                  </div>
                )}
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

/** An event's icon in its color: archived, repeating, or a one-off. */
const EventIcon: React.FC<{ event: EventPlacement; color: string }> = ({ event, color }) => {
  const props = { className: 'w-3 h-3 flex-shrink-0', style: { color }, 'aria-hidden': true } as const;
  if (event.archived) return <Archive {...props} />;
  return event.occurrence.repeat_days.length > 0 ? <Repeat {...props} /> : <CalendarDays {...props} />;
};

/** The time line under an event block's title: its range, or how a piece past midnight carries on. */
const eventTimeText = (e: TimedEvent): string => {
  const placement = e.event!;
  if (placement.fromPreviousDay) return `Until ${formatMinutes(e.endMin)}`;
  return eventRange(placement);
};

const EventBlock: React.FC<{ event: PositionedEvent; openable: boolean; onOpen: (anchor: DOMRect) => void }> = ({ event, openable, onOpen }) => {
  const isEvent = event.kind === 'event' && !!event.event;
  const height = minutesToPx(event.drawEndMin - event.drawStartMin);
  const label = timedLabel(event);
  const position: React.CSSProperties = {
    top: minutesToPx(event.drawStartMin),
    height,
    left: `calc(${(event.column / event.columns) * 100}% + 2px)`,
    width: `calc(${100 / event.columns}% - 4px)`,
  };
  let style: React.CSSProperties;
  let Icon: React.ElementType | null;
  let iconColor: string;
  let timeText: string;
  let struck: boolean;
  if (isEvent) {
    const color = eventColor(event.event!.occurrence.tags);
    style = { ...position, ...eventStyle(color, event.event!) };
    Icon = null;
    iconColor = color;
    timeText = eventTimeText(event);
    struck = event.event!.archived;
  } else {
    const { bg, edge } = KIND_STYLE[event.kind as Exclude<TimedEvent['kind'], 'event'>];
    style = {
      ...position,
      backgroundColor: bg,
      borderLeft: `3px solid ${edge}`,
      opacity: event.kind === 'task' && event.completed ? 0.7 : 1,
      ...(event.clashWith ? { outline: CLASH_RING, outlineOffset: -1 } : {}),
    };
    Icon = event.kind === 'note' ? FileText : event.kind === 'completed' ? CheckCircle2 : event.completed ? Check : null;
    iconColor = edge;
    const range = `${formatMinutes(event.startMin)} – ${formatMinutes(event.endMin)}`;
    timeText = event.kind === 'completed'
      ? formatMinutes(event.startMin)
      : event.kind === 'note' ? `${range} · ${workedText(event.workedMin ?? 0)}` : range;
    struck = event.kind === 'task' && !!event.completed;
  }
  const title = event.clashWith ? `${label}. Planned during ${event.clashWith}.` : label;
  const content = (
    <>
      <span className="flex items-center gap-1 min-w-0 max-w-full">
        {isEvent && <EventIcon event={event.event!} color={iconColor} />}
        {Icon && <Icon className="w-3 h-3 flex-shrink-0" style={{ color: iconColor }} />}
        <span className={`truncate font-semibold ${struck ? 'line-through' : ''}`}>{event.title}</span>
      </span>
      {height >= 34 && <span className="truncate max-w-full" style={{ color: 'var(--tm-text-secondary)' }}>{timeText}</span>}
      {event.clashWith && (
        <span
          aria-hidden
          className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[10px] font-extrabold"
          style={{ backgroundColor: 'var(--tm-warning)', color: '#fff' }}
        >
          !
        </span>
      )}
    </>
  );
  const className = 'absolute pointer-events-auto flex flex-col items-start overflow-hidden rounded-md px-1.5 py-0.5 text-left text-[11px] leading-tight text-text-primary shadow-sm';

  if (!openable) {
    return <div className={className} style={style} title={title} aria-label={label} role="note" data-week-block>{content}</div>;
  }
  return (
    <button
      type="button"
      data-week-block
      data-event-key={isEvent ? event.key : undefined}
      onClick={e => onOpen(e.currentTarget.getBoundingClientRect())}
      className={`${className} hover:brightness-95 transition-[filter]`}
      style={style}
      title={title}
      aria-label={label}
    >
      {content}
    </button>
  );
};

const AllDayChip: React.FC<{ item: AllDayItem; openable: boolean; onOpen: (anchor: DOMRect) => void }> = ({ item, openable, onOpen }) => {
  let label: string;
  let Icon: React.ElementType | null;
  let iconColor: string;
  let style: React.CSSProperties;
  let struck: boolean;
  if (item.kind === 'event' && item.event) {
    const color = eventColor(item.event.occurrence.tags);
    label = `Event: ${item.title}, all day${eventState(item.event)}`;
    Icon = null;
    iconColor = color;
    style = eventStyle(color, item.event);
    struck = item.event.archived;
  } else {
    const { bg, edge } = KIND_STYLE[item.kind as 'task' | 'habit'];
    label = item.kind === 'habit'
      ? `Habit completed: ${item.title}`
      : `${item.completed ? 'Planned task (done)' : 'Planned task'}: ${item.title}, no time set`;
    Icon = item.kind === 'habit' ? Flame : item.completed ? Check : Circle;
    iconColor = edge;
    style = { backgroundColor: bg, borderLeft: `3px solid ${edge}`, opacity: item.kind === 'task' && item.completed ? 0.7 : 1 };
    struck = item.kind === 'task' && !!item.completed;
  }
  const className = 'pointer-events-auto flex items-center gap-1 w-full min-w-0 rounded px-1.5 py-0.5 text-left text-[11px] leading-tight text-text-primary';
  const content = (
    <>
      {item.event && <EventIcon event={item.event} color={iconColor} />}
      {Icon && <Icon className="w-3 h-3 flex-shrink-0" style={{ color: iconColor }} />}
      <span className={`truncate font-medium ${struck ? 'line-through' : ''}`}>{item.title}</span>
    </>
  );

  if (!openable) {
    return <div className={className} style={style} title={label} aria-label={label} role="note">{content}</div>;
  }
  return (
    <button
      type="button"
      onClick={e => onOpen(e.currentTarget.getBoundingClientRect())}
      className={`${className} hover:brightness-95 transition-[filter]`}
      style={style}
      title={label}
      aria-label={label}
    >
      {content}
    </button>
  );
};

/** The range being dragged out on a day column. */
interface DragState extends GridSelection {
  /** Where the drag started, in minutes. */
  anchorMin: number;
}

/**
 * Drag down a day column with a mouse or pen to pick a range in
 * DRAG_SNAP_MINUTES steps; letting go calls `onDragCreate` with it. Touch is
 * left alone so a finger still scrolls the grid. A press that barely moves is
 * a plain click on the slot under it, and `clickWasDrag` tells the slot to
 * ignore the click that ends a real drag.
 */
function useDragSelect(onDragCreate: WeekGridProps['onDragCreate'], days: Date[]) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const draggedRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanupRef.current?.(), []);

  const startDrag = (e: React.PointerEvent<HTMLDivElement>, dayIndex: number) => {
    draggedRef.current = false;
    if (e.button !== 0 || e.pointerType === 'touch') return;
    if ((e.target as Element).closest('[data-week-block]')) return;
    const column = e.currentTarget;
    const top = column.getBoundingClientRect().top;
    const minutesAt = (clientY: number, round: (n: number) => number) =>
      Math.min(MINUTES_PER_DAY, Math.max(0, round(((clientY - top) / HOUR_PX) * 60 / DRAG_SNAP_MINUTES) * DRAG_SNAP_MINUTES));
    const anchorMin = Math.min(MINUTES_PER_DAY - DRAG_SNAP_MINUTES, minutesAt(e.clientY, Math.floor));
    let current: DragState = { dayIndex, anchorMin, startMin: anchorMin, endMin: anchorMin + DRAG_SNAP_MINUTES };
    let moved = false;

    const onMove = (ev: PointerEvent) => {
      const at = minutesAt(ev.clientY, Math.round);
      if (!moved && Math.abs(at - anchorMin) < DRAG_SNAP_MINUTES) return;
      moved = true;
      const startMin = Math.min(anchorMin, at);
      const endMin = Math.max(anchorMin + (at > anchorMin ? 0 : DRAG_SNAP_MINUTES), at, startMin + DRAG_SNAP_MINUTES);
      current = { dayIndex, anchorMin, startMin, endMin };
      setDrag(current);
    };
    const finish = (ev: PointerEvent) => {
      cleanup();
      if (!moved || ev.type === 'pointercancel') {
        setDrag(null);
        return;
      }
      draggedRef.current = true;
      const rect = column.getBoundingClientRect();
      const anchor = new DOMRect(rect.left, rect.top + minutesToPx(current.startMin), rect.width, minutesToPx(current.endMin - current.startMin));
      setDrag(null);
      onDragCreate(days[dayIndex], current.startMin, current.endMin, anchor);
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      cleanupRef.current = null;
    };
    cleanupRef.current?.();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    cleanupRef.current = cleanup;
  };

  /** Whether the click now arriving ends a drag; reading it clears it. */
  const clickWasDrag = () => {
    const was = draggedRef.current;
    draggedRef.current = false;
    return was;
  };

  return { drag, startDrag, clickWasDrag };
}

export default WeekGrid;
