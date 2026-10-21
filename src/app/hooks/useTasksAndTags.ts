import { useState, useEffect, useRef } from 'react';
import {
  fetchTasks,
  fetchTags,
  createTask,
  createTag,
  onDelete,
  onDeleteTag,
  updateTag as updateTagApi,
  updateWholeTask,
  archiveTask as archiveTaskApi,
  archiveTag as archiveTagApi,
  restoreTask as restoreTaskApi,
  updateLinkedTasks,
  describeError,
} from '@/app/lib/backend-api';
import { useToast } from '@/app/context/ToastContext';
import { Task, Tag, BaseTaskForm, EditTaskForm, NewTag, LinkedTaskRef } from '@/app/types/task';
import { toLocalISOString, toLocalDateStr, toLocalTimeStr } from '@/app/utils/dateUtils';
import { subtaskTreeIds } from '@/app/utils/taskUtils';
import { LinkedTasksSaveError } from '@/app/utils/linkedTasks';

/**
 * Manages task state and CRUD operations.
 *
 * @param enabled - Set false to skip the initial fetch (e.g. no signed-in
 * user yet) — called from TasksProvider (context/TasksContext.tsx), which
 * gates this on auth so pages outside the signed-in app never fire it.
 */
export const useTasks = (enabled: boolean) => {
  const showToast = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Guards toggle/delete against double-click races the same way useHabits
  // does for habit toggles — a ref for the synchronous check, mirrored into
  // state so the UI can disable/dim just the item that's in flight.
  const pendingRef = useRef<Set<number>>(new Set());
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<number>>(new Set());
  // Bumped only once the server has confirmed a completion toggle, an
  // archive or a delete (not on the optimistic local update) — consumers like
  // TaskDebriefPanel key their refetch off this instead of `tasks` so they
  // don't race the in-flight request and refetch before it has committed.
  const [completionSyncToken, setCompletionSyncToken] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const loadTasks = async () => {
      try {
        setIsLoading(true);
        const data = await fetchTasks();
        setTasks(data);
      } catch (error) {
        console.error('Failed to fetch tasks:', error);
        setTasks([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadTasks();
  }, [enabled]);

  const toggleComplete = async (id: number): Promise<void> => {
    if (pendingRef.current.has(id)) return;
    pendingRef.current.add(id);
    setPendingTaskIds(new Set(pendingRef.current));

    const task = tasks.find(t => t.id === id);
    if (!task) {
      pendingRef.current.delete(id);
      setPendingTaskIds(new Set(pendingRef.current));
      return;
    }

    const newCompleted = !task.completed;
    const newCompletedDate = newCompleted ? toLocalISOString(new Date()) : null;

    setTasks(prev =>
      prev.map(t =>
        t.id === id
          ? {
              ...t,
              completed: newCompleted,
              completed_date: newCompletedDate,
              priority: newCompleted ? null : t.priority
            }
          : t
      )
    );

    try {
      await updateWholeTask(id, {
        title: task.title,
        description: task.description,
        completed: newCompleted,
        priority: newCompleted ? null : task.priority,
        due_date: task.due_date ? (task.due_date instanceof Date ? toLocalDateStr(task.due_date) : task.due_date) : '',
        due_time: task.due_time ? (task.due_time instanceof Date ? toLocalTimeStr(task.due_time) : task.due_time) : '',
        tags: task.tags.map(tag => ({ id: tag.id, name: tag.name, color: tag.color })),
        category: task.category ?? null,
        created_date: task.created_date instanceof Date ? toLocalISOString(task.created_date) : (typeof task.created_date === 'string' ? task.created_date : null),
        completed_date: newCompletedDate,
        estimated_time: task.estimated_time,
        parent_task_id: task.parent_task_id,
        reminder_minutes: task.reminder_minutes ?? null,
      });
      setCompletionSyncToken(v => v + 1);
    } catch (err) {
      console.error('Toggle complete failed:', err);
      showToast(describeError(err, "Couldn't update the task. Please try again."));
      // Revert local state
      setTasks(tasks.map(t =>
        t.id === id ? { ...t, completed: task.completed, completed_date: task.completed_date, priority: task.priority } : t
      ));
    } finally {
      pendingRef.current.delete(id);
      setPendingTaskIds(new Set(pendingRef.current));
    }
  };

  const addTask = async (newTask: BaseTaskForm): Promise<Task | false> => {
    try {
      const taskWithDates = {
        ...newTask,
        due_date: newTask.due_date instanceof Date ? toLocalDateStr(newTask.due_date) : (newTask.due_date ?? undefined),
        due_time: newTask.due_time instanceof Date ? toLocalTimeStr(newTask.due_time) : (newTask.due_time ?? undefined),
        created_date: toLocalISOString(new Date()),
        completed_date: null,
        completed: false,
      };
      const createdTask: Task = await createTask(taskWithDates);
      setTasks([createdTask, ...tasks]);
      return createdTask;
    } catch (err) {
      console.error(err);
      showToast(describeError(err, "Couldn't create the task. Please try again."));
      return false;
    }
  }; 

  // Puts tasks restored from the Archive or Recently deleted page (or by an
  // Undo) back into the active list.
  const restoreTasks = (restored: Task[]) => {
    const ids = new Set(restored.map(t => t.id));
    setTasks(prev => [...prev.filter(t => !ids.has(t.id)), ...restored].sort((a, b) => b.id - a.id));
    setCompletionSyncToken(v => v + 1);
  };

  // Brings a just-deleted task back from the trash with the subtasks that
  // went with it (server-side too), all as they were.
  const undoDelete = async (rootId: number, removed: Task[]) => {
    try {
      const restored = await restoreTaskApi(rootId);
      restoreTasks([restored, ...removed.filter(t => t.id !== rootId)]);
      showToast('Task restored.', 'success');
    } catch (err) {
      console.error('Undo delete failed:', err);
      showToast(describeError(err, "Couldn't restore the task. You can still restore it from Recently deleted."));
    }
  };

  // Deleting a task moves it and its subtasks to the trash (server-side), so
  // the whole subtree leaves the list together.
  const deleteTask = async (delTask: Task) => {
    if (pendingRef.current.has(delTask.id)) return false;
    pendingRef.current.add(delTask.id);
    setPendingTaskIds(new Set(pendingRef.current));

    // Optimistic update: remove immediately so the UI responds instantly.
    const subtreeIds = subtaskTreeIds(tasks, delTask.id);
    const removed = tasks.filter(t => subtreeIds.has(t.id));
    setTasks(prev => prev.filter(t => !subtreeIds.has(t.id)));

    try {
      await onDelete(delTask.id);
      setCompletionSyncToken(v => v + 1);
      showToast('Task moved to Recently deleted. You can restore it for 30 days.', 'info', {
        label: 'Undo',
        onClick: () => undoDelete(delTask.id, removed),
      });
      return true;
    } catch (err) {
      // Rollback: put the subtree back, sorted by id to preserve list order.
      console.error('Delete failed:', err);
      setTasks(prev => [...prev, ...removed].sort((a, b) => b.id - a.id));
      showToast(describeError(err, "Couldn't delete the task, so it has been restored."));
      return false;
    } finally {
      pendingRef.current.delete(delTask.id);
      setPendingTaskIds(new Set(pendingRef.current));
    }
  };

  // Archiving a task archives its subtasks too (server-side), so the whole
  // subtree leaves the active list together.
  const archiveTask = async (archTask: Task): Promise<boolean> => {
    if (pendingRef.current.has(archTask.id)) return false;
    pendingRef.current.add(archTask.id);
    setPendingTaskIds(new Set(pendingRef.current));

    const subtreeIds = subtaskTreeIds(tasks, archTask.id);
    const removed = tasks.filter(t => subtreeIds.has(t.id));
    setTasks(prev => prev.filter(t => !subtreeIds.has(t.id)));

    try {
      await archiveTaskApi(archTask.id);
      setCompletionSyncToken(v => v + 1);
      showToast('Task archived. You can restore it from the Archive page.', 'info');
      return true;
    } catch (err) {
      console.error('Archive failed:', err);
      setTasks(prev => [...prev, ...removed].sort((a, b) => b.id - a.id));
      showToast(describeError(err, "Couldn't archive the task, so it has been restored."));
      return false;
    } finally {
      pendingRef.current.delete(archTask.id);
      setPendingTaskIds(new Set(pendingRef.current));
    }
  };

  const updateTask = async (id: number, updatedTask: EditTaskForm) => {
    try {
      const taskToUpdate = {
        ...updatedTask,
        due_date: updatedTask.due_date instanceof Date ? toLocalDateStr(updatedTask.due_date) : (updatedTask.due_date ?? null),
        due_time: updatedTask.due_time instanceof Date ? toLocalTimeStr(updatedTask.due_time) : (updatedTask.due_time ?? null),
        created_date: updatedTask.created_date instanceof Date ? toLocalISOString(updatedTask.created_date) : (updatedTask.created_date ?? null),
        completed_date: updatedTask.completed_date instanceof Date ? toLocalISOString(updatedTask.completed_date) : (updatedTask.completed_date ?? null),
        tags: updatedTask.tags.map(tag => ({ id: tag.id, name: tag.name, color: tag.color })),
        category: updatedTask.category ?? null,
        priority: updatedTask.completed ? null : updatedTask.priority,
      };
      const updated = await updateWholeTask(id, taskToUpdate) as Task;
      setTasks(prev => prev.map(task => task.id === id ? updated : task));
      return true;
    } catch (err) {
      console.error(err);
      showToast(describeError(err, "Couldn't save the task. Please try again."));
      return false;
    }
  };

  // Saves a task's whole linked-task list (order included) and merges the
  // result: the parent and its linked tasks as saved, new ones added, and the
  // ones left out unlinked. Throws a LinkedTasksSaveError without a toast,
  // so the form can show the reason next to the list.
  const saveLinkedTasks = async (parent: Task, children: LinkedTaskRef[]): Promise<void> => {
    const parentId = parent.id;
    let saved: Awaited<ReturnType<typeof updateLinkedTasks>>;
    try {
      saved = await updateLinkedTasks(parentId, children);
    } catch (err) {
      console.error('Saving linked tasks failed:', err);
      throw new LinkedTasksSaveError(parent, describeError(err, 'Something went wrong. Please try again.'));
    }
    const byId = new Map([saved.parent, ...saved.children].map(t => [t.id, t]));
    setTasks(prev => {
      const next = prev.map(t => {
        const fresh = byId.get(t.id);
        if (fresh) return fresh;
        return t.parent_task_id === parentId ? { ...t, parent_task_id: null, position: null } : t;
      });
      const known = new Set(prev.map(t => t.id));
      const created = saved.children.filter(t => !known.has(t.id));
      return created.length ? [...created.reverse(), ...next] : next;
    });
  };

  return {
    tasks,
    isLoading,
    toggleComplete,
    addTask,
    setTasks,
    deleteTask,
    archiveTask,
    restoreTasks,
    updateTask,
    saveLinkedTasks,
    pendingTaskIds,
    completionSyncToken,
  };
};

/**
 * Manages tag state and CRUD operations.
 *
 * @param enabled - Set false to skip the initial fetch (e.g. no signed-in
 * user yet) — called from TagsProvider (context/TagsContext.tsx), which
 * gates this on auth so pages outside the signed-in app never fire it.
 */
export const useTags = (enabled: boolean) => {
  const showToast = useToast();
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagsLoading, setTagsLoading] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    const loadTags = async () => {
      try {
        setTagsLoading(true);
        const data = await fetchTags();
        setTags(data);
      } catch (error) {
        console.error('Failed to fetch tags:', error);
        setTags([]);
      } finally {
        setTagsLoading(false);
      }
    };

    loadTags();
  }, [enabled]);

  const addTag = async (newTag: NewTag) => {
    if (!newTag.name.trim()) return false;

    try {
      const tag: Tag = await createTag(newTag);
      setTags(prev => [...prev, tag]);
      return tag;
    } catch (err) {
      console.error(err);
      showToast(describeError(err, "Couldn't create the tag. Please try again."));
      return false;
    }
  };

  const delTag = async (delTag: Tag) => {
    try {
      await onDeleteTag(delTag.id);
      setTags(prev => prev.filter(t => t.id !== delTag.id));
      return delTag.id;
    } catch (err) {
      console.error('Delete failed:', err);
      showToast(describeError(err, "Couldn't delete the tag. Please try again."));
      return null;
    }
  };

  // Archiving only hides the tag: tasks and notes keep carrying it, it just
  // drops out of `tags` (pickers, filters, note folders).
  const archiveTag = async (archTag: Tag): Promise<boolean> => {
    const index = tags.findIndex(t => t.id === archTag.id);
    setTags(prev => prev.filter(t => t.id !== archTag.id));
    try {
      await archiveTagApi(archTag.id);
      showToast('Tag archived. You can restore it from the Archive page.', 'info');
      return true;
    } catch (err) {
      console.error('Archive failed:', err);
      setTags(prev => {
        if (prev.some(t => t.id === archTag.id)) return prev;
        const next = [...prev];
        next.splice(index < 0 ? next.length : index, 0, archTag);
        return next;
      });
      showToast(describeError(err, "Couldn't archive the tag, so it has been restored."));
      return false;
    }
  };

  // Puts a tag restored from the Archive page back into the active list.
  const restoreTag = (restored: Tag) => {
    setTags(prev => [...prev.filter(t => t.id !== restored.id), restored]);
  };

  const updateTag = async (tagToUpdate: Tag) => {
    try {
      await updateTagApi(tagToUpdate.id, { name: tagToUpdate.name, color: tagToUpdate.color });
      setTags(prev => prev.map(tag => tag.id === tagToUpdate.id ? tagToUpdate : tag));
      return tagToUpdate.id;
    } catch (err) {
      console.error('Update failed:', err);
      showToast(describeError(err, "Couldn't update the tag. Please try again."));
      return null;
    }
  };
  return {
    tags,
    tagsLoading,
    addTag,
    delTag,
    archiveTag,
    restoreTag,
    updateTag,
    setTags
  };
};