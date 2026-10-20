'use client';

import React from 'react';
import ProtectedPage from '@/app/components/auth/ProtectedPage';
import TrashView from '@/app/components/trash/TrashView';

export default function TrashPage() {
  return (
    <ProtectedPage>
      <TrashView />
    </ProtectedPage>
  );
}
