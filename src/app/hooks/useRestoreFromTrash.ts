import { useCallback } from 'react';
import {
  fetchNotes,
  fetchTasks,
  restoreHabit as restoreHabitApi,
  restoreNote as restoreNoteApi,
  restoreTag as restoreTagApi,
  restoreTask as restoreTaskApi,
} from '@/app/lib/backend-api';
import { useTasksContext } from '@/app/context/TasksContext';
import { useNotesContext } from '@/app/context/NotesContext';
import { useTagsContext } from '@/app/context/TagsContext';
import { useHabitsContext } from '@/app/context/HabitsContext';
import { TrashKind } from '@/app/types/trash';
import { Tag } from '@/app/types/task';

/**
 * Restores an item from the trash and hands it back to the matching
 * app-wide store, so the dashboard, calendar and stats pick it up again
 * without a reload. An item deleted while archived goes back to the archive
 * instead, which the Archive page fetches fresh on every visit.
 *
 * Resolves to whether it went back to the archive; rejects if the restore
 * itself failed.
 */
export function useRestoreFromTrash() {
  const { restoreTasks, setTasks } = useTasksContext();
  const { restoreNote, addTagToNotes } = useNotesContext();
  const { restoreTag } = useTagsContext();
  const { restoreHabit, refetch: refetchHabits } = useHabitsContext();

  // The tag comes back on every item it was on, but the response is just the
  // tag, so read which loaded tasks and notes carry it and put it back on them.
  const reattachTag = useCallback(async (tag: Tag) => {
    try {
      const [tasks, notes] = await Promise.all([fetchTasks(), fetchNotes()]);
      const carriers = <T extends { id: number; tags: Tag[] }>(items: T[]) =>
        new Set(items.filter(item => item.tags.some(t => t.id === tag.id)).map(item => item.id));
      const taskIds = carriers(tasks);
      setTasks(prev =>
        prev.map(task =>
          taskIds.has(task.id) && !task.tags.some(t => t.id === tag.id) ? { ...task, tags: [...task.tags, tag] } : task,
        ),
      );
      addTagToNotes(tag, carriers(notes));
    } catch (err) {
      console.error('Failed to put the restored tag back on its items:', err);
    }
    refetchHabits();
  }, [setTasks, addTagToNotes, refetchHabits]);

  /**
   * `taskIds` lists every task a task restore brings back (its subtasks
   * deleted with it and any trashed parents; see restoredWithTask). Only the
   * task itself comes back in the response, so when there are others the
   * active list is read to pick them up.
   */
  return useCallback(async (kind: TrashKind, id: number, taskIds?: Set<number>): Promise<boolean> => {
    switch (kind) {
      case 'task': {
        const task = await restoreTaskApi(id);
        if (task.archived_at) return true;
        if (!taskIds || taskIds.size <= 1) {
          restoreTasks([task]);
          return false;
        }
        try {
          const active = await fetchTasks();
          restoreTasks(active.filter(t => taskIds.has(t.id)));
        } catch (err) {
          console.error('Failed to load the tasks restored with it:', err);
          restoreTasks([task]);
        }
        return false;
      }
      case 'note': {
        const note = await restoreNoteApi(id);
        if (note.archived_at) return true;
        restoreNote(note);
        return false;
      }
      case 'habit': {
        const habit = await restoreHabitApi(id);
        if (habit.archived_at) return true;
        restoreHabit(habit);
        return false;
      }
      case 'tag': {
        const tag = await restoreTagApi(id);
        if (!tag.archived_at) restoreTag(tag);
        await reattachTag(tag);
        return !!tag.archived_at;
      }
    }
  }, [restoreTasks, restoreNote, restoreHabit, restoreTag, reattachTag]);
}
