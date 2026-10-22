import React from 'react';
import { EditTaskForm, Tag, EditTaskModalState, NewTag, BaseTaskForm, Task, LinkedTaskRef } from '@/app/types/task';
import { applyNewTaskForm, taskToEditForm } from '@/app/utils/taskUtils';
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

  // Current state values
  newTask: BaseTaskForm;
  showEditTaskModal: EditTaskModalState;
  newTag: { name: string; color: string };

  // API functions
  addTask: (task: BaseTaskForm) => Promise<Task | false>;
  updateTask: (id: number, task: EditTaskForm) => Promise<boolean>;
  saveLinkedTasks: (parent: Task, children: LinkedTaskRef[]) => Promise<void>;
  addTag: (tag: { name: string; color: string }) => Promise<Tag | false>;
  updateTag: (tag: Tag) => Promise<number | null>;
  delTag: (tag: Tag) => Promise<number | null>;
}

/** Toggles an item in an array by its `id`. Returns a new array. */
export const toggleById = <T extends { id: number }>(arr: T[], item: T): T[] =>
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
  newTask,
  showEditTaskModal,
  newTag,
  addTask,
  updateTask,
  saveLinkedTasks,
  addTag,
  updateTag,
  delTag,
}: UseTaskHandlersProps) => {
  const showToast = useToast();

  // `linked` is saved as the new task's linked tasks once it exists; a
  // failure there throws a LinkedTasksSaveError and leaves the modal open.
  // `created` is the task an earlier try already created, which is updated
  // instead of creating it again.
  const handleCreateTask = async (e: React.FormEvent, linked?: LinkedTaskRef[], created?: Task) => {
    e.preventDefault();
    if (!newTask.title.trim()) {
      showToast('Give the task a title first.', 'info');
      return;
    }
    const task = created
      ? (await updateTask(created.id, applyNewTaskForm(created, newTask))) && created
      : await addTask(newTask);
    if (task) {
      if (linked) await saveLinkedTasks(task, linked);
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
        reminder_minutes: null,
        created_date: '',
      });
    }
  };

  // `linked`, when given, is saved as the task's linked tasks after the task
  // itself; a failure there throws a LinkedTasksSaveError and leaves the modal open.
  const handleEditTask = async (e: React.FormEvent, linked?: LinkedTaskRef[]) => {
    e.preventDefault();

    if (!showEditTaskModal.task) return;
    const taskData = taskToEditForm(showEditTaskModal.task);

    const success = await updateTask(showEditTaskModal.task.id, taskData);
    if (success) {
      if (linked) await saveLinkedTasks(showEditTaskModal.task, linked);
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

  return {
    handleCreateTask,
    handleEditTask,
    handleCreateTag,
    handleEditTag,
    handleDeleteTag,
    openEditTagModal,
    toggleTag,
    toggleEditTag,
  };
};