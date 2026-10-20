import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchHabits,
  toggleHabitDate,
  verifyHabitStreaks,
  deleteHabit as deleteHabitApi,
  archiveHabit as archiveHabitApi,
  restoreHabit as restoreHabitApi,
  describeError,
} from '@/app/lib/backend-api';
import { useToast } from '@/app/context/ToastContext';
import { Habit } from '@/app/types/habit';
import { toLocalDateStr } from '@/app/utils/dateUtils';

/**
 * @param enabled - Set false to skip the initial fetch (e.g. no signed-in
 * user yet) — called from HabitsProvider (context/HabitsContext.tsx), which
 * gates this on auth so pages outside the signed-in app never fire it.
 */
export function useHabits(enabled: boolean) {
  const showToast = useToast();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitsLoading, setHabitsLoading] = useState(true);
  // Toggles read-modify-write the streak server-side, so overlapping requests
  // for the same habit (rapid double-clicks) can race and land out of order,
  // corrupting current_streak. pendingIds blocks a habit from being toggled
  // again until its in-flight request settles. Ref is the synchronous guard;
  // state just mirrors it so the UI can show/disable the pending habit.
  const pendingRef = useRef<Set<number>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());
  // Bumped only once the server has confirmed an archive, delete or restore,
  // so the daily debrief can re-fetch without racing the request.
  const [syncToken, setSyncToken] = useState(0);

  // Mirrors `habits` so callbacks can read the latest list without a stale closure.
  const habitsRef = useRef<Habit[]>([]);
  useEffect(() => { habitsRef.current = habits; }, [habits]);

  const load = useCallback(async () => {
    try {
      await verifyHabitStreaks();
      const data = await fetchHabits();
      setHabits(data);
    } catch (err) {
      console.error('[useHabits] Failed to load habits:', err);
    } finally {
      setHabitsLoading(false);
    }
  }, []);

  useEffect(() => { if (enabled) load(); }, [enabled, load]);

  const toggleDate = useCallback(async (id: number, date: string) => {
    if (pendingRef.current.has(id)) return;
    pendingRef.current.add(id);
    setPendingIds(new Set(pendingRef.current));

    // toggle-habit-date recalculates current_streak/max_streak correctly, but
    // its logged_today field reflects the server's clock, which can be a
    // different calendar day than the client's local date — trusting it was
    // why the checkbox saved correctly but visually flipped back and forth.
    // So when the toggled date is today (client-side), keep our own
    // optimistic flip instead of the response's logged_today.
    const isToday = date === toLocalDateStr(new Date());
    let optimisticLoggedToday = false;

    if (isToday) {
      setHabits(prev =>
        prev.map(h => {
          if (h.id !== id) return h;
          optimisticLoggedToday = !h.logged_today;
          return { ...h, logged_today: optimisticLoggedToday };
        }),
      );
    }

    try {
      const updated = await toggleHabitDate(id, date);
      setHabits(prev =>
        prev.map(h =>
          h.id === id ? { ...updated, logged_today: isToday ? optimisticLoggedToday : updated.logged_today } : h,
        ),
      );
    } catch (err) {
      console.error('[useHabits] Failed to toggle habit date:', err);
      load();
    } finally {
      pendingRef.current.delete(id);
      setPendingIds(new Set(pendingRef.current));
    }
  }, [load]);

  // The "today" checkbox (habit stats card) always targets the client's own
  // local date, routed through the same toggleDate path as the history
  // calendar — so both surfaces agree on what "today" means and stay in sync.
  const toggle = useCallback((id: number) => toggleDate(id, toLocalDateStr(new Date())), [toggleDate]);

  // Puts a habit restored from the Archive or Recently deleted page (or by an
  // Undo) back into the list, in id order like the server returns them.
  const restoreHabit = useCallback((restored: Habit) => {
    setHabits(prev => [...prev.filter(h => h.id !== restored.id), restored].sort((a, b) => a.id - b.id));
    setSyncToken(v => v + 1);
  }, []);

  // Optimistically drops a habit from the list while `request` runs, putting
  // it back if the request fails. Returns whether it succeeded.
  const removeWhile = useCallback(async (habit: Habit, request: () => Promise<unknown>, failure: string) => {
    if (pendingRef.current.has(habit.id)) return false;
    pendingRef.current.add(habit.id);
    setPendingIds(new Set(pendingRef.current));
    const removed = habitsRef.current.find(h => h.id === habit.id) ?? habit;
    setHabits(prev => prev.filter(h => h.id !== habit.id));
    try {
      await request();
      setSyncToken(v => v + 1);
      return true;
    } catch (err) {
      console.error('[useHabits] Request failed:', err);
      setHabits(prev => (prev.some(h => h.id === habit.id) ? prev : [...prev, removed].sort((a, b) => a.id - b.id)));
      showToast(describeError(err, failure));
      return false;
    } finally {
      pendingRef.current.delete(habit.id);
      setPendingIds(new Set(pendingRef.current));
    }
  }, [showToast]);

  // Brings a just-deleted habit back from the trash with its logs.
  const undoDelete = useCallback(async (id: number) => {
    try {
      restoreHabit(await restoreHabitApi(id));
      showToast('Habit restored.', 'success');
    } catch (err) {
      console.error('[useHabits] Undo delete failed:', err);
      showToast(describeError(err, "Couldn't restore the habit. You can still restore it from Recently deleted."));
    }
  }, [restoreHabit, showToast]);

  const deleteHabit = useCallback(async (habit: Habit) => {
    const ok = await removeWhile(habit, () => deleteHabitApi(habit.id), "Couldn't delete the habit, so it has been restored.");
    if (ok) {
      showToast('Habit moved to Recently deleted. You can restore it for 30 days.', 'info', {
        label: 'Undo',
        onClick: () => undoDelete(habit.id),
      });
    }
    return ok;
  }, [removeWhile, showToast, undoDelete]);

  // Archiving keeps the habit's logs but takes it out of the list, stats,
  // streak checks and the debrief until it's restored from the Archive page.
  const archiveHabit = useCallback(async (habit: Habit) => {
    const ok = await removeWhile(habit, () => archiveHabitApi(habit.id), "Couldn't archive the habit, so it has been restored.");
    if (ok) showToast('Habit archived. You can restore it from the Archive page.', 'info');
    return ok;
  }, [removeWhile, showToast]);

  return {
    habits, habitsLoading, toggle, toggleDate, pendingHabitIds: pendingIds, refetch: load,
    deleteHabit, archiveHabit, restoreHabit, syncToken,
  };
}
