'use client';

import React from 'react';
import ProtectedPage from '@/app/components/auth/ProtectedPage';
import NotesView from '@/app/components/notes/NotesView';

export default function NotesPage() {
  return (
    <ProtectedPage>
      <NotesView />
    </ProtectedPage>
  );
}
