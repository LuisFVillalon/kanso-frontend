'use client';

import React, { Suspense } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import PageSpinner from '@/app/components/common/PageSpinner';
import TaskManager from './TaskManager';

/** Signed in: the dashboard. Signed out (or while a demo sandbox is still seeding): the landing page. */
export default function Page() {
  const { user, loading, demoSeeding } = useAuth();

  if (loading) return <PageSpinner />;

  return (
    <Suspense fallback={<PageSpinner />}>
      <TaskManager />
    </Suspense>
  );
}
