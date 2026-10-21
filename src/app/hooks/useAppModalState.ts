import { useState } from 'react';
import { Tag, EditTaskModalState, NewTag, BaseTaskForm, NewHabit } from '@/app/types/task';
import { DEFAULT_ACCENT } from '@/app/lib/theme';

/**
 * The app shell's modal state — modal-open flags and in-progress form data —
 * in one hook, so "is this modal open" always has exactly one place to look.
 * AppShell owns it, which is what lets the rail's New menu and the account
 * menu open these modals from every page. The home list's own view state
 * (show/sort, search, tag filter) lives in TaskManager.
 */
export const useAppModalState = () => {
  // Modal states
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [showEditTaskModal, setShowEditTaskModal] = useState<EditTaskModalState>({
    status: false,
    task: null,
  });
  const [showCreateTagModal, setShowCreateTagModal] = useState(false);
  const [showEditTagModal, setShowEditTagModal] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [showCreateHabitModal, setShowCreateHabitModal] = useState(false);
  const [showManageHabitsModal, setShowManageHabitsModal] = useState(false);
  const [createHabitFromManage, setCreateHabitFromManage] = useState(false);
  const [historyHabitId, setHistoryHabitId] = useState<number | null>(null);
  const [historyFromManageHabits, setHistoryFromManageHabits] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Form states
  const [newTag, setNewTag] = useState<NewTag>({
    name: '',
    color: DEFAULT_ACCENT
  });
  const [newHabit, setNewHabit] = useState<NewHabit>({
    title: '',
    tags: [],
    estimated_time: null,
  });
  const [newTask, setNewTask] = useState<BaseTaskForm>({
    id: 0,
    title: '',
    description: '',
    priority: null,
    due_date: '',
    due_time: '',
    tags: [],
    category: null,
    estimated_time: 0,
    reminder_minutes: null,
    created_date: '',
  });
  return {
    showNewTaskModal,
    setShowNewTaskModal,
    showEditTaskModal,
    setShowEditTaskModal,
    showCreateTagModal,
    setShowCreateTagModal,
    showEditTagModal,
    setShowEditTagModal,
    editingTag,
    setEditingTag,
    showCreateHabitModal,
    setShowCreateHabitModal,
    showManageHabitsModal,
    setShowManageHabitsModal,
    createHabitFromManage,
    setCreateHabitFromManage,
    historyHabitId,
    setHistoryHabitId,
    historyFromManageHabits,
    setHistoryFromManageHabits,
    showSettings,
    setShowSettings,
    newTag,
    setNewTag,
    newHabit,
    setNewHabit,
    newTask,
    setNewTask,
  };
};
