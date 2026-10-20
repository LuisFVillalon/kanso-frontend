'use client';

import React from 'react';
import NewTaskModal from '@/app/components/task/NewTaskModal';
import EditTaskModal from '@/app/components/task/EditTaskModal';
import type { TaskFormData } from '@/app/components/task/TaskFormFields';
import CreateTagModal from '@/app/components/tag/CreateTagModal';
import EditTagModal from '@/app/components/tag/EditTagListModal';
import CreateHabitModal from '@/app/components/habit/CreateHabitModal';
import ManageHabitsModal from '@/app/components/habit/ManageHabitsModal';
import HabitHistoryModal from '@/app/components/habit/HabitHistoryModal';
import SettingsModal from '@/app/components/settings/SettingsModal';
import { Tag, BaseTaskForm, NewTag, NewHabit, Task } from '@/app/types/task';
import type { Habit } from '@/app/types/habit';
import type { ProfileFields } from '@/app/hooks/useProfile';
import type { CalendarSettings } from '@/app/types/calendar';

interface TaskManagerModalsProps {
  // New task
  showNewTaskModal: boolean;
  onCloseNewTaskModal: () => void;
  newTask: BaseTaskForm;
  onTaskChange: (task: BaseTaskForm) => void;
  onToggleTag: (tag: Tag) => void;
  onSubmitTask: (e: React.FormEvent) => void;
  activeTaskCount: number;
  occupiedPriorityLevels: number[];
  tags: Tag[];

  // Edit task
  showEditTaskModal: boolean;
  editTask: Task | null;
  onCloseEditTaskModal: () => void;
  onEditTaskChange: (task: TaskFormData) => void;
  onToggleEditTag: (tag: Tag) => void;
  onSubmitEditTask: (e: React.FormEvent) => void;

  // Create tag
  showCreateTagModal: boolean;
  onCloseCreateTagModal: () => void;
  newTag: NewTag;
  onTagChange: (tag: NewTag) => void;
  onSubmitTag: (e: React.FormEvent) => void;

  // Edit tag
  editingTag: Tag | null;
  showEditTagModal: boolean;
  onCloseEditTagModal: () => void;
  onDeleteTag: (tag: Tag) => void;
  onArchiveTag: (tag: Tag) => Promise<boolean>;
  onEditTag: (tag: Tag) => void;
  onOpenCreateTag: () => void;

  // Create habit
  showCreateHabitModal: boolean;
  onCloseCreateHabitModal: () => void;
  newHabit: NewHabit;
  onHabitChange: (habit: NewHabit) => void;
  onSubmitHabit: (e: React.FormEvent) => void;

  // Manage habits
  showManageHabitsModal: boolean;
  onCloseManageHabitsModal: () => void;
  habits: Habit[];
  onCreateHabitFromManage: () => void;
  onDeleteHabit: (habit: Habit) => Promise<boolean>;
  onArchiveHabit: (habit: Habit) => Promise<boolean>;
  onUpdateHabit: (id: number, title: string, tags: Tag[], estimatedTime?: number | null) => Promise<void>;
  onViewHabitHistory: (id: number) => void;

  // Habit history
  historyHabit: Habit | null;
  historyShowBackButton: boolean;
  onCloseHabitHistory: () => void;
  onToggleHabitDate: (id: number, date: string) => Promise<void>;

  // Settings
  showSettings: boolean;
  onCloseSettings: () => void;
  onAccountDeleted: () => void;
  profile: ProfileFields;
  profileLoading: boolean;
  onSaveProfile: (next: ProfileFields) => Promise<{ ok: boolean; error?: string }>;
  calendarSettings: CalendarSettings;
  calendarSettingsLoading: boolean;
  onSaveCalendarSettings: (changes: Partial<Omit<CalendarSettings, 'id'>>) => Promise<CalendarSettings>;
}

const TaskManagerModals: React.FC<TaskManagerModalsProps> = ({
  showNewTaskModal, onCloseNewTaskModal, newTask, onTaskChange, onToggleTag,
  onSubmitTask, activeTaskCount, occupiedPriorityLevels, tags,
  showEditTaskModal, editTask, onCloseEditTaskModal, onEditTaskChange, onToggleEditTag, onSubmitEditTask,
  showCreateTagModal, onCloseCreateTagModal, newTag, onTagChange, onSubmitTag,
  editingTag, showEditTagModal, onCloseEditTagModal, onDeleteTag, onArchiveTag, onEditTag, onOpenCreateTag,
  showCreateHabitModal, onCloseCreateHabitModal, newHabit, onHabitChange, onSubmitHabit,
  showManageHabitsModal, onCloseManageHabitsModal, habits, onCreateHabitFromManage,
  onDeleteHabit, onArchiveHabit, onUpdateHabit, onViewHabitHistory,
  historyHabit, historyShowBackButton, onCloseHabitHistory, onToggleHabitDate,
  showSettings, onCloseSettings, onAccountDeleted, profile, profileLoading, onSaveProfile,
  calendarSettings, calendarSettingsLoading, onSaveCalendarSettings,
}) => {
  return (
    <>
      <NewTaskModal
        isOpen={showNewTaskModal}
        onClose={onCloseNewTaskModal}
        newTask={newTask}
        onTaskChange={onTaskChange}
        tags={tags}
        onToggleTag={onToggleTag}
        onSubmit={onSubmitTask}
        activeTaskCount={activeTaskCount}
        usedPriorityLevels={occupiedPriorityLevels}
      />

      <EditTaskModal
        isOpen={showEditTaskModal}
        task={editTask}
        onClose={onCloseEditTaskModal}
        onTaskChange={onEditTaskChange}
        tags={tags}
        onToggleTag={onToggleEditTag}
        onSubmit={onSubmitEditTask}
        activeTaskCount={activeTaskCount}
        usedPriorityLevels={occupiedPriorityLevels}
      />

      <CreateTagModal
        isOpen={showCreateTagModal}
        onClose={onCloseCreateTagModal}
        newTag={newTag}
        onTagChange={onTagChange}
        onSubmit={onSubmitTag}
      />

      {editingTag && (
        <EditTagModal
          isOpen={showEditTagModal}
          onClose={onCloseEditTagModal}
          allTags={tags}
          onDeleteTag={onDeleteTag}
          onArchiveTag={onArchiveTag}
          onEditTag={onEditTag}
          onCreateTag={onOpenCreateTag}
        />
      )}

      <CreateHabitModal
        isOpen={showCreateHabitModal}
        onClose={onCloseCreateHabitModal}
        newHabit={newHabit}
        onHabitChange={onHabitChange}
        onSubmit={onSubmitHabit}
        availableTags={tags}
      />

      <ManageHabitsModal
        isOpen={showManageHabitsModal}
        onClose={onCloseManageHabitsModal}
        habits={habits}
        availableTags={tags}
        onCreateHabit={onCreateHabitFromManage}
        onDeleteHabit={onDeleteHabit}
        onArchiveHabit={onArchiveHabit}
        onUpdateHabit={onUpdateHabit}
        onViewHistory={onViewHabitHistory}
      />

      <HabitHistoryModal
        habit={historyHabit}
        showBackButton={historyShowBackButton}
        onClose={onCloseHabitHistory}
        onToggleDate={onToggleHabitDate}
      />

      <SettingsModal
        isOpen={showSettings}
        onClose={onCloseSettings}
        onAccountDeleted={onAccountDeleted}
        profile={profile}
        profileLoading={profileLoading}
        onSaveProfile={onSaveProfile}
        calendarSettings={calendarSettings}
        calendarSettingsLoading={calendarSettingsLoading}
        onSaveCalendarSettings={onSaveCalendarSettings}
      />
    </>
  );
};

export default TaskManagerModals;
