'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft, ArchiveRestore, Trash2, Loader2, Archive, Filter, ListChecks, NotebookText, Tags, Blocks, Flame,
  type LucideIcon,
} from 'lucide-react';
import {
  fetchTasks,
  fetchNotes,
  fetchTags,
  fetchHabits,
  unarchiveTask,
  unarchiveNote,
  unarchiveTag,
  unarchiveHabit,
  onDelete as deleteTaskApi,
  deleteNote as deleteNoteApi,
  onDeleteTag as deleteTagApi,
  deleteHabit as deleteHabitApi,
  describeError,
} from '@/app/lib/backend-api';
import { useToast } from '@/app/context/ToastContext';
import { useTasksContext } from '@/app/context/TasksContext';
import { useNotesContext } from '@/app/context/NotesContext';
import { useTagsContext } from '@/app/context/TagsContext';
import { useHabitsContext } from '@/app/context/HabitsContext';
import { useRestoreFromTrash } from '@/app/hooks/useRestoreFromTrash';
import { Tag, Task } from '@/app/types/task';
import { Note } from '@/app/types/notes';
import { Habit } from '@/app/types/habit';
import { subtaskTreeIds } from '@/app/utils/taskUtils';
import { stripHtml } from '@/app/utils/textUtils';
import { formatUpdatedDate } from '@/app/utils/dateUtils';
import { collectItemTags, filterByAnyTag } from '@/app/utils/tagFilter';
import TagChipList from '@/app/components/common/TagChipList';
import Modal from '@/app/components/common/Modal';
import PageSpinner from '@/app/components/common/PageSpinner';
import ArchiveTagFilter from './ArchiveTagFilter';

type TabKey = 'tasks' | 'notes' | 'tags' | 'habits';

const TABS: { key: TabKey; label: string; icon: LucideIcon; empty: string }[] = [
  { key: 'tasks', label: 'Tasks', icon: ListChecks, empty: 'Archive a task from the dashboard to tuck it away without deleting it.' },
  { key: 'notes', label: 'Notes', icon: NotebookText, empty: 'Archive a note from its card to tuck it away without deleting it.' },
  { key: 'tags', label: 'Tags', icon: Tags, empty: 'Archive a tag from Manage tags to hide it from pickers, filters and folders.' },
  { key: 'habits', label: 'Habits', icon: Blocks, empty: 'Archive a habit from Manage habits to set it aside with its history.' },
];

type Archived = { id: number; archived_at?: string | null };

/** Most recently archived first. */
const byArchivedDesc = (a: Archived, b: Archived) =>
  new Date(b.archived_at ?? 0).getTime() - new Date(a.archived_at ?? 0).getTime();

type PendingDelete =
  | { kind: 'task'; item: Task }
  | { kind: 'note'; item: Note }
  | { kind: 'tag'; item: Tag }
  | { kind: 'habit'; item: Habit };

const KIND_LABEL: Record<PendingDelete['kind'], string> = { task: 'Task', note: 'Note', tag: 'Tag', habit: 'Habit' };

/**
 * Lists the user's archived tasks, notes, tags and habits (fetched fresh
 * with `?archived=true` on every visit — the app-wide stores only ever hold
 * active rows) and lets each be restored or deleted (moved to Recently
 * deleted). Restoring hands the record back to the matching store so the
 * dashboard, calendar and stats pick it up again without a refetch.
 */
const ArchiveView: React.FC = () => {
  const showToast = useToast();
  const { restoreTasks, setTasks } = useTasksContext();
  const { restoreNote, removeTagFromNotes } = useNotesContext();
  const { restoreTag } = useTagsContext();
  const { restoreHabit, refetch: refetchHabits } = useHabitsContext();
  const restoreFromTrash = useRestoreFromTrash();

  const [tab, setTab] = useState<TabKey>('tasks');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reloadKey, setReloadKey] = useState(0);
  const [tasks, setArchivedTasks] = useState<Task[]>([]);
  const [notes, setArchivedNotes] = useState<Note[]>([]);
  const [tags, setArchivedTags] = useState<Tag[]>([]);
  const [habits, setArchivedHabits] = useState<Habit[]>([]);
  const [restoringKeys, setRestoringKeys] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set());

  // Each tab filters on its own — switching tabs starts from an unfiltered list.
  const switchTab = (key: TabKey) => {
    setTab(key);
    setSelectedTagIds(new Set());
  };

  const filterTags = useMemo(
    () => (tab === 'tasks' ? collectItemTags(tasks) : tab === 'notes' ? collectItemTags(notes) : []),
    [tab, tasks, notes],
  );
  // A selected tag no longer carried by any item (its last item was restored
  // or deleted) stops filtering.
  const activeTagIds = useMemo(
    () => new Set(filterTags.filter(t => selectedTagIds.has(t.id)).map(t => t.id)),
    [filterTags, selectedTagIds],
  );
  const visibleTasks = useMemo(() => filterByAnyTag(tasks, activeTagIds), [tasks, activeTagIds]);
  const visibleNotes = useMemo(() => filterByAnyTag(notes, activeTagIds), [notes, activeTagIds]);
  // Archived items keep their tags even when those tags are archived too.
  const archivedTagIds = useMemo(() => new Set(tags.map(t => t.id)), [tags]);
  const isTagArchived = (tag: Tag) => archivedTagIds.has(tag.id);

  const toggleTagFilter = (tag: Tag) => {
    setSelectedTagIds(prev => {
      const next = new Set(prev);
      if (next.has(tag.id)) next.delete(tag.id);
      else next.add(tag.id);
      return next;
    });
  };
  const clearTagFilter = () => setSelectedTagIds(new Set());

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchTasks(true), fetchNotes(true), fetchTags(true), fetchHabits(true)])
      .then(([t, n, g, h]) => {
        if (cancelled) return;
        setArchivedTasks([...t].sort(byArchivedDesc));
        setArchivedNotes([...n].sort(byArchivedDesc));
        setArchivedTags([...g].sort(byArchivedDesc));
        setArchivedHabits([...h].sort(byArchivedDesc));
        setStatus('ready');
      })
      .catch(err => {
        console.error('Failed to load archive:', err);
        if (!cancelled) setStatus('error');
      });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const retry = () => {
    setStatus('loading');
    setReloadKey(k => k + 1);
  };

  // Guards each restore against a double click, keyed by kind + id since
  // a task, a note, a tag and a habit can share an id.
  const withRestoring = async (key: string, run: () => Promise<void>) => {
    if (restoringKeys.has(key)) return;
    setRestoringKeys(prev => new Set(prev).add(key));
    try {
      await run();
    } finally {
      setRestoringKeys(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  // Restoring a task restores its subtasks too (server-side), so the whole
  // archived subtree moves back to the active list together.
  const handleRestoreTask = (task: Task) => withRestoring(`task:${task.id}`, async () => {
    const subtree = subtaskTreeIds(tasks, task.id);
    const moved = tasks.filter(t => subtree.has(t.id));
    setArchivedTasks(prev => prev.filter(t => !subtree.has(t.id)));
    try {
      const restored = await unarchiveTask(task.id);
      restoreTasks([
        restored,
        ...moved.filter(t => t.id !== task.id).map(t => ({ ...t, archived_at: null })),
      ]);
      showToast('Task restored.', 'success');
    } catch (err) {
      console.error('Restore failed:', err);
      setArchivedTasks(prev => [...prev, ...moved].sort(byArchivedDesc));
      showToast(describeError(err, "Couldn't restore the task. Please try again."));
    }
  });

  const handleRestoreNote = (note: Note) => withRestoring(`note:${note.id}`, async () => {
    setArchivedNotes(prev => prev.filter(n => n.id !== note.id));
    try {
      restoreNote(await unarchiveNote(note.id));
      showToast('Note restored.', 'success');
    } catch (err) {
      console.error('Restore failed:', err);
      setArchivedNotes(prev => [...prev, note].sort(byArchivedDesc));
      showToast(describeError(err, "Couldn't restore the note. Please try again."));
    }
  });

  const handleRestoreTag = (tag: Tag) => withRestoring(`tag:${tag.id}`, async () => {
    setArchivedTags(prev => prev.filter(t => t.id !== tag.id));
    try {
      restoreTag(await unarchiveTag(tag.id));
      showToast('Tag restored.', 'success');
    } catch (err) {
      console.error('Restore failed:', err);
      setArchivedTags(prev => [...prev, tag].sort(byArchivedDesc));
      showToast(describeError(err, "Couldn't restore the tag. Please try again."));
    }
  });

  const handleRestoreHabit = (habit: Habit) => withRestoring(`habit:${habit.id}`, async () => {
    setArchivedHabits(prev => prev.filter(h => h.id !== habit.id));
    try {
      restoreHabit(await unarchiveHabit(habit.id));
      showToast('Habit restored.', 'success');
    } catch (err) {
      console.error('Restore failed:', err);
      setArchivedHabits(prev => [...prev, habit].sort(byArchivedDesc));
      showToast(describeError(err, "Couldn't restore the habit. Please try again."));
    }
  });

  // Undo brings the deleted item back from the trash into the archive, and
  // puts back here what the delete took off this page.
  const undoDelete = async (deleted: PendingDelete, removedTasks: Task[], tagCarriers: { tasks: Set<number>; notes: Set<number> }) => {
    try {
      await restoreFromTrash(deleted.kind, deleted.item.id);
      if (deleted.kind === 'task') {
        const ids = new Set(removedTasks.map(t => t.id));
        setArchivedTasks(prev => [...prev.filter(t => !ids.has(t.id)), ...removedTasks].sort(byArchivedDesc));
      } else if (deleted.kind === 'note') {
        const note = deleted.item;
        setArchivedNotes(prev => [...prev.filter(n => n.id !== note.id), note].sort(byArchivedDesc));
      } else if (deleted.kind === 'habit') {
        const habit = deleted.item;
        setArchivedHabits(prev => [...prev.filter(h => h.id !== habit.id), habit].sort(byArchivedDesc));
      } else {
        const tag = deleted.item;
        setArchivedTags(prev => [...prev.filter(t => t.id !== tag.id), tag].sort(byArchivedDesc));
        const addTag = <T extends { id: number; tags: Tag[] }>(carriers: Set<number>) => (item: T): T =>
          carriers.has(item.id) && !item.tags.some(t => t.id === tag.id) ? { ...item, tags: [...item.tags, tag] } : item;
        setArchivedTasks(prev => prev.map(addTag(tagCarriers.tasks)));
        setArchivedNotes(prev => prev.map(addTag(tagCarriers.notes)));
      }
      showToast(`${KIND_LABEL[deleted.kind]} restored to the archive.`, 'success');
    } catch (err) {
      console.error('Undo delete failed:', err);
      showToast(describeError(err, `Couldn't restore the ${deleted.kind}. You can still restore it from Recently deleted.`));
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const deleted = pendingDelete;
    let removedTasks: Task[] = [];
    const tagCarriers = { tasks: new Set<number>(), notes: new Set<number>() };
    setDeleting(true);
    try {
      if (deleted.kind === 'task') {
        await deleteTaskApi(deleted.item.id);
        // Its archived subtasks go to the trash with it.
        const subtree = subtaskTreeIds(tasks, deleted.item.id);
        removedTasks = tasks.filter(t => subtree.has(t.id));
        setArchivedTasks(prev => prev.filter(t => !subtree.has(t.id)));
      } else if (deleted.kind === 'note') {
        await deleteNoteApi(deleted.item.id);
        setArchivedNotes(prev => prev.filter(n => n.id !== deleted.item.id));
      } else if (deleted.kind === 'habit') {
        await deleteHabitApi(deleted.item.id);
        setArchivedHabits(prev => prev.filter(h => h.id !== deleted.item.id));
      } else {
        const tagId = deleted.item.id;
        await deleteTagApi(tagId);
        setArchivedTags(prev => prev.filter(t => t.id !== tagId));
        // A deleted tag is hidden from every item carrying it until it's restored.
        const carries = (item: { tags: Tag[] }) => item.tags.some(t => t.id === tagId);
        tasks.filter(carries).forEach(t => tagCarriers.tasks.add(t.id));
        notes.filter(carries).forEach(n => tagCarriers.notes.add(n.id));
        const dropTag = <T extends { tags: Tag[] }>(item: T): T =>
          carries(item) ? { ...item, tags: item.tags.filter(t => t.id !== tagId) } : item;
        setTasks(prev => prev.map(dropTag));
        setArchivedTasks(prev => prev.map(dropTag));
        setArchivedNotes(prev => prev.map(dropTag));
        removeTagFromNotes(tagId);
        refetchHabits();
      }
      setPendingDelete(null);
      showToast(`${KIND_LABEL[deleted.kind]} moved to Recently deleted. You can restore it for 30 days.`, 'info', {
        label: 'Undo',
        onClick: () => undoDelete(deleted, removedTasks, tagCarriers),
      });
    } catch (err) {
      console.error('Delete failed:', err);
      showToast(describeError(err, `Couldn't delete the ${deleted.kind}. Please try again.`));
    } finally {
      setDeleting(false);
    }
  };

  if (status === 'loading') return <PageSpinner />;

  const counts: Record<TabKey, number> = { tasks: tasks.length, notes: notes.length, tags: tags.length, habits: habits.length };
  const activeTab = TABS.find(t => t.key === tab)!;
  const visibleCount = tab === 'tasks' ? visibleTasks.length : tab === 'notes' ? visibleNotes.length : counts[tab];
  const taskTitle = (id: number | null | undefined) => tasks.find(t => t.id === id)?.title;

  const rowActions = (key: string, onRestore: () => void, onDelete: () => void) => {
    const restoring = restoringKeys.has(key);
    return (
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={onRestore}
          disabled={restoring}
          className="btn btn-secondary px-3 py-1.5 text-sm gap-1.5 disabled:opacity-70 disabled:cursor-wait"
        >
          {restoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArchiveRestore className="w-4 h-4" />}
          Restore
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={restoring}
          className="btn btn-outline px-2.5 py-1.5 text-sm gap-1.5 disabled:opacity-50"
          style={{ color: 'var(--tm-danger)' }}
          title="Move to Recently deleted"
          aria-label="Delete"
        >
          <Trash2 className="w-4 h-4" />
          <span className="hidden sm:inline">Delete</span>
        </button>
      </div>
    );
  };

  const archivedLabel = (item: Archived) =>
    item.archived_at ? `Archived ${formatUpdatedDate(item.archived_at)}` : 'Archived';

  return (
    <div className="min-h-screen flex flex-col">
      <div className="max-w-4xl mx-auto w-full px-3 sm:px-4 md:px-6 py-4 sm:py-5 flex flex-wrap items-center gap-3">
        <Link href="/" className="flex items-center gap-1 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">
          <ChevronLeft className="w-4 h-4" />
          Home
        </Link>
        <span className="text-text-muted select-none">/</span>
        <h1 className="text-2xl sm:text-3xl text-text-primary">Archive</h1>
        <Link
          href="/trash"
          className="ml-auto flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Recently deleted
        </Link>
      </div>

      <div className="flex-1 max-w-4xl mx-auto w-full px-3 sm:px-4 md:px-6 pb-6 sm:pb-10">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div role="tablist" aria-label="Archived items" className="inline-flex items-center gap-1 p-1 rounded-lg bg-surface border border-border">
            {TABS.map(({ key, label, icon: Icon }) => {
              const active = tab === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  id={`archive-tab-${key}`}
                  aria-selected={active}
                  aria-controls="archive-panel"
                  onClick={() => switchTab(key)}
                  className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                    active
                      ? 'bg-surface-raised text-text-primary shadow-sm'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                  <span className="text-xs text-text-muted tabular-nums">{counts[key]}</span>
                </button>
              );
            })}
          </div>
          {status === 'ready' && filterTags.length > 0 && (
            <div className="ml-auto">
              <ArchiveTagFilter
                key={tab}
                tags={filterTags}
                selectedIds={activeTagIds}
                isArchived={isTagArchived}
                onToggle={toggleTagFilter}
                onClear={clearTagFilter}
              />
            </div>
          )}
        </div>

        <div id="archive-panel" role="tabpanel" aria-labelledby={`archive-tab-${tab}`}>
          {status === 'error' ? (
            <div className="card p-6 sm:p-8 text-center">
              <p className="text-sm font-medium text-text-secondary">Couldn&apos;t load your archive.</p>
              <button type="button" onClick={retry} className="btn btn-secondary px-3 py-1.5 text-sm mt-3">
                Try again
              </button>
            </div>
          ) : counts[tab] === 0 ? (
            <div className="card p-6 sm:p-8 text-center">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
                style={{ backgroundColor: 'var(--tm-surface-raised)' }}
              >
                <Archive className="w-6 h-6 text-text-muted" />
              </div>
              <h2 className="text-base text-text-primary mb-1">No archived {activeTab.label.toLowerCase()}</h2>
              <p className="text-sm text-text-secondary">{activeTab.empty}</p>
            </div>
          ) : visibleCount === 0 ? (
            <div className="card p-6 sm:p-8 text-center">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
                style={{ backgroundColor: 'var(--tm-surface-raised)' }}
              >
                <Filter className="w-6 h-6 text-text-muted" />
              </div>
              <h2 className="text-base text-text-primary mb-1">
                No archived {activeTab.label.toLowerCase()} with {activeTagIds.size === 1 ? 'this tag' : 'these tags'}
              </h2>
              <button type="button" onClick={clearTagFilter} className="btn btn-secondary px-3 py-1.5 text-sm mt-3">
                Clear filter
              </button>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {tab === 'tasks' && visibleTasks.map(task => {
                const parentTitle = taskTitle(task.parent_task_id);
                return (
                  <li key={task.id} className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className={`text-sm sm:text-base font-semibold truncate ${task.completed ? 'line-through text-text-muted' : 'text-text-primary'}`}>
                        {task.title}
                      </h3>
                      <p className="text-xs text-text-muted mt-0.5">
                        {archivedLabel(task)}
                        {parentTitle && <> · Leads up to {parentTitle}</>}
                      </p>
                      <TagChipList tags={task.tags} size="xs" className="mt-2" />
                    </div>
                    {rowActions(
                      `task:${task.id}`,
                      () => handleRestoreTask(task),
                      () => setPendingDelete({ kind: 'task', item: task }),
                    )}
                  </li>
                );
              })}

              {tab === 'notes' && visibleNotes.map(note => {
                const preview = stripHtml(note.content);
                return (
                  <li key={note.id} className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm sm:text-base font-semibold text-text-primary truncate">
                        {note.title || 'Untitled Note'}
                      </h3>
                      {preview && <p className="text-xs text-text-secondary line-clamp-2 mt-0.5">{preview}</p>}
                      <p className="text-xs text-text-muted mt-0.5">{archivedLabel(note)}</p>
                      <TagChipList tags={note.tags} size="xs" className="mt-2" />
                    </div>
                    {rowActions(
                      `note:${note.id}`,
                      () => handleRestoreNote(note),
                      () => setPendingDelete({ kind: 'note', item: note }),
                    )}
                  </li>
                );
              })}

              {tab === 'tags' && tags.map(tag => (
                <li key={tag.id} className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0 flex items-center gap-3">
                    <span className="chip text-white font-medium" style={{ backgroundColor: tag.color }}>
                      {tag.name}
                    </span>
                    <span className="text-xs text-text-muted">{archivedLabel(tag)}</span>
                  </div>
                  {rowActions(
                    `tag:${tag.id}`,
                    () => handleRestoreTag(tag),
                    () => setPendingDelete({ kind: 'tag', item: tag }),
                  )}
                </li>
              ))}

              {tab === 'habits' && habits.map(habit => (
                <li key={habit.id} className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm sm:text-base font-semibold text-text-primary truncate">{habit.title}</h3>
                    <p className="text-xs text-text-muted mt-0.5 flex items-center gap-1">
                      {archivedLabel(habit)}
                      <span aria-hidden="true">·</span>
                      <Flame className="w-3 h-3" aria-hidden="true" />
                      Best streak {habit.max_streak} day{habit.max_streak === 1 ? '' : 's'}
                    </p>
                    <TagChipList tags={habit.tags} size="xs" className="mt-2" />
                  </div>
                  {rowActions(
                    `habit:${habit.id}`,
                    () => handleRestoreHabit(habit),
                    () => setPendingDelete({ kind: 'habit', item: habit }),
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {pendingDelete && (
        <Modal
          onClose={() => { if (!deleting) setPendingDelete(null); }}
          layer="top"
          panelClassName="modal-panel max-w-sm w-full p-6 space-y-4"
        >
          <p className="text-center text-text-primary">
            Delete the {pendingDelete.kind}{' '}
            {pendingDelete.kind === 'tag' ? (
              <span className="chip rounded-full text-white font-medium" style={{ backgroundColor: pendingDelete.item.color }}>
                {pendingDelete.item.name}
              </span>
            ) : (
              <span className="font-semibold">
                &ldquo;{pendingDelete.item.title || (pendingDelete.kind === 'note' ? 'Untitled Note' : 'Untitled')}&rdquo;
              </span>
            )}
            ?
          </p>
          <p className="text-center text-sm text-text-muted">
            {pendingDelete.kind === 'tag'
              ? 'It moves to Recently deleted and is hidden from every task, note and habit carrying it. Restore it within 30 days to bring it back on all of them.'
              : 'It moves to Recently deleted, where you can restore it for 30 days.'}
          </p>
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => setPendingDelete(null)}
              disabled={deleting}
              className="btn btn-secondary flex-1 py-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={deleting}
              className="btn flex-1 py-2 text-white flex items-center justify-center gap-1.5 disabled:cursor-wait"
              style={{ backgroundColor: 'var(--tm-danger)' }}
            >
              {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default ArchiveView;
