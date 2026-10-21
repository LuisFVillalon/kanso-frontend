'use client';

import React, { Suspense } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import PageSpinner from '@/app/components/common/PageSpinner';
import TaskManager from '@/app/TaskManager';

/** Shows a spinner while auth loads, then renders the dashboard (TaskManager). */
export default function Page() {
  const { loading } = useAuth();

  if (loading) return <PageSpinner />;

  return (
    <Suspense fallback={<PageSpinner />}>
      <TaskManager />
    </Suspense>
  );
}
