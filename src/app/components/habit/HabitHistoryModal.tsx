'use client';
import React, { useEffect, useState } from 'react';
import { X, ArrowLeft, Flame, Star, Loader2 } from 'lucide-react';
import { fetchHabitHistory } from '@/app/lib/backend-api';
import { Habit, HabitHistoryEntry } from '@/app/types/habit';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import Modal from '@/app/components/common/Modal';

interface HabitHistoryModalProps {
  habit: Habit | null;
  showBackButton?: boolean;
  onClose: () => void;
  onToggleDate: (habitId: number, date: string) => Promise<void>;
}

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const HabitHistoryModal: React.FC<HabitHistoryModalProps> = ({ habit, showBackButton = false, onClose, onToggleDate }) => {
  const [history, setHistory] = useState<HabitHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    if (!habit) {
      setHistory([]);
      return;
    }
    setToggling(null);
    setLoading(true);
    fetchHabitHistory(habit.id)
      .then(data => setHistory(data))
      .catch(err => console.error('[HabitHistoryModal] Failed to fetch history:', err))
      .finally(() => setLoading(false));
  }, [habit?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!habit) return null;

  // Build a calendar grid for the past 30 days aligned to Mon–Sun weeks
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 29); // 30 days including today

  // Convert JS day-of-week (0=Sun) → ISO (0=Mon, 6=Sun) for column alignment
  const startDow = (startDate.getDay() + 6) % 7;

  const loggedSet = new Set(history.filter(e => e.logged).map(e => e.date));
  const todayStr = toLocalDateStr(today);
  // "Today" is tracked authoritatively on the habit object itself (shared
  // with the stats-card checkbox), not the independently-fetched history
  // list — override so this calendar can never disagree with the checkbox.
  if (habit.logged_today) loggedSet.add(todayStr);
  else loggedSet.delete(todayStr);

  const cells: (Date | null)[] = Array(startDow).fill(null);
  for (let i = 0; i < 30; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    cells.push(d);
  }
  // Pad to complete the final row
  const remainder = cells.length % 7;
  if (remainder !== 0) {
    for (let i = 0; i < 7 - remainder; i++) cells.push(null);
  }

  const handleDayClick = async (date: Date) => {
    if (toggling) return;
    const dateStr = toLocalDateStr(date);

    // Optimistic update
    setHistory(prev =>
      prev.map(e => (e.date === dateStr ? { ...e, logged: !e.logged } : e)),
    );

    setToggling(dateStr);
    try {
      await onToggleDate(habit.id, dateStr);
    } catch {
      // Revert on error
      setHistory(prev =>
        prev.map(e => (e.date === dateStr ? { ...e, logged: !e.logged } : e)),
      );
    } finally {
      setToggling(null);
    }
  };

  return (
    <Modal onClose={onClose} layer="elevated">
      {/* Header */}
      <div
        className="px-5 py-4 border-b border-border-subtle flex justify-between items-center"
        style={{ backgroundColor: 'var(--tm-surface)' }}
      >
        <div>
          <h3 className="text-base font-semibold text-text-primary leading-tight">{habit.title}</h3>
          <p className="text-xs text-text-muted mt-0.5">Past 30 days</p>
        </div>
        <button
          onClick={onClose}
          className="btn btn-ghost"
          aria-label={showBackButton ? 'Back to manage habits' : 'Close history'}
        >
          {showBackButton ? <ArrowLeft className="w-5 h-5" /> : <X className="w-5 h-5" />}
        </button>
      </div>

      {/* Live streak summary — updates instantly when parent habit state changes */}
      <div className="px-5 py-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-border-subtle">
        <div className="flex items-center gap-1.5">
          <Flame className="w-4 h-4" style={{ color: '#F97316' }} />
          <span className="text-sm font-bold" style={{ color: '#F97316' }}>{habit.current_streak}</span>
          <span className="text-xs text-text-muted">current streak</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Star className="w-4 h-4" style={{ color: '#EAB308' }} />
          <span className="text-sm font-bold" style={{ color: '#EAB308' }}>{habit.max_streak}</span>
          <span className="text-xs text-text-muted">best</span>
        </div>
        {/* A broken streak gets a fresh start, never a guilt trip (brand voice). */}
        {habit.current_streak === 0 && habit.max_streak > 0 && (
          <p className="basis-full text-xs text-text-secondary">Fresh page. Pick up where it feels easy.</p>
        )}
      </div>

      {/* Calendar */}
      <div className="p-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
          </div>
        ) : (
          <>
            {/* Day-of-week headers */}
            <div className="grid grid-cols-7 mb-1">
              {DAY_HEADERS.map(d => (
                <div key={d} className="text-center text-[10px] font-medium text-text-muted py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-1">
              {cells.map((date, i) => {
                if (!date) return <div key={`empty-${i}`} />;

                const dateStr = toLocalDateStr(date);
                const isToday = dateStr === todayStr;
                const isLogged = loggedSet.has(dateStr);
                const isToggling = toggling === dateStr;

                return (
                  <button
                    key={dateStr}
                    onClick={() => handleDayClick(date)}
                    disabled={isToggling}
                    title={dateStr}
                    aria-label={`${dateStr}${isLogged ? ' (logged)' : ''}`}
                    aria-pressed={isLogged}
                    className="relative aspect-square rounded-md flex flex-col items-center justify-center transition-all hover:opacity-80 active:scale-95"
                    style={{
                      backgroundColor: isLogged
                        ? 'var(--tm-accent)'
                        : 'var(--tm-surface-raised)',
                      color: isLogged ? 'var(--tm-accent-text)' : 'var(--tm-text-primary)',
                      outline: isToday ? '2px solid var(--tm-accent)' : 'none',
                      outlineOffset: '2px',
                      opacity: isToggling ? 0.5 : 1,
                      cursor: isToggling ? 'wait' : 'pointer',
                    }}
                  >
                    <span className="text-[10px] font-medium leading-none">{date.getDate()}</span>
                    {isLogged && (
                      <span className="text-[8px] leading-none mt-0.5 opacity-90">✓</span>
                    )}
                  </button>
                );
              })}
            </div>

            <p className="text-[10px] text-text-muted text-center mt-3">
              Click any day to toggle. Today is highlighted with a border.
            </p>
          </>
        )}
      </div>

      <div className="px-5 pb-4 flex justify-end">
        <button onClick={onClose} className="btn btn-secondary px-5 py-2">
          {showBackButton ? 'Back' : 'Close'}
        </button>
      </div>
    </Modal>
  );
};

export default HabitHistoryModal;
