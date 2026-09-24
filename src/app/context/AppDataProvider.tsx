'use client';

import React from 'react';
import { useAuth } from './AuthContext';
import { TasksProvider } from './TasksContext';
import { TagsProvider } from './TagsContext';
import { HabitsProvider } from './HabitsContext';
import { NotesProvider } from './NotesContext';

/**
 * Mounted once in the root layout, inside <AuthProvider> — the only place
 * that survives client-side navigation between "/", "/calendar", and
 * "/notes". Before this, TaskManager, useYearCalendarData (used by both the
 * dashboard's calendar slide and the /calendar page), and NotesView each
 * independently called useTasks/useTags/useHabits/useNotes, hitting the
 * backend fresh on every mount — 3-4x redundant fetches of the same data
 * per session. Consumers now read via useTasksContext/useTagsContext/
 * useHabitsContext/useNotesContext instead of calling those hooks directly.
 *
 * Four separate contexts rather than one merged value — a merged context
 * would re-render every consumer whenever any single domain's state changes
 * (e.g. typing in a note title would re-render the calendar grid), which
 * today's independent-hook architecture doesn't couple together.
 *
 * Keyed on the user whose data is loaded, so signing in as someone else
 * (including a replacement demo sandbox) starts from empty state and
 * refetches, instead of showing the previous user's data.
 */
export const AppDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { dataUserId } = useAuth();
  return (
    <TasksProvider key={dataUserId ?? 'signed-out'}>
      <TagsProvider>
        <HabitsProvider>
          <NotesProvider>
            {children}
          </NotesProvider>
        </HabitsProvider>
      </TagsProvider>
    </TasksProvider>
  );
};
