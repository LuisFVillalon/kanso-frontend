'use client';

import React from 'react';
import { ChevronDown, Pause, Play, Square, Timer } from 'lucide-react';
import type { DragHandleProps } from '@/app/components/common/DraggableGrid';
import { useCalendarViewMode } from '@/app/hooks/useCalendarViewMode';
import { FOCUS_PRESETS, useFocusTimer, type FocusTimer } from '@/app/hooks/useFocusTimer';
import { blockSpan, dueMinutesOf, useSlotPlanner } from '@/app/hooks/useSlotPlanner';
import type { Task } from '@/app/types/task';
import type { WorkBlock } from '@/app/types/workBlock';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import { hoursMinutes } from '@/app/utils/freeTimeToday';
import { clock } from '@/app/utils/slotLabels';
import { CardShell } from './CardShell';
import TileTools from './TileTools';

const NO_HABITS: never[] = [];
const NO_TASK_LABEL = 'Anything (no task picked)';
/** How many open tasks the task menu offers after the default one. */
const MENU_MORE = 5;

const isOpen = (t: Task) => !t.completed && !t.archived_at;
const dueOrder = (t: Task) => `${toLocalDateStr(t.due_date!)}|${String(dueMinutesOf(t) ?? 24 * 60).padStart(4, '0')}`;

/** Open tasks with a due date, soonest first (slipped ones are the soonest). */
export function openTasksByDue(tasks: Task[]): Task[] {
  return tasks.filter(t => isOpen(t) && t.due_date).sort((a, b) => dueOrder(a).localeCompare(dueOrder(b)));
}

/**
 * The task a new session is for by default: the open task whose work block
 * today covers `now` or else starts next today; otherwise the soonest-due open
 * task; otherwise none.
 */
export function upNextTask(tasks: Task[], workBlocks: WorkBlock[], now: Date): Task | null {
  const today = toLocalDateStr(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const open = new Map(tasks.filter(isOpen).map(t => [t.id, t]));
  const todays = workBlocks
    .filter(b => b.date === today && b.task_id != null && open.has(b.task_id))
    .map(b => ({ b, span: blockSpan(b) }))
    .filter(x => x.span.end > nowMin)
    .sort((a, z) => a.span.start - z.span.start);
  const current = todays.find(x => x.span.start <= nowMin) ?? todays[0];
  if (current) return open.get(current.b.task_id!)!;
  return openTasksByDue(tasks)[0] ?? null;
}

/** "25:00", or "1:30:00" past an hour. */
export function mmss(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** "1h 10m · 2", or "None yet today". */
export const todayTally = (timer: Pick<FocusTimer, 'sessions'>) => {
  if (timer.sessions.length === 0) return 'None yet today';
  const ms = timer.sessions.reduce((n, s) => n + s.ms, 0);
  return `Today ${hoursMinutes(ms / 60_000)} · ${timer.sessions.length}`;
};

const TagDot: React.FC<{ task: Task | null }> = ({ task }) => (
  <span
    aria-hidden
    className="inline-block w-2 h-2 rounded-full flex-shrink-0"
    style={{ backgroundColor: task?.tags[0]?.color ?? (task ? 'var(--tm-accent)' : 'var(--tm-pencil)') }}
  />
);

// Drawn on a 72-unit box and scaled to its wrapper, so the tile can shrink it
// in a narrow column with a container query.
const RING_BOX = 72;
const RING_STROKE = 6;

const Ring: React.FC<{ pct: number; label: string; className: string; labelClassName: string }> = ({ pct, label, className, labelClassName }) => {
  const r = (RING_BOX - RING_STROKE) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, pct));
  return (
    <div className={`relative flex-shrink-0 ${className}`}>
      <svg width="100%" height="100%" viewBox={`0 0 ${RING_BOX} ${RING_BOX}`} className="-rotate-90" aria-hidden>
        <circle cx={RING_BOX / 2} cy={RING_BOX / 2} r={r} fill="none" stroke="var(--tm-surface-raised)" strokeWidth={RING_STROKE} />
        <circle
          cx={RING_BOX / 2} cy={RING_BOX / 2} r={r} fill="none" stroke="var(--tm-accent)" strokeWidth={RING_STROKE}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - clamped)}
          style={{ transition: 'stroke-dashoffset 1s linear' }}
        />
      </svg>
      <span
        className={`absolute inset-0 flex items-center justify-center font-bold tabular-nums text-text-primary ${labelClassName}`}
        role="timer"
        aria-label={`${label} left`}
      >
        {label}
      </span>
    </div>
  );
};

/** Which task the timer is on, and the menu to change it. */
function useFocusTask(tasks: Task[], timer: FocusTimer, planner: ReturnType<typeof useSlotPlanner>) {
  const byId = new Map(tasks.map(t => [t.id, t]));
  const def = upNextTask(tasks, planner?.workBlocks ?? [], new Date());
  const active = timer.phase === 'running' || timer.phase === 'paused';
  const id: number | null = active || timer.taskPicked ? timer.taskId : def?.id ?? null;
  const task = id != null ? byId.get(id) ?? null : null;

  const options: Task[] = [];
  if (def) options.push(def);
  for (const t of openTasksByDue(tasks)) {
    if (options.length >= MENU_MORE + (def ? 1 : 0)) break;
    if (!options.includes(t)) options.push(t);
  }
  if (task && !options.includes(task)) options.unshift(task);

  return { task, id, options, choose: timer.setTaskId };
}

interface TaskPickerProps {
  task: Task | null;
  options: Task[];
  onChoose: (id: number | null) => void;
  large?: boolean;
}

// A native select laid over the title: a real menu everywhere (and on phones
// the system picker), and nothing the tile's overflow can clip.
const TaskPicker: React.FC<TaskPickerProps> = ({ task, options, onChoose, large }) => (
  <label className={`relative flex items-center gap-1.5 min-w-0 rounded-md -mx-1 px-1 hover:bg-surface-raised cursor-pointer ${large ? 'py-1' : ''}`}>
    <TagDot task={task} />
    <span className={`truncate font-semibold ${large ? 'text-sm' : 'text-xs'} ${task ? 'text-text-primary' : 'text-text-muted'}`}>
      {task?.title ?? NO_TASK_LABEL}
    </span>
    <ChevronDown className="w-3 h-3 flex-shrink-0 text-text-muted" aria-hidden />
    <select
      aria-label="Task to focus on"
      value={task ? String(task.id) : ''}
      onChange={e => onChoose(e.target.value === '' ? null : Number(e.target.value))}
      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
    >
      {options.map(t => <option key={t.id} value={String(t.id)}>{t.title}</option>)}
      <option value="">No task</option>
    </select>
  </label>
);

const PresetChips: React.FC<{ timer: FocusTimer }> = ({ timer }) => {
  const locked = timer.phase === 'running' || timer.phase === 'paused';
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Session length">
      {FOCUS_PRESETS.map(m => {
        const on = timer.minutes === m;
        return (
          <button
            key={m}
            type="button"
            onClick={() => timer.setMinutes(m)}
            disabled={locked}
            aria-pressed={on}
            className="rounded-full px-1.5 @[250px]:px-2 py-0.5 text-[11px] font-semibold border transition-colors disabled:cursor-not-allowed"
            style={{
              borderColor: on ? 'var(--tm-accent)' : 'var(--tm-border)',
              backgroundColor: on ? 'var(--tm-accent-subtle)' : 'transparent',
              color: on ? 'var(--tm-accent)' : 'var(--tm-text-secondary)',
              opacity: locked && !on ? 0.5 : 1,
            }}
          >
            {m}m
          </button>
        );
      })}
    </div>
  );
};

const Controls: React.FC<{ timer: FocusTimer; taskId: number | null }> = ({ timer, taskId }) => {
  if (timer.phase === 'running' || timer.phase === 'paused') {
    const running = timer.phase === 'running';
    return (
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={running ? timer.pause : timer.resume} className="btn btn-primary text-xs px-2 @[250px]:px-2.5 py-1 gap-1">
          {running ? <Pause className="hidden @[250px]:block w-3 h-3" aria-hidden /> : <Play className="hidden @[250px]:block w-3 h-3" aria-hidden />}
          {running ? 'Pause' : 'Resume'}
        </button>
        <button type="button" onClick={timer.stop} className="btn btn-secondary text-xs px-2 @[250px]:px-2.5 py-1 gap-1">
          <Square className="hidden @[250px]:block w-3 h-3" aria-hidden />
          Stop
        </button>
      </div>
    );
  }
  return (
    <button type="button" onClick={() => timer.start(taskId)} className="btn btn-primary text-xs px-3 py-1 gap-1 self-start">
      <Play className="w-3 h-3" aria-hidden />
      Start
    </button>
  );
};

/** "Saved 25m to HW 7 · Undo", or the save's error. */
const SavedNotice: React.FC<{ timer: FocusTimer; tasks: Task[] }> = ({ timer, tasks }) => {
  if (timer.error) {
    return <p role="alert" className="text-[11px] leading-4 truncate" style={{ color: 'var(--tm-slipped-text)' }} title={timer.error}>{timer.error}</p>;
  }
  if (!timer.saved) return null;
  const title = tasks.find(t => t.id === timer.saved!.taskId)?.title ?? timer.saved.block.title ?? 'your task';
  return (
    <p role="status" className="flex items-center gap-1 text-[11px] leading-4 min-w-0">
      <span className="truncate text-text-secondary">Saved {hoursMinutes(timer.saved.minutes)} to {title}</span>
      <span className="text-text-muted">·</span>
      <button type="button" onClick={timer.undo} className="font-semibold text-accent hover:underline flex-shrink-0">Undo</button>
    </p>
  );
};

interface FocusTimerCardProps {
  tasks: Task[];
  onExpand: () => void;
  dragHandleProps: DragHandleProps;
}

/**
 * The Focus tile: a 25/50/90-minute timer on a task (by default the one up
 * next). A session of five minutes or more on a task is saved as a work
 * block, so it shows on the calendar.
 */
const FocusTimerCard: React.FC<FocusTimerCardProps> = ({ tasks, onExpand, dragHandleProps }) => {
  const timer = useFocusTimer();
  const planner = useSlotPlanner({ enabled: true, tasks, habits: NO_HABITS });
  const { task, id, options, choose } = useFocusTask(tasks, timer, planner);
  const pct = timer.totalMs ? 1 - timer.remainingMs / timer.totalMs : 0;
  const notice = timer.saved || timer.error;

  return (
    <CardShell
      compact
      icon={<Timer className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--tm-accent)' }} />}
      header="Focus"
      headerAction={
        <>
          <span className="min-w-0 truncate text-[11px] font-semibold text-text-secondary whitespace-nowrap">{todayTally(timer)}</span>
          <TileTools onExpand={onExpand} dragHandleProps={dragHandleProps} />
        </>
      }
    >
      <div className="@container flex-1 min-h-0 flex items-center gap-2 @[250px]:gap-3">
        <Ring pct={pct} label={mmss(timer.remainingMs)} className="w-[58px] h-[58px] @[250px]:w-[72px] @[250px]:h-[72px]" labelClassName="text-[13px] @[250px]:text-[15px]" />
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <div className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted">Working on</span>
            <TaskPicker task={task} options={options} onChoose={choose} />
          </div>
          {notice ? <SavedNotice timer={timer} tasks={tasks} /> : <PresetChips timer={timer} />}
          <Controls timer={timer} taskId={id} />
        </div>
      </div>
    </CardShell>
  );
};

interface FocusOverlayProps {
  tasks: Task[];
}

/** The expanded Focus tile: the timer, its lengths, and today's sessions. */
export const FocusOverlay: React.FC<FocusOverlayProps> = ({ tasks }) => {
  const timer = useFocusTimer();
  const planner = useSlotPlanner({ enabled: true, tasks, habits: NO_HABITS });
  const { task, id, options, choose } = useFocusTask(tasks, timer, planner);
  const [, setCalendarView] = useCalendarViewMode();
  const pct = timer.totalMs ? 1 - timer.remainingMs / timer.totalMs : 0;
  const titleOf = (taskId: number | null) => (taskId == null ? 'No task' : tasks.find(t => t.id === taskId)?.title ?? 'A removed task');
  const minuteOf = (ms: number) => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <Ring pct={pct} label={mmss(timer.remainingMs)} className="w-[120px] h-[120px]" labelClassName="text-[22px]" />
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div className="min-w-0">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-text-muted">Working on</span>
            <TaskPicker task={task} options={options} onChoose={choose} large />
          </div>
          <PresetChips timer={timer} />
          <SavedNotice timer={timer} tasks={tasks} />
          <Controls timer={timer} taskId={id} />
        </div>
      </div>

      <section>
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <h3 className="text-sm font-semibold text-text-primary">Today&apos;s sessions</h3>
          <span className="text-xs text-text-muted">{todayTally(timer)}</span>
        </div>
        {timer.sessions.length === 0 ? (
          <p className="text-xs text-text-muted">None yet today. Finished sessions show here.</p>
        ) : (
          <ul className="flex flex-col">
            {timer.sessions.map(s => (
              <li key={s.start} className="flex items-center gap-3 py-1.5 border-b last:border-b-0 text-xs" style={{ borderColor: 'var(--tm-border-subtle)' }}>
                <span className="w-16 flex-shrink-0 tabular-nums text-text-secondary">{clock(minuteOf(s.start))}</span>
                <span className="w-12 flex-shrink-0 tabular-nums font-semibold text-text-primary">{hoursMinutes(s.ms / 60_000)}</span>
                <span className="min-w-0 truncate text-text-primary">{titleOf(s.taskId)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-text-muted">
        Sessions of 5 minutes or more on a task are saved as work blocks, so they show on your{' '}
        <a href="/calendar" onClick={() => setCalendarView('week')} className="font-semibold text-accent hover:underline">calendar&apos;s week view</a>.
        Sessions with no task only count here.
      </p>
    </div>
  );
};

export default FocusTimerCard;
