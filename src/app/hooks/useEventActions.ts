import { useCallback } from 'react';
import {
  createEvent,
  deleteEvent,
  describeError,
  fetchEvent,
  restoreEvent,
  setEventArchived,
  updateEvent,
} from '@/app/lib/backend-api';
import { useToast } from '@/app/context/ToastContext';
import type { CalendarEventCreate, CalendarEventUpdate, EditScope, EventOccurrence } from '@/app/types/event';
import { parseLocalDate } from '@/app/utils/dateUtils';

/** "Fri, Oct 23" for an occurrence's day. */
export const occurrenceDayLabel = (o: Pick<EventOccurrence, 'date'>) =>
  parseLocalDate(o.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

/**
 * The event changes a calendar can make, each reporting through a toast and
 * calling `onChanged` once the server has it, so the caller can refetch what
 * it shows. Archive and delete offer Undo. Each resolves true when it saved.
 */
export function useEventActions(onChanged: () => void) {
  const showToast = useToast();

  /** Runs `work`, then refreshes; on failure toasts `failure` (or the server's reason) and resolves null. */
  const runFor = useCallback(async <T,>(work: () => Promise<T>, failure: string): Promise<T | null> => {
    try {
      const result = await work();
      onChanged();
      return result;
    } catch (err) {
      console.error('[useEventActions]', err);
      showToast(describeError(err, failure), 'error');
      return null;
    }
  }, [onChanged, showToast]);
  const run = useCallback(
    async (work: () => Promise<unknown>, failure: string) => (await runFor(async () => { await work(); return true; }, failure)) ?? false,
    [runFor],
  );

  const create = useCallback(async (body: CalendarEventCreate): Promise<boolean> => {
    const ok = await run(() => createEvent(body), "Couldn't add the event. Please try again.");
    if (ok) showToast(`Added ${body.title}.`, 'success');
    return ok;
  }, [run, showToast]);

  const update = useCallback(async (o: EventOccurrence, body: CalendarEventUpdate, scope: EditScope): Promise<boolean> => {
    const ok = await run(() => updateEvent(o.event_id, body, scope, o.occurrence_date), "Couldn't save the event. Please try again.");
    if (ok) {
      const title = body.title ?? o.title;
      const which = scope === 'this' ? ` for ${occurrenceDayLabel(o)}` : scope === 'following' ? ` from ${occurrenceDayLabel(o)} on` : '';
      showToast(`Saved ${title}${which}.`, 'success');
    }
    return ok;
  }, [run, showToast]);

  const archive = useCallback(async (o: EventOccurrence, scope: EditScope): Promise<boolean> => {
    const saved = await runFor(() => setEventArchived(o.event_id, true, scope, o.occurrence_date), "Couldn't archive the event. Please try again.");
    if (!saved) return false;
    const message = scope === 'this'
      ? `Archived ${o.title} on ${occurrenceDayLabel(o)}.`
      : `Archived ${o.title}${scope === 'following' ? ` from ${occurrenceDayLabel(o)} on` : ''}. Past ones stay on the calendars.`;
    showToast(message, 'success', {
      label: 'Undo',
      onClick: () => {
        // "This" archived one occurrence; otherwise the series returned holds them all.
        void run(
          () => (scope === 'this'
            ? setEventArchived(o.event_id, false, 'this', o.occurrence_date)
            : setEventArchived(saved.id, false, 'all')),
          "Couldn't undo the archive.",
        );
      },
    });
    return true;
  }, [run, runFor, showToast]);

  const remove = useCallback(async (o: EventOccurrence, scope: EditScope): Promise<boolean> => {
    const saved = await runFor(() => deleteEvent(o.event_id, scope, o.occurrence_date), "Couldn't delete the event. Please try again.");
    if (!saved) return false;
    showToast('Moved to Recently deleted. You can restore it for 30 days.', 'success', {
      label: 'Undo',
      onClick: () => {
        void run(
          () => (scope === 'this' ? restoreEvent(o.event_id, o.occurrence_date) : restoreEvent(saved.id)),
          "Couldn't restore the event.",
        );
      },
    });
    return true;
  }, [run, runFor, showToast]);

  /**
   * Unarchives an archived occurrence: its whole series when that's what was
   * archived, else just the occurrence.
   */
  const restore = useCallback(async (o: EventOccurrence): Promise<boolean> => {
    const ok = await run(async () => {
      const series = await fetchEvent(o.event_id);
      if (series.archived_at) await setEventArchived(o.event_id, false, 'all');
      else await setEventArchived(o.event_id, false, 'this', o.occurrence_date);
    }, "Couldn't restore the event. Please try again.");
    if (ok) showToast(`Restored ${o.title}.`, 'success');
    return ok;
  }, [run, showToast]);

  return { create, update, archive, remove, restore };
}
