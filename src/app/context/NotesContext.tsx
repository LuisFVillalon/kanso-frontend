'use client';

import React, { createContext, useContext } from 'react';
import { useAuth } from './AuthContext';
import { useNotes as useNotesData } from '@/app/hooks/useNotes';

type NotesContextValue = ReturnType<typeof useNotesData>;

const NotesContext = createContext<NotesContextValue | null>(null);

/**
 * Fetches notes once per signed-in session and shares them app-wide. See
 * TasksContext.tsx for why this is a context rather than a plain hook.
 */
export const NotesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { dataUserId } = useAuth();
  const value = useNotesData(!!dataUserId);
  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
};

export function useNotesContext(): NotesContextValue {
  const ctx = useContext(NotesContext);
  if (!ctx) throw new Error('useNotesContext must be used inside <NotesProvider>');
  return ctx;
}
