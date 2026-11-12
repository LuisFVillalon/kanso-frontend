'use client';

import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Pause, Play, Plus, Square, X } from 'lucide-react';
import type { DragHandleProps } from '@/app/components/common/DraggableGrid';
import { KansoKIcon } from '@/app/components/common/KansoLogo';
import { MODAL_LAYER } from '@/app/components/common/Modal';
import { useMenu } from '@/app/hooks/useMenu';
import {
  FOCUS_PRESETS, MAX_CUSTOM_MINUTES, MIN_CUSTOM_MINUTES, customMinutesOf, useFocusTimer, type FocusTimer,
} from '@/app/hooks/useFocusTimer';
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
  const picked = timer.taskPicked && (timer.taskId == null || (byId.has(timer.taskId) && isOpen(byId.get(timer.taskId)!)));
  const id: number | null = active || picked ? timer.taskId : def?.id ?? null;
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

/** Space between a popup and its anchor, and kept from the viewport's edges. */
const POPUP_GAP = 6;

/**
 * Places a fixed, portaled popup under `anchor` (above it when there's more
 * room there), inside the viewport, before it paints. Portaled because the
 * tile clips its overflow and its glass (backdrop-filter) would trap a fixed
 * child; above the expand overlay so it works there too. Anything scrolling
 * outside it, or a resize, calls `onDismiss`, as a native menu would.
 */
function usePopupPlacement(
  open: boolean,
  anchor: React.RefObject<HTMLElement | null>,
  popup: React.RefObject<HTMLElement | null>,
  onDismiss: () => void,
) {
  const dismiss = useRef(onDismiss);
  useLayoutEffect(() => { dismiss.current = onDismiss; });

  useLayoutEffect(() => {
    if (!open) return;
    const a = anchor.current?.getBoundingClientRect();
    const el = popup.current;
    if (!a || !el) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const below = vh - a.bottom - POPUP_GAP * 2;
    const above = a.top - POPUP_GAP * 2;
    const up = el.offsetHeight > below && above > below;
    // Set on the element (not through state) so it's placed before it paints
    // and can take focus at once.
    el.style.setProperty('max-height', `${Math.max(120, up ? above : below)}px`);
    el.style.setProperty('left', `${Math.max(POPUP_GAP, Math.min(a.left, vw - el.offsetWidth - POPUP_GAP))}px`);
    el.style.setProperty('top', up ? `${Math.max(POPUP_GAP, a.top - POPUP_GAP - el.offsetHeight)}px` : `${a.bottom + POPUP_GAP}px`);
  }, [open, anchor, popup]);

  useEffect(() => {
    if (!open) return;
    const onScroll = (e: Event) => {
      if (popup.current?.contains(e.target as Node)) return;
      dismiss.current();
    };
    const onResize = () => dismiss.current();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, popup]);
}

const popupStyle: React.CSSProperties = { position: 'fixed', zIndex: MODAL_LAYER.elevated };

/** Keeps Escape in a popup from also closing the expand overlay underneath (it listens on document). */
const holdEscape = (e: React.KeyboardEvent) => {
  if (e.key === 'Escape') e.nativeEvent.stopImmediatePropagation();
};

interface TaskPickerProps {
  task: Task | null;
  options: Task[];
  onChoose: (id: number | null) => void;
  large?: boolean;
}

/** The task title as a menu button; its menu lists the open tasks up next, then No task. */
const TaskPicker: React.FC<TaskPickerProps> = ({ task, options, onChoose, large }) => {
  const menu = useMenu();
  const anchorRef = useRef<HTMLDivElement>(null);
  usePopupPlacement(menu.open, anchorRef, menu.menuProps.ref, () => menu.close(false));

  // Open on the task picked, not the first row.
  useEffect(() => {
    if (!menu.open) return;
    menu.menuProps.ref.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }, [menu.open, menu.menuProps.ref]);

  const choose = (id: number | null) => {
    onChoose(id);
    menu.close();
  };
  const row = (id: number | null, label: string, t: Task | null) => {
    const on = (task?.id ?? null) === id;
    return (
      <button
        key={id ?? 'none'}
        type="button"
        role="menuitemradio"
        aria-checked={on}
        tabIndex={-1}
        onClick={() => choose(id)}
        className={`menu-row ${on ? 'font-semibold' : ''}`}
        style={on ? { backgroundColor: 'var(--tm-accent-subtle)', color: 'var(--tm-text-primary)' } : undefined}
      >
        <TagDot task={t} />
        <span className="flex-1 min-w-0 truncate">{label}</span>
        {on ? <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--tm-accent)' }} aria-hidden /> : <span className="w-3.5 flex-shrink-0" aria-hidden />}
      </button>
    );
  };

  return (
    <div ref={anchorRef} className="min-w-0">
      <button
        {...menu.triggerProps}
        aria-label={`Task to focus on: ${task?.title ?? 'no task'}`}
        className={`flex items-center gap-1.5 max-w-full min-w-0 rounded-md -mx-1 px-1 text-left hover:bg-surface-raised ${large ? 'py-0.5' : ''}`}
      >
        <TagDot task={task} />
        <span className={`truncate font-semibold ${large ? 'text-sm' : 'text-xs'} ${task ? 'text-text-primary' : 'text-text-muted'}`}>
          {task?.title ?? NO_TASK_LABEL}
        </span>
        <ChevronDown className={`w-3 h-3 flex-shrink-0 text-text-muted transition-transform ${menu.open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {menu.open && typeof document !== 'undefined' && createPortal(
        <div
          {...menu.menuProps}
          aria-label="Task to focus on"
          onKeyDown={e => { holdEscape(e); menu.menuProps.onKeyDown(e); }}
          className="menu-pop w-64 max-w-[calc(100vw-12px)] min-w-0 overflow-y-auto scrollbar-custom"
          style={popupStyle}
        >
          {options.map(t => row(t.id, t.title, t))}
          {options.length > 0 && <div className="menu-sep" role="separator" />}
          {row(null, 'No task', null)}
        </div>,
        document.body,
      )}
    </div>
  );
};

const isPresetLength = (m: number) => (FOCUS_PRESETS as readonly number[]).includes(m);

const chipClass = 'rounded-full px-1.5 @[250px]:px-2 py-0.5 text-[11px] font-semibold border transition-colors disabled:cursor-not-allowed';
const chipStyle = (on: boolean, locked: boolean): React.CSSProperties => ({
  borderColor: on ? 'var(--tm-accent)' : 'var(--tm-border)',
  backgroundColor: on ? 'var(--tm-accent-subtle)' : 'transparent',
  color: on ? 'var(--tm-accent)' : 'var(--tm-text-secondary)',
  opacity: locked && !on ? 0.5 : 1,
});

/** "+": a small dialog to pick a saved custom length, remove one, or add a new one. */
const CustomLength: React.FC<{ timer: FocusTimer; locked: boolean }> = ({ timer, locked }) => {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const close = (returnFocus = true) => {
    setOpen(false);
    setValue('');
    setInvalid(false);
    if (returnFocus) triggerRef.current?.focus();
  };
  usePopupPlacement(open, triggerRef, panelRef, () => close(false));

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
      setValue('');
      setInvalid(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const pick = (m: number) => {
    timer.setMinutes(m);
    close();
  };
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (customMinutesOf(value) == null || !timer.addCustomMinutes(value)) { setInvalid(true); return; }
    close();
  };

  const custom = !isPresetLength(timer.minutes);
  return (
    <>
      {/* Wide: "+", or the custom length in use. Narrow (no room for the
          presets): the length in use with a chevron, opening every length. */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        disabled={locked}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Custom length (now ${timer.minutes} min)`}
        title="Custom length"
        className={`${chipClass} inline-flex items-center justify-center gap-0.5`}
        style={chipStyle(custom, locked)}
      >
        <span className={custom ? '' : 'inline @[168px]/len:hidden'}>{timer.minutes}m</span>
        <Plus className={`w-3 h-[16.5px] ${custom ? 'hidden' : 'hidden @[168px]/len:block'}`} aria-hidden />
        <ChevronDown className="w-3 h-3 block @[168px]/len:hidden" aria-hidden />
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Custom length"
          onKeyDown={e => {
            if (e.key !== 'Escape') return;
            holdEscape(e);
            e.preventDefault();
            close();
          }}
          className="menu-pop w-56 max-w-[calc(100vw-12px)] overflow-y-auto scrollbar-custom"
          style={popupStyle}
        >
          <p className="px-2.5 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">Length</p>
          <div className="flex items-center gap-1 px-2.5 pb-1.5">
            {FOCUS_PRESETS.map(m => (
              <button
                key={m}
                type="button"
                aria-pressed={timer.minutes === m}
                onClick={() => pick(m)}
                className={chipClass}
                style={chipStyle(timer.minutes === m, false)}
              >
                {m}m
              </button>
            ))}
          </div>
          {timer.customMinutes.length > 0 && (
            <>
              <p className="px-2.5 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">Your lengths</p>
              {timer.customMinutes.map(m => {
                const on = timer.minutes === m;
                return (
                  <div key={m} className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => pick(m)}
                      className={`menu-row flex-1 min-w-0 ${on ? 'font-semibold' : ''}`}
                      style={on ? { backgroundColor: 'var(--tm-accent-subtle)', color: 'var(--tm-text-primary)' } : undefined}
                    >
                      <span className="flex-1 tabular-nums">{m} min</span>
                      {on && <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--tm-accent)' }} aria-hidden />}
                    </button>
                    <button
                      type="button"
                      onClick={() => timer.removeCustomMinutes(m)}
                      aria-label={`Remove ${m} min`}
                      title="Remove"
                      className="w-7 h-7 flex-shrink-0 rounded-md flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden />
                    </button>
                  </div>
                );
              })}
              <div className="menu-sep" role="separator" />
            </>
          )}
          <form onSubmit={add} className="px-2.5 pt-1 pb-1.5" noValidate>
            <label htmlFor={inputId} className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-1">New length</label>
            <div className="flex items-center gap-1.5">
              <input
                id={inputId}
                type="number"
                inputMode="numeric"
                min={MIN_CUSTOM_MINUTES}
                max={MAX_CUSTOM_MINUTES}
                step={1}
                value={value}
                onChange={e => { setValue(e.target.value); setInvalid(false); }}
                placeholder="45"
                aria-invalid={invalid}
                aria-describedby={`${inputId}-hint`}
                className="input-field w-16 px-2 py-1 text-sm tabular-nums"
              />
              <span className="text-xs text-text-secondary">min</span>
              <button type="submit" className="btn btn-primary text-xs px-2.5 py-1 ml-auto">Add</button>
            </div>
            <p
              id={`${inputId}-hint`}
              className="mt-1 text-[11px] leading-4"
              style={{ color: invalid ? 'var(--tm-slipped-text)' : 'var(--tm-text-muted)' }}
            >
              {MIN_CUSTOM_MINUTES} to {MAX_CUSTOM_MINUTES} whole minutes
            </p>
          </form>
        </div>,
        document.body,
      )}
    </>
  );
};

/**
 * The presets and "+" for custom lengths (showing the custom one in use).
 * Inside a `@container/len` narrower than 168px, only the length in use shows,
 * as a button opening every length.
 */
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
            className={`${chipClass} hidden @[168px]/len:inline-block`}
            style={chipStyle(on, locked)}
          >
            {m}m
          </button>
        );
      })}
      <CustomLength timer={timer} locked={locked} />
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
      icon={<KansoKIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--tm-accent)' }} />}
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
        <div className="@container/len flex-1 min-w-0 flex flex-col gap-1.5">
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
  const pct = timer.totalMs ? 1 - timer.remainingMs / timer.totalMs : 0;
  const titleOf = (taskId: number | null) => (taskId == null ? 'No task' : tasks.find(t => t.id === taskId)?.title ?? 'A removed task');
  const minuteOf = (ms: number) => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <Ring pct={pct} label={mmss(timer.remainingMs)} className="w-[96px] h-[96px] sm:w-[112px] sm:h-[112px]" labelClassName="text-[18px] sm:text-[21px]" />
        <div className="@container/len flex-1 min-w-0 flex flex-col gap-2">
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
        <div className="flex items-baseline justify-between gap-2 mb-1">
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

    </div>
  );
};

export default FocusTimerCard;
