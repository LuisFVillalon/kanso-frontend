import { useState } from 'react';
import { FilterType, Tag, EditTaskModalState, NewTag, BaseTaskForm, NewHabit } from '@/app/types/task';
import { DEFAULT_ACCENT } from '@/app/lib/theme';

/**
 * All of TaskManager's UI state — filters/search, modal-open flags, and
 * in-progress form data — in one hook. Previously split across this hook
 * and a separate useTaskManagerUIState with no principled boundary between
 * them (e.g. showCreateHabitModal lived here while showManageHabitsModal
 * lived there); merged into one so "is this modal open" always has exactly
 * one place to look.
 */
export const useTaskManagerState = () => {
  const [sortOrder, setSortOrder] = useState<Record<FilterType, 'asc' | 'desc'>>({
    all: 'asc',
    active: 'asc',
    completed: 'asc',
    priority: 'asc',
    created: 'asc',
    duration: 'asc',
  });

  // Independent of the task filter/sort above — controls only the note
  // list's edit-recency order, so toggling it never touches the active
  // task filter or the tasks' own sort order.
  const [noteSortOrder, setNoteSortOrder] = useState<'asc' | 'desc'>('asc');

  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

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
  const [taskSidebarOpen, setTaskSidebarOpen] = useState(false);

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
    // State
    sortOrder,
    setSortOrder,
    noteSortOrder,
    setNoteSortOrder,
    selectedTags,
    setSelectedTags,
    showTagDropdown,
    setShowTagDropdown,
    filter,
    setFilter,
    searchTerm,
    setSearchTerm,
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
    taskSidebarOpen,
    setTaskSidebarOpen,
    newTag,
    setNewTag,
    newHabit,
    setNewHabit,
    newTask,
    setNewTask,
  };
};
