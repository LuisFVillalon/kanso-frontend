import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/app/context/ToastContext';
import { deleteMoodCheckin, describeError, fetchMoodCheckins, saveMoodCheckin } from '@/app/lib/backend-api';
import { checkinToSave, moodLabel, type MoodCheckin } from '@/app/types/mood';
import { announceMoodCheckin, onMoodCheckin } from '@/app/utils/moodCheckinSync';

interface Loaded {
  date: string;
  row: MoodCheckin | null;
}

/**
 * One local day's check-in ("YYYY-MM-DD"), kept current with saves made
 * anywhere in the app (utils/moodCheckinSync.ts). `checkin` is undefined
 * until known, null when the day has none; `failed` when it couldn't load.
 * A null `date` loads nothing.
 */
export function useDayMoodCheckin(date: string | null) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failedDate, setFailedDate] = useState<string | null>(null);

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    fetchMoodCheckins(date, date, ['day'])
      .then(rows => {
        if (!cancelled) setLoaded({ date, row: rows.find(r => r.period_kind === 'day' && r.period_start === date) ?? null });
      })
      .catch(() => { if (!cancelled) setFailedDate(date); });
    const unsubscribe = onMoodCheckin(({ kind, start, row }) => {
      if (kind === 'day' && start === date) setLoaded({ date, row });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [date]);

  return {
    checkin: date && loaded?.date === date ? loaded.row : undefined,
    failed: date != null && failedDate === date && loaded?.date !== date,
  };
}

/**
 * What to do once a check-in form saves: tell the rest of the app, and toast
 * "Saved" (Undo deletes it) or "updated" (Undo restores the previous one).
 */
export function useMoodCheckinSaved() {
  const showToast = useToast();
  // The newest row saved per period, so an older toast's Undo can tell it has since changed.
  const latestSaved = useRef(new Map<string, MoodCheckin>());
  const dismissSavedToast = useRef<(() => void) | null>(null);

  return useCallback((saved: MoodCheckin, previous: MoodCheckin | null) => {
    const key = `${saved.period_kind}:${saved.period_start}`;
    latestSaved.current.set(key, saved);
    announceMoodCheckin({ kind: saved.period_kind, start: saved.period_start, row: saved });
    dismissSavedToast.current?.();
    dismissSavedToast.current = null;

    if (previous) {
      showToast('Check-in updated.', 'success', {
        label: 'Undo',
        onClick: () => {
          saveMoodCheckin(checkinToSave(previous))
            .then(row => announceMoodCheckin({ kind: row.period_kind, start: row.period_start, row }))
            .catch(err => showToast(describeError(err, "Couldn't undo. Please try again.")));
        },
      });
      return;
    }
    dismissSavedToast.current = showToast(`Saved · ${moodLabel(saved.mood)}`, 'success', {
      label: 'Undo',
      onClick: () => {
        if (latestSaved.current.get(key) !== saved) return;
        deleteMoodCheckin(saved.id)
          .then(() => announceMoodCheckin({ kind: saved.period_kind, start: saved.period_start, row: null }))
          .catch(err => showToast(describeError(err, "Couldn't undo. Please try again.")));
      },
    });
  }, [showToast]);
}
