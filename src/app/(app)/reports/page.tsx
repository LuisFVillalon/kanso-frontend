'use client';

import React from 'react';
import ProtectedPage from '@/app/components/auth/ProtectedPage';
import CalendarReportView from '@/app/components/calendar/report/CalendarReportView';

export default function ReportsPage() {
  return (
    <ProtectedPage>
      <div className="min-h-screen flex flex-col">
        <div className="max-w-7xl mx-auto w-full px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-5">
          <h1 className="text-2xl sm:text-3xl text-text-primary">Reports</h1>
        </div>
        <div className="flex-1 max-w-7xl mx-auto w-full px-3 sm:px-4 md:px-6 lg:px-8 pb-6 sm:pb-10">
          <CalendarReportView />
        </div>
      </div>
    </ProtectedPage>
  );
}
