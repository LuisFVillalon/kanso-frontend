'use client';

import React, { useEffect, useState } from 'react';
import { Check, Cuboid, Flame, Repeat, Star } from 'lucide-react';
import { fetchHabitHistory } from '@/app/lib/backend-api';
import { Habit, HabitHistoryEntry } from '@/app/types/habit';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import { CardShell } from './CardShell';
import { ProgressRing } from './charts';
import TileTools from './TileTools';
import type { DragHandleProps } from '@/app/components/common/DraggableGrid';

// The habit lists' scrollbar thumb — scrollbar-custom's border-colored thumb
// all but disappears on the card, so a long list wouldn't look scrollable.
const HABIT_LIST_SCROLLBAR: React.CSSProperties = {
  scrollbarColor: 'color-mix(in srgb, var(--tm-text-muted) 45%, transparent) transparent',
};

interface StreakBadgeProps {
  icon: React.ReactNode;
  value: number;
  color: string;
  title: string;
}

// A flat-fill pill tinted from its own icon color — used for the
// current/best streak counts on each habit row.
const StreakBadge: React.FC<StreakBadgeProps> = ({ icon, value, color, title }) => (
  <div
    className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full flex-shrink-0"
    style={{ backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
    title={title}
  >
    {icon}
    <span className="text-xs font-semibold leading-none">{value}</span>
  </div>
);

interface HabitRowProps {
  habit: Habit;
  onToggle: (id: number) => void;
  onSelectHeatmap: (id: number) => void;
  heatmapSelected?: boolean;
  pending?: boolean;
}

const HabitRow: React.FC<HabitRowProps> = ({ habit, onToggle, onSelectHeatmap, heatmapSelected, pending }) => {
  const done = habit.logged_today;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelectHeatmap(habit.id)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelectHeatmap(habit.id);
        }
      }}
      className={`group flex flex-col -mx-1.5 px-1.5 py-1.5 rounded-md transition-colors cursor-pointer ${done ? '' : 'hover:bg-surface-raised'}`}
      style={
        done
          ? { backgroundColor: 'var(--tm-success-subtle)' }
          : heatmapSelected
          ? { backgroundColor: 'var(--tm-accent-subtle)' }
          : undefined
      }
      aria-pressed={heatmapSelected}
      aria-label={`View 90-day heatmap for ${habit.title}`}
    >
      <div className="flex items-center gap-2">
        <button
          onClick={e => {
            e.stopPropagation();
            onToggle(habit.id);
          }}
          disabled={pending}
          className={`flex-shrink-0 w-5 h-5 rounded-sm border-2 flex items-center justify-center transition-all active:scale-90 ${
            done ? 'border-[var(--tm-success)] bg-[var(--tm-success-subtle)]' : 'border-border hover:border-accent'
          }`}
          style={{ opacity: pending ? 0.5 : 1, cursor: pending ? 'wait' : 'pointer' }}
          aria-label={done ? `Unmark ${habit.title}` : `Mark ${habit.title} done`}
        >
          {done && <Check className="w-3 h-3 text-success-text" strokeWidth={3} />}
        </button>
        <span className="flex-1 flex items-center gap-1.5 min-w-0">
          {habit.tags.length > 0 && (
            <span className="flex items-center gap-0.5 flex-shrink-0">
              {habit.tags.map(tag => (
                <span
                  key={tag.id}
                  className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: tag.color ?? 'var(--tm-accent)' }}
                  title={tag.name}
                />
              ))}
            </span>
          )}
          <span
            className={`text-base truncate font-medium ${done ? 'line-through text-text-muted' : ''}`}
            style={done ? undefined : { color: 'var(--tm-text-primary)' }}
          >
            {habit.title}
          </span>
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          <StreakBadge icon={<Flame className="w-3 h-3" />} value={habit.current_streak} color="#F97316" title="Current streak" />
          {habit.max_streak > habit.current_streak && (
            <StreakBadge icon={<Star className="w-3 h-3" />} value={habit.max_streak} color="#EAB308" title="Best streak" />
          )}
        </div>
      </div>
    </div>
  );
};

interface HabitHeatmapProps {
  habit: Habit;
}

// GitHub-contribution-style 90-day heatmap for a single habit — a rolling
// window in fixed-width rows, oldest first (see below). Overlay-only
// (the compact tile shows a 7-day dot strip per row instead — see
// useHabitWeekDots below).
const HEATMAP_DAYS = 90;

const HabitHeatmap: React.FC<HabitHeatmapProps> = ({ habit }) => {
  const [history, setHistory] = useState<HabitHistoryEntry[]>([]);
  // Tracks which habit `history` was fetched for, so loading state can be
  // derived during render instead of set synchronously inside the effect.
  const [loadedHabitId, setLoadedHabitId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchHabitHistory(habit.id, HEATMAP_DAYS)
      .then(data => {
        if (cancelled) return;
        setHistory(data);
        setLoadedHabitId(habit.id);
      })
      .catch(err => console.error('[HabitHeatmap] Failed to fetch history:', err));
    return () => { cancelled = true; };
  }, [habit.id]);

  const loading = loadedHabitId !== habit.id;

  const DAYS = HEATMAP_DAYS;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - (DAYS - 1)); // DAYS days including today

  const loggedSet = new Set(history.filter(e => e.logged).map(e => e.date));
  const todayStr = toLocalDateStr(today);
  // "Today" is tracked authoritatively on the habit object itself (shared
  // with the stats-card checkbox), not the independently-fetched history
  // list — override so this heatmap can never disagree with the checkbox.
  if (habit.logged_today) loggedSet.add(todayStr);
  else loggedSet.delete(todayStr);

  // Rolling DAYS-day window chunked into fixed-width rows, oldest → newest,
  // left-to-right then top-to-bottom (like reading text) rather than
  // aligned to real calendar weeks — so the grid is always wider than it
  // is tall, and today always lands in the bottom-right corner regardless
  // of which weekday it falls on. Padding cells go at the start (oldest
  // side) so the real days end exactly on the last cell.
  const COLUMNS = 15;
  const padCount = (COLUMNS - (DAYS % COLUMNS)) % COLUMNS;
  const cells: (Date | null)[] = Array(padCount).fill(null);
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    cells.push(d);
  }
  const loggedCount = cells.filter(d => d && loggedSet.has(toLocalDateStr(d))).length;
  const pct = Math.round((loggedCount / DAYS) * 100);

  // Tiered color so the ring and count warm from amber to blue to green as
  // the DAYS-day rate climbs, echoing the streak badges' color language.
  const ringColor =
    pct >= 70 ? 'var(--tm-success)' :
    pct >= 40 ? 'var(--tm-accent)' :
    loggedCount > 0 ? 'var(--tm-warning)' :
    'var(--tm-text-muted)';

  const dateFmt: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const sameYear = startDate.getFullYear() === today.getFullYear();
  const rangeLabel = sameYear
    ? `${startDate.toLocaleDateString(undefined, dateFmt)} – ${today.toLocaleDateString(undefined, { ...dateFmt, year: 'numeric' })}`
    : `${startDate.toLocaleDateString(undefined, { ...dateFmt, year: 'numeric' })} – ${today.toLocaleDateString(undefined, { ...dateFmt, year: 'numeric' })}`;

  return (
    <div className="flex flex-col gap-2 w-full min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-text-primary truncate min-w-0" title={habit.title}>
          {habit.title}
        </span>
        {loading ? (
          <div className="rounded-full animate-pulse flex-shrink-0" style={{ width: 52, height: 52, backgroundColor: 'var(--tm-surface-raised)' }} />
        ) : (
          <ProgressRing pct={pct} color={ringColor} centerLabel={`${pct}%`} size={52} strokeWidth={5} hideLabel />
        )}
      </div>

      <div className="grid grid-cols-[repeat(15,minmax(0,1fr))] gap-1 w-full">
        {cells.map((date, i) => {
          if (loading || !date) return <div key={i} className={`aspect-square rounded ${loading ? 'animate-pulse' : ''}`} style={loading ? { backgroundColor: 'var(--tm-surface-raised)' } : undefined} />;
          const dateStr = toLocalDateStr(date);
          const isLogged = loggedSet.has(dateStr);
          const isToday = dateStr === todayStr;
          return (
            <div
              key={i}
              title={`${date.toLocaleDateString(undefined, dateFmt)}${isLogged ? ' — done' : ' — not logged'}${isToday ? ' (today)' : ''}`}
              className="relative aspect-square rounded transition-transform hover:z-10 hover:scale-125"
              style={{
                backgroundColor: isLogged ? 'var(--tm-accent)' : 'var(--tm-surface-raised)',
                border: isLogged ? 'none' : '1px solid var(--tm-border-subtle)',
                boxShadow: isToday ? '0 0 0 1px var(--tm-accent), 0 0 0 3px var(--tm-accent-subtle)' : 'none',
                transitionDuration: 'var(--tm-dur-base)',
                transitionTimingFunction: 'var(--tm-ease)',
              }}
            />
          );
        })}
      </div>

      <div className="flex items-end justify-between gap-2">
        {loading ? (
          <div className="rounded animate-pulse" style={{ width: 96, height: 14, backgroundColor: 'var(--tm-surface-raised)' }} />
        ) : (
          <span className="text-[11px] font-bold truncate" style={{ color: 'var(--tm-text-primary)' }}>{rangeLabel}</span>
        )}
        {loading ? (
          <div className="rounded animate-pulse flex-shrink-0" style={{ width: 56, height: 18, backgroundColor: 'var(--tm-surface-raised)' }} />
        ) : (
          <span className="text-sm flex-shrink-0 whitespace-nowrap">
            <span className="font-bold" style={{ color: 'var(--tm-text-primary)' }}>{loggedCount}</span>
            <span className="text-xs font-semibold text-text-muted">/{DAYS} days</span>
          </span>
        )}
      </div>
    </div>
  );
};

// ── Overlay (today's full row list + 90-day heatmap, unchanged) ──────────────

interface HabitsOverlayProps {
  habits: Habit[];
  onToggle: (id: number) => void;
  pendingHabitIds?: Set<number>;
}

export const HabitsOverlay: React.FC<HabitsOverlayProps> = ({ habits, onToggle, pendingHabitIds }) => {
  const [heatmapHabitId, setHeatmapHabitId] = useState<number | null>(null);

  if (habits.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-3 text-center">
        <Repeat className="w-5 h-5 text-text-muted" strokeWidth={1.5} />
        <p className="text-xs sm:text-sm text-text-muted">No habits yet — start a streak.</p>
      </div>
    );
  }

  // Default to the top habit so the right-hand slot is never empty; fall
  // back automatically if the previously-selected habit disappears (e.g. deleted).
  const heatmapHabit = habits.find(h => h.id === heatmapHabitId) ?? habits[0] ?? null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5 max-h-64 overflow-y-auto overflow-x-hidden scrollbar-custom pr-1" style={HABIT_LIST_SCROLLBAR}>
        {habits.map(h => (
          <HabitRow
            key={h.id}
            habit={h}
            onToggle={onToggle}
            onSelectHeatmap={setHeatmapHabitId}
            heatmapSelected={heatmapHabit?.id === h.id}
            pending={pendingHabitIds?.has(h.id)}
          />
        ))}
      </div>
      <div className="flex items-center justify-center">
        {heatmapHabit && <HabitHeatmap habit={heatmapHabit} />}
      </div>
    </div>
  );
};

// ── Compact tile ──────────────────────────────────────────────────────────────

const WEEK_DOT_DAYS = 7;

// Per-habit last-7-day logged/not-logged strip, oldest→newest. Scoped to
// this tile (rather than sharing useYearCalendarData, which already fetches
// per-habit history for the whole year for the month widget) since it only
// needs a week — one extra small fetch per habit instead of pulling in that
// heavier hook's whole-year fetch here too.
const useHabitWeekDots = (habits: Habit[]) => {
  const [dots, setDots] = useState<Map<number, boolean[]>>(new Map());

  useEffect(() => {
    if (habits.length === 0) { setDots(new Map()); return; }
    let cancelled = false;

    Promise.all(habits.map(h => fetchHabitHistory(h.id, WEEK_DOT_DAYS).then(entries => [h.id, entries] as const)))
      .then(results => {
        if (cancelled) return;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = toLocalDateStr(today);
        const map = new Map<number, boolean[]>();
        for (const [habitId, entries] of results) {
          const loggedSet = new Set(entries.filter(e => e.logged).map(e => e.date));
          const habit = habits.find(h => h.id === habitId);
          if (habit?.logged_today) loggedSet.add(todayStr);
          else loggedSet.delete(todayStr);

          const days: boolean[] = [];
          for (let i = WEEK_DOT_DAYS - 1; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            days.push(loggedSet.has(toLocalDateStr(d)));
          }
          map.set(habitId, days);
        }
        setDots(map);
      })
      .catch(err => console.error('[HabitsStatsCard] Failed to fetch week dots:', err));

    return () => { cancelled = true; };
    // habits.length is a reasonable proxy for habit set identity — mirrors
    // useYearCalendarData's own dependency choice for the same reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habits.length]);

  return dots;
};

interface CompactHabitRowProps {
  habit: Habit;
  onToggle: (id: number) => void;
  weekDots?: boolean[];
  pending?: boolean;
}

const CompactHabitRow: React.FC<CompactHabitRowProps> = ({ habit, onToggle, weekDots, pending }) => {
  const done = habit.logged_today;
  return (
    <div
      className="flex items-start gap-2 px-1.5 py-1.5 rounded-md min-w-0"
      style={{
        backgroundColor: done ? 'var(--tm-success-subtle)' : 'transparent',
      }}
    >
      <button
        onClick={() => onToggle(habit.id)}
        disabled={pending}
        className={`mt-0.5 flex-shrink-0 w-[15px] h-[15px] rounded-sm border-2 flex items-center justify-center transition-all active:scale-90 ${
          done
            ? 'border-[var(--tm-success)] bg-[var(--tm-success-subtle)]'
            : 'border-border hover:border-accent'
        }`}
        style={{
          opacity: pending ? 0.5 : 1,
          cursor: pending ? 'wait' : 'pointer',
        }}
        aria-label={
          done ? `Unmark ${habit.title}` : `Mark ${habit.title} done`
        }
      >
        {done && (
          <Check className="w-2.5 h-2.5 text-success-text" strokeWidth={3} />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <span
          className={`block text-xs font-medium leading-4 whitespace-normal break-words ${
            done ? 'line-through text-text-muted' : ''
          }`}
          style={done ? undefined : { color: 'var(--tm-text-primary)' }}
          title={habit.title}
        >
          {habit.title}
        </span>

        <div className="flex items-center gap-2 mt-1">
          <span className="flex items-center gap-[1.5px]">
            {(weekDots ?? Array(WEEK_DOT_DAYS).fill(false)).map(
              (logged, i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-[2px]"
                  style={{
                    backgroundColor: logged
                      ? 'var(--tm-accent)'
                      : 'var(--tm-surface-raised)',
                    border: logged
                      ? 'none'
                      : '1px solid var(--tm-border-subtle)',
                  }}
                />
              ),
            )}
          </span>

          <StreakBadge
            icon={<Flame className="w-2.5 h-2.5" />}
            value={habit.current_streak}
            color="#F97316"
            title="Current streak"
          />
        </div>
      </div>
    </div>
  );
};

interface HabitsStatsCardProps {
  habits: Habit[];
  onToggle: (id: number) => void;
  onCreate?: () => void;
  pendingHabitIds?: Set<number>;
  loading?: boolean;
  onExpand: () => void;
  dragHandleProps: DragHandleProps;
}

const HabitsStatsCard: React.FC<HabitsStatsCardProps> = ({
  habits, onToggle, onCreate, pendingHabitIds, loading, onExpand, dragHandleProps,
}) => {
  const weekDots = useHabitWeekDots(habits);
  const doneToday = habits.filter(h => h.logged_today).length;

  const badge = habits.length > 0 && (
    <span className="text-[11px] font-semibold flex-shrink-0" style={{ color: 'var(--tm-success-text)' }}>
      {doneToday} / {habits.length} today
    </span>
  );

  if (loading) {
    return (
      <CardShell compact icon={<Cuboid className="w-3.5 h-3.5" style={{ color: 'var(--tm-accent)' }} />} header="Habits">
        <div className="flex-1 min-h-0 flex flex-col gap-1.5 justify-center">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-6 rounded-md animate-pulse" style={{ backgroundColor: 'var(--tm-surface-raised)' }} />
          ))}
        </div>
      </CardShell>
    );
  }

  return (
    <CardShell
      compact
      icon={<Cuboid className="w-3.5 h-3.5" style={{ color: 'var(--tm-accent)' }} />}
      header="Habits"
      headerAction={
        <>
          {badge}
          <TileTools onExpand={onExpand} dragHandleProps={dragHandleProps} />
        </>
      }
    >
      {habits.length === 0 ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-1.5 text-center">
          <Repeat className="w-4 h-4 text-text-muted" strokeWidth={1.5} />
          <p className="text-[11px] text-text-muted">No habits yet.</p>
          {onCreate && (
            <button onClick={onCreate} className="btn btn-secondary text-xs px-2.5 py-1">
              Create a habit
            </button>
          )}
        </div>
      ) : (
        // Scrolls once the rows outgrow the tile — `safe center` keeps a short
        // list centered but pins a long one to the top so its first rows
        // stay reachable, and the darker thumb shows there's more below.
        <div
          className="flex-1 min-h-0 grid grid-cols-2 gap-x-4 gap-y-1 [align-content:safe_center] overflow-y-auto overflow-x-hidden scrollbar-custom pr-1"
          style={HABIT_LIST_SCROLLBAR}
        >
          {habits.map(h => (
            <CompactHabitRow
              key={h.id}
              habit={h}
              onToggle={onToggle}
              weekDots={weekDots.get(h.id)}
              pending={pendingHabitIds?.has(h.id)}
            />
          ))}
        </div>
      )}
    </CardShell>
  );
};

export default HabitsStatsCard;
