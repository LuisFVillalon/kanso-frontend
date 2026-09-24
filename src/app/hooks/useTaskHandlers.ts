import React from 'react';
import { FilterType, EditTaskForm, Tag, EditTaskModalState, NewTag, BaseTaskForm, Task } from '@/app/types/task';
import { taskToEditForm } from '@/app/utils/taskUtils';
import { useToast } from '@/app/context/ToastContext';

interface UseTaskHandlersProps {
  // State setters
  setShowNewTaskModal: (show: boolean) => void;
  setNewTask: React.Dispatch<React.SetStateAction<BaseTaskForm>>;
  setShowEditTaskModal: React.Dispatch<React.SetStateAction<EditTaskModalState>>;
  setShowCreateTagModal: (show: boolean) => void;
  setNewTag: React.Dispatch<React.SetStateAction<NewTag>>;
  setEditingTag: (tag: Tag | null) => void;
  setShowEditTagModal: (show: boolean) => void;
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  setSortOrder: React.Dispatch<React.SetStateAction<Record<FilterType, 'asc' | 'desc'>>>;
  setSelectedTags: React.Dispatch<React.SetStateAction<Tag[]>>;
  setFilter: React.Dispatch<React.SetStateAction<FilterType>>;

  // Current state values
  newTask: BaseTaskForm;
  showEditTaskModal: EditTaskModalState;
  newTag: { name: string; color: string };
  filter: FilterType;

  // API functions
  addTask: (task: BaseTaskForm) => Promise<Task | false>;
  updateTask: (id: number, task: EditTaskForm) => Promise<boolean>;
  addTag: (tag: { name: string; color: string }) => Promise<Tag | false>;
  updateTag: (tag: Tag) => Promise<number | null>;
  delTag: (tag: Tag) => Promise<number | null>;
}

/** Toggles an item in an array by its `id`. Returns a new array. */
const toggleById = <T extends { id: number }>(arr: T[], item: T): T[] =>
  arr.some(t => t.id === item.id)
    ? arr.filter(t => t.id !== item.id)
    : [...arr, item];

export const useTaskHandlers = ({
  setShowNewTaskModal,
  setNewTask,
  setShowEditTaskModal,
  setShowCreateTagModal,
  setNewTag,
  setEditingTag,
  setShowEditTagModal,
  setTasks,
  setSortOrder,
  setSelectedTags,
  setFilter,
  newTask,
  showEditTaskModal,
  newTag,
  filter,
  addTask,
  updateTask,
  addTag,
  updateTag,
  delTag,
}: UseTaskHandlersProps) => {
  const showToast = useToast();

  const toggleSelectedTag = (tag: Tag) => {
    setSelectedTags(prev => toggleById(prev, tag));
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.title.trim()) {
      showToast('Give the task a title first.', 'info');
      return;
    }
    const success = await addTask(newTask);
    if (success) {
      setShowNewTaskModal(false);
      setNewTask({
        id: 0,
        title: '',
        description: '',
        priority: null,
        due_date: '',
        due_time: '',
        tags: [],
        category: null,
        estimated_time: null,
        created_date: '',
      });
    }
  };

  const handleEditTask = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!showEditTaskModal.task) return;
    const taskData = taskToEditForm(showEditTaskModal.task);

    const success = await updateTask(showEditTaskModal.task.id, taskData);
    if (success) {
      setShowEditTaskModal({status: false, task: null});
    }
  };

  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();

    const tag = await addTag(newTag);
    if (tag) {
      setNewTask((prev: BaseTaskForm) => ({
        ...prev,
        tags: [...prev.tags, tag]
      }));

      setNewTag({name: '', color: '#3B82F6' });
      setShowCreateTagModal(false);
    }
  };

  const handleEditTag = async (tagToEdit: Tag): Promise<boolean> => {
    const updatedTagId = await updateTag(tagToEdit);
    if (updatedTagId !== null) {
      // Update the tag in all tasks that have it
      setTasks(prevTasks =>
        prevTasks.map(task => ({
          ...task,
          tags: task.tags.map(tag => tag.id === updatedTagId ? tagToEdit : tag)
        }))
      );
    }
    return updatedTagId !== null;
  };

  const handleDeleteTag = async (tagToDelete: Tag): Promise<boolean> => {
    const deletedTagId = await delTag(tagToDelete);
    if (deletedTagId !== null) {
      // Remove the tag from all tasks that have it
      setTasks(prevTasks =>
        prevTasks.map(task => ({
          ...task,
          tags: task.tags.filter(tag => tag.id !== deletedTagId)
        }))
      );
    }
    return deletedTagId !== null;
  };

  const openEditTagModal = (tag: Tag) => {
    setEditingTag(tag);
    setShowEditTagModal(true);
  };

  const toggleTag = (tag: Tag) => {
    setNewTask((prev: BaseTaskForm) => ({ ...prev, tags: toggleById(prev.tags, tag) }));
  };

  const toggleEditTag = (tag: Tag) => {
    setShowEditTaskModal(prev => {
      if (!prev.task) return prev;
      return { ...prev, task: { ...prev.task, tags: toggleById(prev.task.tags, tag) } };
    });
  };

  const handleFilterChange = (newFilter: FilterType) => {
    if (filter === newFilter) {
      // 'all' has a fixed sort order and doesn't toggle
      if (newFilter === 'all') return;
      // Same filter clicked → toggle sort
      setSortOrder(prev => ({
        ...prev,
        [newFilter]: prev[newFilter] === 'asc' ? 'desc' : 'asc'
      }));
    } else {
      setFilter(newFilter);
    }
  };


  return {
    toggleSelectedTag,
    handleCreateTask,
    handleEditTask,
    handleCreateTag,
    handleEditTag,
    handleDeleteTag,
    openEditTagModal,
    toggleTag,
    toggleEditTag,
    handleFilterChange,
  };
};