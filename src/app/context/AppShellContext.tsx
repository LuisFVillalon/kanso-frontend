'use client';

import { createContext, useContext } from 'react';
import type { useProfile } from '@/app/hooks/useProfile';
import type { useCalendarSettings } from '@/app/hooks/useCalendarSettings';
import type { SettingsSection } from '@/app/components/settings/SettingsModal';
import type { Note } from '@/app/types/notes';
import type { Task } from '@/app/types/task';

/**
 * What the app shell (components/layout/AppShell.tsx) shares with the pages
 * inside it: the create and account actions behind the rail's New menu and
 * avatar menu, so any page can open the same modals, plus the one profile and
 * Term Tracker state those modals edit.
 */
export interface AppShellValue {
  profileState: ReturnType<typeof useProfile>;
  calendarSettingsState: ReturnType<typeof useCalendarSettings>;
  openNewTask: () => void;
  /** Creates a draft note and opens it: in Home's Notes panel on Home, on the Notes page elsewhere. */
  createNote: () => void;
  openNewHabit: () => void;
  /** Opens the new-event form for today. */
  openNewEvent: () => void;
  /** Bumped each time the New menu adds an event, so calendars refetch. */
  eventsSyncToken: number;
  openEditTask: (task: Task) => void;
  openSettings: (section?: SettingsSection) => void;
  openManageTags: () => void;
  openManageHabits: () => void;
  openHabitHistory: (habitId: number) => void;
  /** Asks to confirm, then signs out. */
  requestLogout: () => void;
  /** Bumped each time Settings closes, so views can pick up what changed there. */
  settingsClosedToken: number;
  /** Home registers how a new note opens on it; pass null to unregister. */
  registerNoteOpener: (open: ((note: Note) => void) | null) => void;
}

export const AppShellContext = createContext<AppShellValue | null>(null);

export function useAppShell(): AppShellValue {
  const value = useContext(AppShellContext);
  if (!value) throw new Error('useAppShell must be used inside <AppShell>');
  return value;
}
