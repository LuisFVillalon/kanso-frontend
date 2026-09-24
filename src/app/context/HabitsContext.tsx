'use client';

import React, { createContext, useContext } from 'react';
import { useAuth } from './AuthContext';
import { useHabits as useHabitsData } from '@/app/hooks/useHabits';

type HabitsContextValue = ReturnType<typeof useHabitsData>;

const HabitsContext = createContext<HabitsContextValue | null>(null);

/**
 * Fetches habits once per signed-in session and shares them app-wide. See
 * TasksContext.tsx for why this is a context rather than a plain hook.
 */
export const HabitsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { dataUserId } = useAuth();
  const value = useHabitsData(!!dataUserId);
  return <HabitsContext.Provider value={value}>{children}</HabitsContext.Provider>;
};

export function useHabitsContext(): HabitsContextValue {
  const ctx = useContext(HabitsContext);
  if (!ctx) throw new Error('useHabitsContext must be used inside <HabitsProvider>');
  return ctx;
}
