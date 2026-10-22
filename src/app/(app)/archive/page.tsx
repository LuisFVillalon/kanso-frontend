'use client';

import React from 'react';
import ProtectedPage from '@/app/components/auth/ProtectedPage';
import ArchiveView from '@/app/components/archive/ArchiveView';

export default function ArchivePage() {
  return (
    <ProtectedPage>
      <ArchiveView />
    </ProtectedPage>
  );
}
