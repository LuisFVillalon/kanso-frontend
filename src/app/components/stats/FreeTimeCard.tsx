'use client';

import React, { useContext, useEffect, useRef, useState } from 'react';
import { CalendarRange, Check, Loader2, Plus } from 'lucide-react';
import type { DragHandleProps } from '@/app/components/common/DraggableGrid';
import { AppShellContext } from '@/app/context/AppShellContext';
import { createWorkBlock, deleteWorkBlock, describeError } from '@/app/lib/backend-api';
import type { ProfileFields } from '@/app/hooks/useProfile';
import { useSlotPlanner, type SlotPlanner } from '@/app/hooks/useSlotPlanner';
import { notifyWorkBlocksChanged } from '@/app/hooks/useWorkBlocksVersion';
import type { Habit } from '@/app/types/habit';
import type { Task } from '@/app/types/task';
import type { WorkBlock } from '@/app/types/workBlock';
import { parseLocalDate } from '@/app/utils/dateUtils';
import {
  busyBetween, fitsToday, freeTimeToday, hoursMinutes, nextFreeAfterToday, nextWorkStart,
  type BusyKind, type BusyPiece, type FitToday,
} from '@/app/utils/freeTimeToday';
import { SLOT_COUNT, addDaysStr, type Span } from '@/app/utils/slotSuggest';
import { clock, dayShort, timeRange } from '@/app/utils/slotLabels';
import { workBlockBody } from '@/app/utils/workBlockPlans';
import { CardShell } from './CardShell';
import TileTools from './TileTools';

/** How long a chip reads "✓ Planned" with Undo. */
const PLANNED_NOTICE_MS = 6000;

const KIND_STYLE: Record<BusyKind, React.CSSProperties> = {
  block: {
    backgroundColor: 'color-mix(in srgb, var(--tm-accent) 30%, transparent)',
    backgroundImage: 'repeating-linear-gradient(135deg, var(--tm-accent) 0 2px, transparent 2px 6px)',
  },
  event: { backgroundColor: 'var(--tm-pencil)' },
  habit: { backgroundColor: 'var(--tm-week-habit)' },
};
const KIND_LABEL: Record<BusyKind, string> = { block: 'Work block', event: 'Event', habit: 'Habit' };

/** "Blocks 2h · events 30m · habits 1h": only the kinds that take time. */
export function breakdownText(totals: Record<BusyKind, number>): string {
  const parts: string[] = [];
  if (totals.block) parts.push(`blocks ${hoursMinutes(totals.block)}`);
  if (totals.event) parts.push(`events ${hoursMinutes(totals.event)}`);
  if (totals.habit) parts.push(`habits ${hoursMinutes(totals.habit)}`);
  if (parts.length === 0) return 'Nothing else on today';
  const text = parts.join(' · ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const weekdayOf = (date: string) => parseLocalDate(date).toLocaleDateString('en-US', { weekday: 'short' });

/** The line for a day with no work time left: rest day or after shutoff. */
export function closedText(planner: SlotPlanner, endedAt: number | null): string {
  const { state, today } = planner;
  const next = nextWorkStart(state, today);
  const nextText = next
    ? next.date === addDaysStr(today, 1)
      ? `Tomorrow starts at ${clock(next.start)}.`
      : `Your next work day starts ${weekdayOf(next.date)} ${clock(next.start)}.`
    : '';
  if (endedAt == null) {
    return `Rest day.${next ? ` Your next work day starts ${weekdayOf(next.date)} ${clock(next.start)}.` : ''}`;
  }
  return `Your work day ended at ${clock(endedAt)}.${nextText ? ` ${nextText}` : ''}`;
}

/** The bar: `pieces` placed on [from, to]; free time stays empty. `pastUntil` dims what's gone. */
const DayBar: React.FC<{ from: number; to: number; pieces: BusyPiece[]; pastUntil?: number; tall?: boolean }> = ({ from, to, pieces, pastUntil, tall }) => {
  const span = Math.max(1, to - from);
  const pct = (m: number) => `${((m - from) / span) * 100}%`;
  return (
    <div
      className={`relative w-full ${tall ? 'h-6' : 'h-2.5'} rounded-full overflow-hidden flex-shrink-0`}
      style={{ backgroundColor: 'var(--tm-surface-raised)', border: '1px solid var(--tm-border-subtle)' }}
      aria-hidden
    >
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute top-0 bottom-0"
          style={{ left: pct(p.start), width: `calc(${pct(p.end)} - ${pct(p.start)})`, ...KIND_STYLE[p.kind] }}
          title={`${p.title ?? KIND_LABEL[p.kind]} · ${timeRange(p.start, p.end)}`}
        />
      ))}
      {pastUntil != null && pastUntil > from && (
        <span
          className="absolute top-0 bottom-0 left-0"
          style={{ width: pct(Math.min(pastUntil, to)), backgroundColor: 'var(--tm-surface)', opacity: 0.6 }}
        />
      )}
    </div>
  );
};

/** Plans a fit as a work block, then keeps "✓ Planned" with Undo up for a moment. */
function usePlanFits() {
  const [planned, setPlanned] = useState<{ fit: FitToday; block: WorkBlock } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const show = (value: { fit: FitToday; block: WorkBlock } | null) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = value ? setTimeout(() => setPlanned(null), PLANNED_NOTICE_MS) : null;
    setPlanned(value);
  };

  const plan = async (fit: FitToday) => {
    setBusyId(fit.task.id);
    setError(null);
    try {
      const block = await createWorkBlock(workBlockBody({ taskId: fit.task.id }, fit.slot));
      show({ fit, block });
      notifyWorkBlocksChanged();
    } catch (err) {
      console.error('[FreeTimeCard] Planning failed:', err);
      setError(describeError(err, "Couldn't put that on your calendar. Please try again."));
    } finally {
      setBusyId(null);
    }
  };

  const undo = async () => {
    if (!planned) return;
    const { block } = planned;
    show(null);
    try {
      await deleteWorkBlock(block.id);
    } catch (err) {
      console.error('[FreeTimeCard] Undo failed:', err);
      setError(describeError(err, "Couldn't undo that. Please try again."));
    } finally {
      notifyWorkBlocksChanged();
    }
  };

  return { planned, busyId, error, plan, undo };
}

const TaskDot: React.FC<{ task: Task }> = ({ task }) => (
  <span aria-hidden className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: task.tags[0]?.color ?? 'var(--tm-accent)' }} />
);

const DefaultHoursLine: React.FC = () => {
  const shell = useContext(AppShellContext);
  return (
    <p className="flex items-center gap-1 min-w-0 text-[11px] text-text-muted">
      <span className="truncate">Using default hours ·</span>
      <button type="button" onClick={() => shell?.openSettings('workday')} className="flex-shrink-0 font-semibold text-accent hover:underline">
        Set work hours
      </button>
    </p>
  );
};

interface FreeTimeProps {
  tasks: Task[];
  habits: Habit[];
  profile: ProfileFields;
}

interface FreeTimeCardProps extends FreeTimeProps {
  onExpand: () => void;
  dragHandleProps: DragHandleProps;
}

/**
 * The Free Time tile: how much of today's work window is still free after
 * events, work blocks and habit holds, a bar of the rest of the day, and up
 * to two due-soon tasks that fit today, each planned with one tap.
 */
const FreeTimeCard: React.FC<FreeTimeCardProps> = ({ tasks, habits, profile, onExpand, dragHandleProps }) => {
  const planner = useSlotPlanner({ enabled: true, tasks, habits, profile });
  const { planned, busyId, error, plan, undo } = usePlanFits();
  const shell = (
    children: React.ReactNode,
  ) => (
    <CardShell
      compact
      icon={<CalendarRange className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--tm-accent)' }} />}
      header="Free Time"
      headerAction={<TileTools onExpand={onExpand} dragHandleProps={dragHandleProps} />}
    >
      {children}
    </CardShell>
  );

  if (!planner) {
    return shell(
      <div className="flex-1 min-h-0 flex flex-col gap-1.5 justify-center" aria-label="Loading free time">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-6 rounded-md animate-pulse" style={{ backgroundColor: 'var(--tm-surface-raised)' }} />
        ))}
      </div>,
    );
  }

  const ft = freeTimeToday(planner.state, planner.today);
  const defaultHours = !planner.workHoursSet && <DefaultHoursLine />;

  if (!ft || ft.ended) {
    return shell(
      <div className="flex-1 min-h-0 flex flex-col justify-center gap-1.5">
        <p className="text-sm text-text-secondary leading-snug">{closedText(planner, ft ? ft.window[1] : null)}</p>
        {defaultHours}
      </div>,
    );
  }

  const fits = fitsToday(planner.state, tasks, planner.workBlocks, planner.today)
    .filter(f => f.task.id !== planned?.fit.task.id)
    .slice(0, planned ? 1 : 2);
  const nextFree = ft.free === 0 ? nextFreeAfterToday(planner.state, planner.today) : null;

  return shell(
    <div className={`flex-1 min-h-0 flex flex-col justify-center ${defaultHours ? 'gap-1' : 'gap-1.5'}`}>
      {ft.free === 0 ? (
        <p className="text-sm font-semibold text-text-primary leading-tight">
          No free time left today.
          {nextFree && (
            <span className="block text-[11px] font-normal text-text-muted">
              Next free: {dayShort(nextFree.date, planner.today)} {clock(nextFree.start)}
            </span>
          )}
        </p>
      ) : (
        <p className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-2xl font-bold leading-none tabular-nums" style={{ color: 'var(--tm-accent)' }}>{hoursMinutes(ft.free)}</span>
          <span className="text-[11px] text-text-muted truncate">free until {clock(ft.window[1])}</span>
        </p>
      )}
      <DayBar from={ft.from} to={ft.window[1]} pieces={ft.busy} />
      <p className="text-[11px] text-text-secondary truncate">{breakdownText(ft.totals)}</p>
      {error ? (
        <p role="alert" className="text-[11px] truncate" style={{ color: 'var(--tm-slipped-text)' }} title={error}>{error}</p>
      ) : planned || fits.length > 0 ? (
        <div className="flex items-center gap-1 min-w-0">
          {planned && (
            <span role="status" className="flex items-center gap-1 min-w-0 max-w-full rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ backgroundColor: 'var(--tm-success-subtle)', color: 'var(--tm-success-text)' }}>
              <Check className="w-3 h-3 flex-shrink-0" aria-hidden />
              <span className="truncate">{planned.fit.task.title} {timeRange(planned.fit.slot.start, planned.fit.slot.end)}</span>
              <button type="button" onClick={undo} className="flex-shrink-0 underline">Undo</button>
            </span>
          )}
          {fits.map(f => (
            <button
              key={f.task.id}
              type="button"
              onClick={() => plan(f)}
              disabled={busyId != null}
              title={`Plan ${f.task.title} at ${timeRange(f.slot.start, f.slot.end)}`}
              aria-label={`Plan ${f.task.title} at ${timeRange(f.slot.start, f.slot.end)}`}
              className="flex items-center gap-1 min-w-0 flex-1 basis-0 rounded-full px-2 py-0.5 text-[11px] font-semibold border transition-colors hover:bg-surface-raised"
              style={{ borderColor: 'var(--tm-border)', borderStyle: 'dashed', color: 'var(--tm-text-primary)' }}
            >
              {busyId === f.task.id ? <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" aria-hidden /> : <TaskDot task={f.task} />}
              <span className="truncate">{f.task.title}</span>
              <span className="flex-shrink-0 text-text-muted">{hoursMinutes(f.len)}</span>
            </button>
          ))}
        </div>
      ) : ft.free > 0 ? (
        <p className="text-[11px] text-text-muted truncate">Nothing due soon needs planning</p>
      ) : null}
      {defaultHours}
    </div>,
  );
};

/** The expanded Free Time tile: the whole work window, its free gaps, and what fits. */
export const FreeTimeOverlay: React.FC<FreeTimeProps> = ({ tasks, habits, profile }) => {
  const planner = useSlotPlanner({ enabled: true, tasks, habits, profile });
  const { planned, busyId, error, plan, undo } = usePlanFits();

  if (!planner) {
    return (
      <div className="flex flex-col gap-2" aria-label="Loading free time">
        {[0, 1, 2].map(i => <div key={i} className="h-8 rounded-md animate-pulse" style={{ backgroundColor: 'var(--tm-surface-raised)' }} />)}
      </div>
    );
  }

  const ft = freeTimeToday(planner.state, planner.today);
  if (!ft || ft.ended) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-text-secondary">{closedText(planner, ft ? ft.window[1] : null)}</p>
        {!planner.workHoursSet && <DefaultHoursLine />}
      </div>
    );
  }

  const [winStart, winEnd] = ft.window;
  const wholeDay = busyBetween(planner.state, planner.today, winStart, winEnd);
  const fits = fitsToday(planner.state, tasks, planner.workBlocks, planner.today, SLOT_COUNT)
    .filter(f => f.task.id !== planned?.fit.task.id);

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <p className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tabular-nums" style={{ color: 'var(--tm-accent)' }}>{hoursMinutes(ft.free)}</span>
          <span className="text-sm text-text-muted">free until {clock(winEnd)}</span>
        </p>
        <DayBar from={winStart} to={winEnd} pieces={wholeDay} pastUntil={ft.from} tall />
        <div className="flex justify-between text-[11px] text-text-muted tabular-nums">
          <span>{clock(winStart)}</span>
          <span>{clock(winEnd)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-secondary">
          {(['block', 'event', 'habit'] as BusyKind[]).map(k => (
            <span key={k} className="flex items-center gap-1">
              <span aria-hidden className="inline-block w-3 h-2 rounded-sm" style={KIND_STYLE[k]} />
              {KIND_LABEL[k]}s {hoursMinutes(ft.totals[k])}
            </span>
          ))}
        </div>
        {!planner.workHoursSet && <DefaultHoursLine />}
      </section>

      <section>
        <h3 className="text-sm font-semibold text-text-primary mb-2">Free for the rest of today</h3>
        {ft.gaps.length === 0 ? (
          <p className="text-xs text-text-muted">No free time left today.</p>
        ) : (
          <ul className="flex flex-col">
            {ft.gaps.map(([s, e]: Span) => (
              <li key={s} className="flex items-center justify-between gap-3 py-1.5 border-b last:border-b-0 text-xs" style={{ borderColor: 'var(--tm-border-subtle)' }}>
                <span className="tabular-nums text-text-primary">{timeRange(s, e)}</span>
                <span className="tabular-nums text-text-muted">{hoursMinutes(e - s)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold text-text-primary mb-2">Fits today</h3>
        {planned && (
          <p role="status" className="mb-2 text-xs" style={{ color: 'var(--tm-success-text)' }}>
            <Check className="inline w-3 h-3 mr-1" aria-hidden />
            Planned {planned.fit.task.title} {timeRange(planned.fit.slot.start, planned.fit.slot.end)}.{' '}
            <button type="button" onClick={undo} className="font-semibold underline">Undo</button>
          </p>
        )}
        {error && <p role="alert" className="mb-2 text-xs" style={{ color: 'var(--tm-slipped-text)' }}>{error}</p>}
        {fits.length === 0 ? (
          <p className="text-xs text-text-muted">Nothing due soon needs planning.</p>
        ) : (
          <ul className="flex flex-col">
            {fits.map(f => (
              <li key={f.task.id} className="flex items-center gap-2 py-1.5 border-b last:border-b-0 text-xs" style={{ borderColor: 'var(--tm-border-subtle)' }}>
                <TaskDot task={f.task} />
                <span className="min-w-0 flex-1 truncate font-medium text-text-primary">{f.task.title}</span>
                <span className="flex-shrink-0 tabular-nums text-text-muted">{timeRange(f.slot.start, f.slot.end)}</span>
                <button
                  type="button"
                  onClick={() => plan(f)}
                  disabled={busyId != null}
                  aria-label={`Plan ${f.task.title} at ${timeRange(f.slot.start, f.slot.end)}`}
                  className="btn btn-secondary text-xs px-2 py-1 gap-1 flex-shrink-0"
                >
                  {busyId === f.task.id ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden /> : <Plus className="w-3 h-3" aria-hidden />}
                  Plan
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default FreeTimeCard;
