'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/app/context/AuthContext';
import { useToast } from '@/app/context/ToastContext';
import { useTasksContext } from '@/app/context/TasksContext';
import { useTagsContext } from '@/app/context/TagsContext';
import { useHabitsContext } from '@/app/context/HabitsContext';
import { useNotesContext } from '@/app/context/NotesContext';
import { AppShellContext, type AppShellValue } from '@/app/context/AppShellContext';
import { createHabit, describeError, updateHabit } from '@/app/lib/backend-api';
import { useProfile } from '@/app/hooks/useProfile';
import { useCalendarSettings } from '@/app/hooks/useCalendarSettings';
import { useNavExpanded } from '@/app/hooks/useNavExpanded';
import { useAppModalState } from '@/app/hooks/useAppModalState';
import { useTaskHandlers } from '@/app/hooks/useTaskHandlers';
import { useRestoreFromTrash } from '@/app/hooks/useRestoreFromTrash';
import type { TaskFormData } from '@/app/components/task/TaskFormFields';
import type { SettingsSection } from '@/app/components/settings/SettingsModal';
import SignOutConfirm from '@/app/components/common/SignOutConfirm';
import AppNav, { NAV_ITEMS } from '@/app/components/layout/AppNav';
import TaskManagerModals from '@/app/components/layout/TaskManagerModals';
import type { Note } from '@/app/types/notes';
import type { Tag, Task } from '@/app/types/task';

/** Single-key shortcuts don't fire while typing or while a menu has focus. */
const SHORTCUT_IGNORED = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="menu"]';
// How long after G the second key of a go-to shortcut (G H, G N, …) counts.
const GO_TO_WINDOW_MS = 1000;

/**
 * The signed-in app's frame, shared by Home, Notes, Calendar, Archive and
 * Recently deleted through the (app) route group: the navigation (AppNav),
 * the modals its New and account menus open (so they work on every page),
 * the logout confirmation, and the global keyboard shortcuts (T new task,
 * N new note, G then a page's letter to go there).
 *
 * Until a user is signed in it renders the page alone, without navigation, so
 * the home page (src/app/(app)/page.tsx) shows just its spinner while auth
 * loads, then the dashboard (TaskManager).
 */
const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, demoSeeding, isDemo, signOut } = useAuth();
  const signedIn = !loading && !!user && !demoSeeding;
  const showToast = useToast();

  const profileState = useProfile(user);
  const calendarSettingsState = useCalendarSettings(user);
  const { profile, loading: profileLoading, saveProfileField } = profileState;
  const {
    calendarSettings, loading: calendarSettingsLoading, saveCalendarSettings,
    archivedTerms, archiveCurrentTerm, removeArchivedTerm,
  } = calendarSettingsState;
  const [navExpanded, setNavExpanded] = useNavExpanded();

  const state = useAppModalState();
  const [settingsSection, setSettingsSection] = useState<SettingsSection | undefined>(undefined);
  const [settingsClosedToken, setSettingsClosedToken] = useState(0);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const noteOpener = useRef<((note: Note) => void) | null>(null);

  const { tasks, addTask, updateTask, saveLinkedTasks, setTasks } = useTasksContext();
  const { tags, addTag, delTag, archiveTag, updateTag } = useTagsContext();
  const {
    habits, toggleDate: toggleHabitDate, refetch: refetchHabits, deleteHabit, archiveHabit,
  } = useHabitsContext();
  const { addNote, removeTagFromNotes } = useNotesContext();
  const restoreFromTrash = useRestoreFromTrash();
  const historyHabit = habits.find(h => h.id === state.historyHabitId) ?? null;

  const occupiedPriorityLevels = useMemo(
    () => tasks.filter(t => !t.completed && t.priority != null).map(t => t.priority as number),
    [tasks],
  );
  const activeTaskCount = useMemo(() => tasks.filter(t => !t.completed).length, [tasks]);

  const handleLogout = async () => {
    await signOut();
    // Every tm_*/tm-* key is a per-device cache of this account's data
    // (profile fields, theme, doodle) — clear all of it so a different
    // account signing in on this browser doesn't inherit the previous
    // user's name/avatar/rest-days/doodle.
    Object.keys(localStorage)
      .filter(k => k.startsWith('tm_') || k.startsWith('tm-'))
      .forEach(k => localStorage.removeItem(k));
    router.replace('/login');
  };

  const handlers = useTaskHandlers({
    setShowNewTaskModal: state.setShowNewTaskModal,
    setNewTask: state.setNewTask,
    setShowEditTaskModal: state.setShowEditTaskModal,
    setShowCreateTagModal: state.setShowCreateTagModal,
    setNewTag: state.setNewTag,
    setEditingTag: state.setEditingTag,
    setShowEditTagModal: state.setShowEditTagModal,
    setTasks,
    newTask: state.newTask,
    showEditTaskModal: state.showEditTaskModal,
    newTag: state.newTag,
    addTask,
    updateTask,
    saveLinkedTasks,
    addTag,
    updateTag,
    delTag,
  });

  const handleEditTaskChange = (next: TaskFormData) => {
    state.setShowEditTaskModal(prev => prev.task ? { ...prev, task: { ...prev.task, ...next } as Task } : prev);
  };

  // A deleted tag is hidden from every item carrying it until it's restored.
  const handleDeleteTag = async (tag: Tag) => {
    const deleted = await handlers.handleDeleteTag(tag);
    if (!deleted) return false;
    removeTagFromNotes(tag.id);
    refetchHabits();
    showToast('Tag moved to Recently deleted. You can restore it for 30 days.', 'info', {
      label: 'Undo',
      onClick: () => {
        restoreFromTrash('tag', tag.id)
          .then(() => showToast('Tag restored.', 'success'))
          .catch(err => {
            console.error('Undo delete failed:', err);
            showToast(describeError(err, "Couldn't restore the tag. You can still restore it from Recently deleted."));
          });
      },
    });
    return true;
  };

  const handleUpdateHabit = async (id: number, title: string, habitTags: Tag[], estimatedTime?: number | null) => {
    try {
      await updateHabit(id, { title, tags: habitTags, estimated_time: estimatedTime ?? null });
      refetchHabits();
    } catch (err) {
      console.error('Failed to update habit:', err);
      showToast(describeError(err, "Couldn't update the habit. Please try again."));
    }
  };

  const handleCreateHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!state.newHabit.title.trim()) return;
    try {
      await createHabit({ title: state.newHabit.title.trim(), tags: state.newHabit.tags, estimated_time: state.newHabit.estimated_time ?? null });
      state.setNewHabit({ title: '', tags: [], estimated_time: null });
      state.setShowCreateHabitModal(false);
      if (state.createHabitFromManage) {
        state.setCreateHabitFromManage(false);
        state.setShowManageHabitsModal(true);
      }
      refetchHabits();
    } catch (err) {
      console.error('Failed to create habit:', err);
      showToast(describeError(err, "Couldn't save the habit. Please try again."));
    }
  };

  const createNote = () => {
    const note = addNote();
    if (pathname === '/' && noteOpener.current) noteOpener.current(note);
    else router.push(`/notes?id=${note.id}`);
  };

  const openSettings = (section?: SettingsSection) => {
    setSettingsSection(section);
    state.setShowSettings(true);
  };

  // With no tags yet there's nothing to manage, so start by creating one.
  const openManageTags = () => {
    if (tags.length > 0) handlers.openEditTagModal(tags[0]);
    else state.setShowCreateTagModal(true);
  };

  const registerNoteOpener = useCallback((open: ((note: Note) => void) | null) => {
    noteOpener.current = open;
  }, []);

  const value: AppShellValue = {
    profileState,
    calendarSettingsState,
    openNewTask: () => state.setShowNewTaskModal(true),
    createNote,
    openNewHabit: () => state.setShowCreateHabitModal(true),
    openEditTask: task => state.setShowEditTaskModal({ status: true, task }),
    openSettings,
    openManageTags,
    openManageHabits: () => state.setShowManageHabitsModal(true),
    openHabitHistory: id => state.setHistoryHabitId(id),
    requestLogout: () => setConfirmingLogout(true),
    settingsClosedToken,
    registerNoteOpener,
  };

  // The shortcut listener is bound once and reads the latest actions from here.
  const actions = useRef(value);
  useEffect(() => { actions.current = value; });

  useEffect(() => {
    if (!signedIn) return;
    let goPressedAt = 0;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest(SHORTCUT_IGNORED)) return;
      // A modal is open over the page.
      if (document.querySelector('.modal-overlay.fixed')) return;
      const key = e.key.toLowerCase();
      if (Date.now() - goPressedAt < GO_TO_WINDOW_MS) {
        goPressedAt = 0;
        const item = NAV_ITEMS.find(i => i.goKey === key);
        if (item) {
          e.preventDefault();
          router.push(item.href);
        }
        return;
      }
      if (key === 'g') goPressedAt = Date.now();
      else if (key === 't') {
        e.preventDefault();
        actions.current.openNewTask();
      } else if (key === 'n') {
        e.preventDefault();
        actions.current.createNote();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [signedIn, router]);

  return (
    <AppShellContext.Provider value={value}>
      {signedIn && (
        <AppNav
          expanded={navExpanded}
          onToggleExpanded={() => setNavExpanded(!navExpanded)}
          profileName={profile.name}
          profileAvatar={profile.avatar}
          email={user?.email}
          isDemo={isDemo}
          onNewTask={value.openNewTask}
          onNewNote={createNote}
          onNewHabit={value.openNewHabit}
          onSettings={() => openSettings()}
          onManageTags={openManageTags}
          onManageHabits={value.openManageHabits}
          onLogout={value.requestLogout}
        />
      )}

      <div
        className={signedIn ? 'app-content' : undefined}
        data-nav-expanded={signedIn && navExpanded ? 'true' : undefined}
      >
        {children}
      </div>

      {signedIn && (
        <TaskManagerModals
          // New task
          showNewTaskModal={state.showNewTaskModal}
          onCloseNewTaskModal={() => state.setShowNewTaskModal(false)}
          newTask={state.newTask}
          onTaskChange={state.setNewTask}
          onToggleTag={handlers.toggleTag}
          onSubmitTask={handlers.handleCreateTask}
          activeTaskCount={activeTaskCount}
          occupiedPriorityLevels={occupiedPriorityLevels}
          tags={tags}
          allTasks={tasks}
          // Edit task
          showEditTaskModal={state.showEditTaskModal.status}
          editTask={state.showEditTaskModal.task}
          onCloseEditTaskModal={() => state.setShowEditTaskModal({ status: false, task: null })}
          onEditTaskChange={handleEditTaskChange}
          onToggleEditTag={handlers.toggleEditTag}
          onSubmitEditTask={handlers.handleEditTask}
          onSaveLinkedTask={handlers.handleSaveLinkedTask}
          // Create tag
          showCreateTagModal={state.showCreateTagModal}
          onCloseCreateTagModal={() => state.setShowCreateTagModal(false)}
          newTag={state.newTag}
          onTagChange={state.setNewTag}
          onSubmitTag={handlers.handleCreateTag}
          // Edit tag
          editingTag={state.editingTag}
          showEditTagModal={state.showEditTagModal}
          onCloseEditTagModal={() => { state.setShowEditTagModal(false); state.setEditingTag(null); }}
          onDeleteTag={handleDeleteTag}
          onArchiveTag={archiveTag}
          onEditTag={handlers.handleEditTag}
          onOpenCreateTag={() => state.setShowCreateTagModal(true)}
          // Create habit
          showCreateHabitModal={state.showCreateHabitModal}
          onCloseCreateHabitModal={() => {
            state.setShowCreateHabitModal(false);
            state.setNewHabit({ title: '', tags: [], estimated_time: null });
            if (state.createHabitFromManage) {
              state.setCreateHabitFromManage(false);
              state.setShowManageHabitsModal(true);
            }
          }}
          newHabit={state.newHabit}
          onHabitChange={state.setNewHabit}
          onSubmitHabit={handleCreateHabit}
          // Manage habits
          showManageHabitsModal={state.showManageHabitsModal}
          onCloseManageHabitsModal={() => state.setShowManageHabitsModal(false)}
          habits={habits}
          onCreateHabitFromManage={() => {
            state.setShowManageHabitsModal(false);
            state.setCreateHabitFromManage(true);
            state.setShowCreateHabitModal(true);
          }}
          onDeleteHabit={deleteHabit}
          onArchiveHabit={archiveHabit}
          onUpdateHabit={handleUpdateHabit}
          onViewHabitHistory={id => { state.setShowManageHabitsModal(false); state.setHistoryFromManageHabits(true); state.setHistoryHabitId(id); }}
          // Habit history
          historyHabit={historyHabit}
          historyShowBackButton={state.historyFromManageHabits}
          onCloseHabitHistory={() => {
            state.setHistoryHabitId(null);
            if (state.historyFromManageHabits) {
              state.setHistoryFromManageHabits(false);
              state.setShowManageHabitsModal(true);
            }
          }}
          onToggleHabitDate={toggleHabitDate}
          // Settings
          showSettings={state.showSettings}
          settingsSection={settingsSection}
          onCloseSettings={() => { state.setShowSettings(false); setSettingsClosedToken(n => n + 1); }}
          onAccountDeleted={handleLogout}
          onSignOut={handleLogout}
          profile={profile}
          profileLoading={profileLoading}
          onSaveProfileField={saveProfileField}
          calendarSettings={calendarSettings}
          calendarSettingsLoading={calendarSettingsLoading}
          onSaveCalendarSettings={saveCalendarSettings}
          archivedTerms={archivedTerms}
          onArchiveTerm={archiveCurrentTerm}
          onDeleteArchivedTerm={removeArchivedTerm}
        />
      )}

      {confirmingLogout && (
        <SignOutConfirm onCancel={() => setConfirmingLogout(false)} onConfirm={handleLogout} />
      )}
    </AppShellContext.Provider>
  );
};

export default AppShell;
