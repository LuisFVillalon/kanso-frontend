'use client';

import React, { createContext, useContext } from 'react';
import { useAuth } from './AuthContext';
import { useTasks as useTasksData } from '@/app/hooks/useTasksAndTags';

type TasksContextValue = ReturnType<typeof useTasksData>;

const TasksContext = createContext<TasksContextValue | null>(null);

/**
 * Fetches tasks once per signed-in session and shares them app-wide.
 * Mounted once in the root layout (see AppDataProvider) — TaskManager,
 * the calendar, and anywhere else that needs tasks all read from here
 * instead of each independently re-fetching on mount.
 */
export const TasksProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { dataUserId } = useAuth();
  const value = useTasksData(!!dataUserId);
  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>;
};

export function useTasksContext(): TasksContextValue {
  const ctx = useContext(TasksContext);
  if (!ctx) throw new Error('useTasksContext must be used inside <TasksProvider>');
  return ctx;
}
