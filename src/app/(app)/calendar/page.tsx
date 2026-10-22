'use client';

import React from 'react';
import ProtectedPage from '@/app/components/auth/ProtectedPage';
import CalendarView from '@/app/components/calendar/CalendarView';

export default function CalendarPage() {
  return (
    <ProtectedPage>
      <CalendarView />
    </ProtectedPage>
  );
}
