'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArchiveRestore, Archive, Trash2, Loader2, ListChecks, NotebookText, Tags, Blocks, Inbox, CalendarClock,
  type LucideIcon,
} from 'lucide-react';
import { fetchTrash, purgeEvent, purgeFromTrash, describeError } from '@/app/lib/backend-api';
import { useToast } from '@/app/context/ToastContext';
import { useRestoreFromTrash } from '@/app/hooks/useRestoreFromTrash';
import { TrashItem, TrashKind } from '@/app/types/trash';
import { formatUpdatedDate, parseLocalDate } from '@/app/utils/dateUtils';
import { parentChain } from '@/app/utils/taskUtils';
import { daysLeft, deletedWithTask, restoredWithTask, trashKey } from '@/app/utils/trashUtils';
import Modal from '@/app/components/common/Modal';
import PageSpinner from '@/app/components/common/PageSpinner';

type Filter = 'all' | TrashKind;

const KINDS: Record<TrashKind, { label: string; plural: string; icon: LucideIcon }> = {
  task: { label: 'Task', plural: 'Tasks', icon: ListChecks },
  note: { label: 'Note', plural: 'Notes', icon: NotebookText },
  tag: { label: 'Tag', plural: 'Tags', icon: Tags },
  habit: { label: 'Habit', plural: 'Habits', icon: Blocks },
  event: { label: 'Event', plural: 'Events', icon: CalendarClock },
};

const FILTERS: Filter[] = ['all', 'task', 'note', 'tag', 'habit', 'event'];

// Few enough days left to call out.
const SOON_DAYS = 3;

// Purge requests in flight at once during Delete all forever.
const PURGE_CONCURRENCY = 4;

/** Deletes an item forever; for one deleted occurrence of an event, just that date. */
const purge = (item: TrashItem) =>
  item.kind === 'event' ? purgeEvent(item.id, item.occurrence_date) : purgeFromTrash(item.kind, item.id);

const displayTitle = (item: TrashItem) => item.title || (item.kind === 'note' ? 'Untitled Note' : 'Untitled');

/** "Wed, Oct 21 only" for one deleted occurrence of an event; "All dates" for a deleted series. */
const eventScopeLabel = (item: TrashItem) =>
  item.occurrence_date
    ? `${parseLocalDate(item.occurrence_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} only`
    : 'All dates';

/**
 * Recently deleted: the user's deleted tasks, notes, tags, habits and events, newest
 * first, each restorable until it's permanently deleted 30 days after
 * deletion. Restoring hands the item back to its app-wide store (see
 * useRestoreFromTrash) so it reappears where it was without a reload.
 */
const TrashView: React.FC = () => {
  const showToast = useToast();
  const restoreFromTrash = useRestoreFromTrash();

  const [items, setItems] = useState<TrashItem[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reloadKey, setReloadKey] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const [restoringKeys, setRestoringKeys] = useState<Set<string>>(new Set());
  const [pendingPurge, setPendingPurge] = useState<TrashItem | null>(null);
  const [purging, setPurging] = useState(false);
  const [confirmPurgeAll, setConfirmPurgeAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchTrash()
      .then(data => {
        if (cancelled) return;
        setItems(data);
        setStatus('ready');
      })
      .catch(err => {
        console.error('Failed to load recently deleted items:', err);
        if (!cancelled) setStatus('error');
      });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const retry = () => {
    setStatus('loading');
    setReloadKey(k => k + 1);
  };

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: items.length, task: 0, note: 0, tag: 0, habit: 0, event: 0 };
    items.forEach(item => { c[item.kind] += 1; });
    return c;
  }, [items]);
  const visible = useMemo(
    () => (filter === 'all' ? items : items.filter(item => item.kind === filter)),
    [items, filter],
  );
  const trashedTasks = useMemo(
    () => new Map(items.filter(item => item.kind === 'task').map(item => [item.id, item])),
    [items],
  );
  // "A › B": the trashed tasks above this one, or the API's summary of a parent that isn't here.
  const parentTrail = (item: TrashItem) => parentChain(trashedTasks, item).map(p => p.title).join(' › ');

  // The tasks a restore or purge of `item` carries along (its subtasks
  // deleted with it, and for a restore its trashed parents), as trash keys.
  const affectedKeys = (item: TrashItem, ids: Set<number>) =>
    item.kind === 'task' ? new Set([...ids].map(id => trashKey({ kind: 'task', id }))) : new Set([trashKey(item)]);

  const handleRestore = async (item: TrashItem) => {
    const key = trashKey(item);
    if (restoringKeys.has(key)) return;
    setRestoringKeys(prev => new Set(prev).add(key));
    const taskIds = item.kind === 'task' ? restoredWithTask(items, item.id) : new Set([item.id]);
    const keys = affectedKeys(item, taskIds);
    const removed = items.filter(i => keys.has(trashKey(i)));
    setItems(prev => prev.filter(i => !keys.has(trashKey(i))));
    try {
      const toArchive = item.occurrence_date
        ? await restoreFromTrash(item.kind, item.id, undefined, item.occurrence_date)
        : await restoreFromTrash(item.kind, item.id, item.kind === 'task' ? taskIds : undefined);
      showToast(`${KINDS[item.kind].label} restored${toArchive ? ' to the Archive' : ''}.`, 'success');
    } catch (err) {
      console.error('Restore failed:', err);
      setItems(prev => [...prev, ...removed].sort((a, b) => b.deleted_at.localeCompare(a.deleted_at)));
      showToast(describeError(err, `Couldn't restore the ${item.kind}. Please try again.`));
    } finally {
      setRestoringKeys(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const confirmPurge = async () => {
    if (!pendingPurge) return;
    const item = pendingPurge;
    setPurging(true);
    try {
      await purge(item);
      const taskIds = item.kind === 'task' ? deletedWithTask(items, item.id) : new Set<number>();
      const keys = affectedKeys(item, taskIds);
      // Subtasks deleted on their own stay here, detached from the purged parent.
      setItems(prev =>
        prev
          .filter(i => !keys.has(trashKey(i)))
          .map(i => (i.kind === 'task' && i.parent_task_id != null && taskIds.has(i.parent_task_id) ? { ...i, parent_task_id: null } : i)),
      );
      setPendingPurge(null);
      showToast(`${KINDS[item.kind].label} deleted forever.`, 'success');
    } catch (err) {
      console.error('Delete forever failed:', err);
      showToast(describeError(err, `Couldn't delete the ${item.kind}. Please try again.`));
    } finally {
      setPurging(false);
    }
  };

  // Deletes forever every item the current filter shows. A task's purge takes
  // the subtasks deleted with it, so those aren't purged on their own.
  const purgeAll = async () => {
    const shown = visible;
    const covered = new Set<number>();
    shown.forEach(i => {
      if (i.kind === 'task') deletedWithTask(items, i.id).forEach(id => { if (id !== i.id) covered.add(id); });
    });
    const roots = shown.filter(i => i.kind !== 'task' || !covered.has(i.id));
    setPurging(true);
    const failed = new Set<string>();
    let next = 0;
    const worker = async () => {
      while (next < roots.length) {
        const item = roots[next++];
        try {
          await purge(item);
        } catch (err) {
          console.error('Delete forever failed:', err);
          const ids = item.kind === 'task' ? deletedWithTask(items, item.id) : new Set([item.id]);
          affectedKeys(item, ids).forEach(k => failed.add(k));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PURGE_CONCURRENCY, roots.length) }, worker));
    try {
      setItems(await fetchTrash());
    } catch (err) {
      console.error('Failed to reload recently deleted items:', err);
      const shownKeys = new Set(shown.map(trashKey));
      setItems(prev => prev.filter(i => !shownKeys.has(trashKey(i)) || failed.has(trashKey(i))));
    }
    setPurging(false);
    setConfirmPurgeAll(false);
    const failedCount = shown.filter(i => failed.has(trashKey(i))).length;
    if (failedCount === 0) {
      showToast(`Deleted ${countLabel(shown.length)} forever.`, 'success');
    } else {
      showToast(`Deleted ${shown.length - failedCount} of ${shown.length}; ${failedCount} failed, try again.`);
    }
  };

  // "12 notes", "1 task", "5 items".
  const countLabel = (n: number) => {
    const noun = filter === 'all' ? (n === 1 ? 'item' : 'items') : (n === 1 ? filter : KINDS[filter].plural.toLowerCase());
    return `${n} ${noun}`;
  };

  if (status === 'loading') return <PageSpinner />;

  const now = new Date();
  const purgeSubtaskCount = pendingPurge?.kind === 'task' ? deletedWithTask(items, pendingPurge.id).size - 1 : 0;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="max-w-4xl mx-auto w-full px-3 sm:px-4 md:px-6 py-4 sm:py-5 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl sm:text-3xl text-text-primary">Recently deleted</h1>
        <Link
          href="/archive"
          className="ml-auto flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
        >
          <Archive className="w-4 h-4" />
          Archive
        </Link>
      </div>

      <div className="flex-1 max-w-4xl mx-auto w-full px-3 sm:px-4 md:px-6 pb-6 sm:pb-10">
        <p className="text-sm text-text-secondary mb-4">
          Deleted items stay here for 30 days, then they&apos;re deleted forever.
        </p>

        {status === 'ready' && (
          <div
            role="group"
            aria-label="Show deleted"
            className="inline-flex flex-wrap items-center gap-1 p-1 mb-4 rounded-lg bg-surface border border-border"
          >
            {FILTERS.map(key => {
              const active = filter === key;
              const Icon = key === 'all' ? Trash2 : KINDS[key].icon;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(key)}
                  className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                    active
                      ? 'bg-surface-raised text-text-primary shadow-sm'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                  {key === 'all' ? 'All' : KINDS[key].plural}
                  <span className="text-xs text-text-muted tabular-nums">{counts[key]}</span>
                </button>
              );
            })}
          </div>
        )}

        {status === 'ready' && visible.length > 0 && (
          <div className="flex justify-end mb-3">
            <button
              type="button"
              onClick={() => setConfirmPurgeAll(true)}
              disabled={restoringKeys.size > 0}
              aria-label={`Delete all ${filter === 'all' ? 'items' : KINDS[filter].plural.toLowerCase()} forever`}
              className="btn btn-outline px-2.5 py-1.5 text-sm gap-1.5 disabled:opacity-50"
              style={{ color: 'var(--tm-danger)' }}
            >
              <Trash2 className="w-4 h-4" />
              Delete all forever
            </button>
          </div>
        )}

        {status === 'error' ? (
          <div className="card p-6 sm:p-8 text-center">
            <p className="text-sm font-medium text-text-secondary">Couldn&apos;t load recently deleted items.</p>
            <button type="button" onClick={retry} className="btn btn-secondary px-3 py-1.5 text-sm mt-3">
              Try again
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="card p-6 sm:p-8 text-center">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
              style={{ backgroundColor: 'var(--tm-surface-raised)' }}
            >
              <Inbox className="w-6 h-6 text-text-muted" />
            </div>
            <h2 className="text-base text-text-primary mb-1">
              {filter === 'all' ? 'Nothing recently deleted' : `No deleted ${KINDS[filter].plural.toLowerCase()}`}
            </h2>
            <p className="text-sm text-text-secondary">
              When you delete a task, note, tag, habit or event, it waits here for 30 days in case you want it back.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {visible.map(item => {
              const key = trashKey(item);
              const restoring = restoringKeys.has(key);
              const { label, icon: KindIcon } = KINDS[item.kind];
              const left = daysLeft(item.purge_at, now);
              const parentTitle = item.kind === 'task' ? parentTrail(item) : undefined;
              const title = displayTitle(item);
              return (
                <li key={key} className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="chip flex-shrink-0 flex items-center gap-1 text-[11px] font-medium text-text-secondary bg-surface-raised border border-border">
                        <KindIcon className="w-3 h-3" aria-hidden="true" />
                        {label}
                      </span>
                      <h3 className="text-sm sm:text-base font-semibold text-text-primary truncate">{title}</h3>
                    </div>
                    <p className="text-xs text-text-muted mt-1">
                      Deleted {formatUpdatedDate(item.deleted_at)}
                      {' · '}
                      <span
                        className={left <= SOON_DAYS ? 'font-semibold text-danger' : undefined}
                        title={`Deleted forever on ${new Date(item.purge_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                      >
                        {left === 0 ? 'Deleting soon' : `${left} day${left === 1 ? '' : 's'} left`}
                      </span>
                      {parentTitle && <> · Leads up to {parentTitle}</>}
                      {item.kind === 'event' && <> · {eventScopeLabel(item)}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => handleRestore(item)}
                      disabled={restoring}
                      aria-label={`Restore ${title}`}
                      className="btn btn-secondary px-3 py-1.5 text-sm gap-1.5 disabled:opacity-70 disabled:cursor-wait"
                    >
                      {restoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArchiveRestore className="w-4 h-4" />}
                      Restore
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingPurge(item)}
                      disabled={restoring}
                      aria-label={`Delete ${title} forever`}
                      className="btn btn-outline px-2.5 py-1.5 text-sm gap-1.5 disabled:opacity-50"
                      style={{ color: 'var(--tm-danger)' }}
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete forever
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {pendingPurge && (
        <Modal
          onClose={() => { if (!purging) setPendingPurge(null); }}
          layer="top"
          panelClassName="modal-panel max-w-sm w-full p-6 space-y-4"
        >
          <p className="text-center text-text-primary">
            Delete the {pendingPurge.kind}{' '}
            <span className="font-semibold">&ldquo;{displayTitle(pendingPurge)}&rdquo;</span>{' '}
            forever?
          </p>
          <p className="text-center text-sm text-text-muted">
            {pendingPurge.kind === 'tag' && 'It comes off every task, note and habit that carried it. '}
            {pendingPurge.kind === 'habit' && 'Its history goes with it. '}
            {pendingPurge.kind === 'event' && (pendingPurge.occurrence_date
              ? 'That date stays off your calendar. '
              : 'Every date it was on goes with it, past ones too. ')}
            {purgeSubtaskCount > 0 &&
              `The ${purgeSubtaskCount} linked task${purgeSubtaskCount === 1 ? '' : 's'} deleted with it go${purgeSubtaskCount === 1 ? 'es' : ''} too. `}
            This can&apos;t be undone.
          </p>
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => setPendingPurge(null)}
              disabled={purging}
              className="btn btn-secondary flex-1 py-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmPurge}
              disabled={purging}
              className="btn flex-1 py-2 text-white flex items-center justify-center gap-1.5 disabled:cursor-wait"
              style={{ backgroundColor: 'var(--tm-danger)' }}
            >
              {purging && <Loader2 className="w-4 h-4 animate-spin" />}
              {purging ? 'Deleting…' : 'Delete forever'}
            </button>
          </div>
        </Modal>
      )}

      {confirmPurgeAll && (
        <Modal
          onClose={() => { if (!purging) setConfirmPurgeAll(false); }}
          layer="top"
          panelClassName="modal-panel max-w-sm w-full p-6 space-y-4"
        >
          <p className="text-center text-text-primary">Delete {countLabel(visible.length)} forever?</p>
          <p className="text-center text-sm text-text-muted">This can&apos;t be undone.</p>
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => setConfirmPurgeAll(false)}
              disabled={purging}
              className="btn btn-secondary flex-1 py-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={purgeAll}
              disabled={purging}
              className="btn flex-1 py-2 text-white flex items-center justify-center gap-1.5 disabled:cursor-wait"
              style={{ backgroundColor: 'var(--tm-danger)' }}
            >
              {purging && <Loader2 className="w-4 h-4 animate-spin" />}
              {purging ? 'Deleting…' : 'Delete all forever'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default TrashView;
