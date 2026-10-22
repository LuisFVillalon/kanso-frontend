'use client';

import React, { useMemo, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import BigPictureCalendar, { BigPictureOverlay } from '@/app/components/calendar/BigPictureCalendar';
import CurrentMonthWidget, { CurrentMonthOverlay } from '@/app/components/calendar/CurrentMonthWidget';
import TasksStatsCard, { TasksOverlay } from '@/app/components/stats/TasksStatsCard';
import NotesStatsCard, { NotesOverlay } from '@/app/components/stats/NotesStatsCard';
import HabitsStatsCard, { HabitsOverlay } from '@/app/components/stats/HabitsStatsCard';
import TimersCard, { TimersOverlay } from '@/app/components/stats/TimersCard';
import DraggableGrid, { type DragHandleProps } from '@/app/components/common/DraggableGrid';
import Modal from '@/app/components/common/Modal';
import { useGridOrder } from '@/app/hooks/useGridOrder';
import { useDailyMood } from '@/app/hooks/useDailyMood';
import type { TileSize } from '@/app/components/stats/TileTools';
import { Habit } from '@/app/types/habit';
import { StatsData, TagStats } from '@/app/types/task';
import { Note } from '@/app/types/notes';
import type { ProfileFields, useProfile } from '@/app/hooks/useProfile';
import type { CalendarSettings } from '@/app/types/calendar';

// 'reserved' id kept as-is (rather than renamed to something calendar-ish)
// so any already-persisted layoutOrder (localStorage / profile.layoutOrder)
// keeps pointing at the right slot — it now renders CurrentMonthWidget.
const GRID_ITEM_IDS = ['calendar', 'timers', 'habits', 'tasks', 'notes', 'reserved'];
const GRID_ORDER_STORAGE_KEY = 'tm-dashboard-grid-order';

// Fixed per-tile sizes — the countdown and month calendar stay medium
// (taller, single-width), the four stat tiles stay small. No longer
// user-resizable; only drag-to-reorder and expand-to-overlay remain.
const TILE_SIZES: Record<string, TileSize> = {
  calendar: 'M', reserved: 'M', timers: 'S', tasks: 'S', habits: 'S', notes: 'S',
};
const TITLES: Record<string, string> = {
  calendar: 'Term Tracker', reserved: 'Current Month', timers: 'Timers', tasks: 'Task Stats', habits: 'Habit Tracker', notes: 'Note Stats',
};

// Explicit column-start classes for each of the grid's 4 tile slots (12-col
// grid ÷ 3 cols/slot). Literal Tailwind strings (not assembled from numbers
// at runtime) so Tailwind's content scanner actually generates them.
const COL_START_CLASSES = ['lg:col-start-1', 'lg:col-start-4', 'lg:col-start-7', 'lg:col-start-10'];
// Explicit row-start classes for the two rows a slot can hold.
const ROW_START_CLASSES = ['lg:row-start-1', 'lg:row-start-2'];

/**
 * Groups the flat `order` array into the grid's 4 slots — a medium tile
 * (spans both rows) always gets a slot to itself, and small tiles are
 * always paired two-per-slot, one per row. Pairing is positional (1st+2nd
 * small in `order`, 3rd+4th, ...), not adjacency-based, so dragging any
 * small tile past another reshuffles who's paired with whom. Slot
 * left-to-right order follows each group's first member's position in
 * `order`. Round-trips with `flattenSlots` below: flattening a slot list in
 * slot order and feeding it back through this function reconstructs the
 * exact same slots, which is what lets `handleDrop` rebuild `order` by
 * editing the slot list rather than re-deriving index math by hand.
 */
const computeSlots = (order: string[]): string[][] => {
  const mediumIds = order.filter(id => TILE_SIZES[id] === 'M');
  const smallIds = order.filter(id => TILE_SIZES[id] !== 'M');
  const pairs: string[][] = [];
  for (let i = 0; i < smallIds.length; i += 2) pairs.push(smallIds.slice(i, i + 2));

  return [
    ...mediumIds.map(id => ({ ids: [id], firstPos: order.indexOf(id) })),
    ...pairs.map(pair => ({ ids: pair, firstPos: order.indexOf(pair[0]) })),
  ]
    .sort((a, b) => a.firstPos - b.firstPos)
    .map(group => group.ids);
};

const flattenSlots = (slots: string[][]): string[] => slots.flat();

/** Assigns every tile an explicit grid-column + grid-row from its slot. */
const computeItemClasses = (order: string[]): Record<string, string> => {
  const classes: Record<string, string> = {};
  computeSlots(order).forEach((ids, slot) => {
    const colStart = COL_START_CLASSES[slot] ?? COL_START_CLASSES[COL_START_CLASSES.length - 1];
    ids.forEach((id, row) => {
      const rowSpan = TILE_SIZES[id] === 'M' ? 'lg:row-span-2' : 'lg:row-span-1';
      classes[id] = `${colStart} lg:col-span-3 ${ROW_START_CLASSES[row]} ${rowSpan}`;
    });
  });
  return classes;
};

interface CalendarAndStatsProps {
  habits: Habit[];
  onToggleHabit: (id: number) => void;
  onCreateHabit: () => void;
  pendingHabitIds?: Set<number>;
  habitsLoading?: boolean;
  stats: StatsData;
  allNotes: Note[];
  noteTags: TagStats[];
  profile: ProfileFields;
  onSaveProfile: ReturnType<typeof useProfile>['saveProfile'];
  calendarSettings: CalendarSettings;
  calendarSettingsLoading: boolean;
}

const CalendarAndStats: React.FC<CalendarAndStatsProps> = ({
  habits,
  onToggleHabit,
  onCreateHabit,
  pendingHabitIds,
  habitsLoading,
  stats,
  allNotes,
  noteTags,
  profile,
  onSaveProfile,
  calendarSettings,
  calendarSettingsLoading,
}) => {
  const [order, setOrder] = useGridOrder(
    GRID_ORDER_STORAGE_KEY,
    GRID_ITEM_IDS,
    profile.layoutOrder,
    next => { onSaveProfile({ ...profile, layoutOrder: next }); },
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const showMood = useDailyMood() === true;

  // Month/year shown in the 'reserved' (Current Month) overlay — separate
  // from the actual current date so the header's prev/next buttons can page
  // through months without affecting the compact dashboard tile.
  const [monthViewYear, setMonthViewYear] = useState(() => new Date().getFullYear());
  const [monthViewMonth, setMonthViewMonth] = useState(() => new Date().getMonth());

  // Wraps within monthViewYear rather than rolling into adjacent years —
  // the carousel is scoped to the current year only.
  const goPrevMonth = () => setMonthViewMonth(m => (m === 0 ? 11 : m - 1));
  const goNextMonth = () => setMonthViewMonth(m => (m === 11 ? 0 : m + 1));

  const tasksProps = { tasks: stats.total.tasks, total: stats.total.tasks.length };

  const overlayBody = (id: string) => {
    switch (id) {
      case 'calendar': return <BigPictureOverlay settings={calendarSettings} settingsLoading={calendarSettingsLoading} />;
      case 'reserved': return <CurrentMonthOverlay year={monthViewYear} month={monthViewMonth} showMood={showMood} />;
      case 'timers': return <TimersOverlay profile={profile} settings={calendarSettings} settingsLoading={calendarSettingsLoading} />;
      case 'tasks': return <TasksOverlay {...tasksProps} />;
      case 'habits': return <HabitsOverlay habits={habits} onToggle={onToggleHabit} pendingHabitIds={pendingHabitIds} />;
      case 'notes': return <NotesOverlay notes={allNotes} noteTags={noteTags} />;
      default: return null;
    }
  };

  const renderItem = (id: string, _index: number, dragHandleProps: DragHandleProps) => {
    const tools = {
      onExpand: () => {
        setExpandedId(id);
        if (id === 'reserved') {
          const now = new Date();
          setMonthViewYear(now.getFullYear());
          setMonthViewMonth(now.getMonth());
        }
      },
      dragHandleProps,
    };
    switch (id) {
      case 'calendar': return <BigPictureCalendar {...tools} settings={calendarSettings} settingsLoading={calendarSettingsLoading} />;
      case 'reserved': return <CurrentMonthWidget {...tools} showMood={showMood} />;
      case 'timers': return <TimersCard profile={profile} {...tools} settings={calendarSettings} settingsLoading={calendarSettingsLoading} />;
      case 'tasks': return <TasksStatsCard {...tasksProps} {...tools} />;
      case 'habits': return (
        <HabitsStatsCard
          habits={habits}
          onToggle={onToggleHabit}
          onCreate={onCreateHabit}
          pendingHabitIds={pendingHabitIds}
          loading={habitsLoading}
          {...tools}
        />
      );
      case 'notes': return <NotesStatsCard notes={allNotes} noteTags={noteTags} {...tools} />;
      default: return null;
    }
  };

  // lg:-prefixed placement classes only take effect at lg+ — below that
  // every tile falls back to a single full-width, auto-height track
  // (grid-cols-1).
  const itemClasses = useMemo(() => computeItemClasses(order), [order]);
  const itemClassName = (id: string) => itemClasses[id] ?? '';

  const siblingOf = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    for (const ids of computeSlots(order)) {
      if (ids.length === 2) {
        map[ids[0]] = ids[1];
        map[ids[1]] = ids[0];
      }
    }
    return (id: string) => map[id];
  }, [order]);

  /**
   * Dropping tile A onto tile B means different things depending on size:
   *  - same size (both big, or both small): a straight positional swap — A
   *    and B trade places in `order` and nothing else moves. (Not a
   *    remove-and-reinsert: that would shift every tile between A's and B's
   *    old positions by one, i.e. rotate them, instead of just swapping the
   *    two dropped-on tiles.)
   *  - different size (a big onto a small, or a small onto a big): a whole-
   *    slot swap. A big can't half-occupy a slot and a small pair can't
   *    span two rows alone, so the only sensible result is the two entire
   *    slots trading places — the big takes over the pair's 2-row slot and
   *    the pair (both its tiles, not just the one dropped on) takes over
   *    the big's old slot.
   */
  const handleDrop = (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    if (TILE_SIZES[draggedId] === TILE_SIZES[targetId]) {
      const next = [...order];
      const fromIdx = next.indexOf(draggedId);
      const toIdx = next.indexOf(targetId);
      next[fromIdx] = targetId;
      next[toIdx] = draggedId;
      setOrder(next);
      return;
    }
    const slots = computeSlots(order);
    const fromSlotIdx = slots.findIndex(ids => ids.includes(draggedId));
    const toSlotIdx = slots.findIndex(ids => ids.includes(targetId));
    const nextSlots = slots.map((ids, i) => {
      if (i === fromSlotIdx) return slots[toSlotIdx];
      if (i === toSlotIdx) return slots[fromSlotIdx];
      return ids;
    });
    setOrder(flattenSlots(nextSlots));
  };

  return (
    <div className="mb-4 sm:mb-6">
      <DraggableGrid
        order={order}
        onDrop={handleDrop}
        items={renderItem}
        itemClassName={itemClassName}
        titles={TITLES}
        groupOf={id => TILE_SIZES[id]}
        siblingOf={siblingOf}
        className="grid grid-cols-1 lg:grid-cols-12 lg:auto-rows-[168px] gap-3"
      />

      {expandedId && (
        <Modal
          onClose={() => setExpandedId(null)}
          layer="raised"
          panelClassName="modal-panel w-full max-w-3xl max-h-[86vh] overflow-y-auto scrollbar-custom p-6"
        >
          <div className="flex items-center mb-4">
            {expandedId === 'reserved' ? (
              <div className="flex items-center gap-2">
                <h2 className="text-xl text-text-primary">{monthViewYear}</h2>
                <button
                  type="button"
                  onClick={goPrevMonth}
                  aria-label="Previous month"
                  className="w-7 h-7 rounded-md border flex items-center justify-center text-text-secondary transition-colors hover:bg-surface-raised"
                  style={{ borderColor: 'var(--tm-border)' }}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={goNextMonth}
                  aria-label="Next month"
                  className="w-7 h-7 rounded-md border flex items-center justify-center text-text-secondary transition-colors hover:bg-surface-raised"
                  style={{ borderColor: 'var(--tm-border)' }}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <h2 className="text-xl text-text-primary">
                {expandedId === 'calendar' && calendarSettings.title
                  ? `Term Tracker: ${calendarSettings.title}`
                  : TITLES[expandedId]}
              </h2>
            )}
            <button
              type="button"
              onClick={() => setExpandedId(null)}
              aria-label="Close"
              className="ml-auto w-[30px] h-[30px] rounded-lg border flex items-center justify-center text-text-secondary transition-colors hover:bg-surface-raised"
              style={{ borderColor: 'var(--tm-border)' }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {overlayBody(expandedId)}
        </Modal>
      )}
    </div>
  );
};

export default CalendarAndStats;
