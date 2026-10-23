'use client';

import React from 'react';
import ProtectedPage from '@/app/components/auth/ProtectedPage';
import CalendarReportView from '@/app/components/calendar/report/CalendarReportView';

export default function ReportsPage() {
  return (
    <ProtectedPage>
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 max-w-7xl mx-auto w-full px-3 sm:px-4 md:px-6 lg:px-8 pt-4 sm:pt-5 pb-6">
          <CalendarReportView />
        </div>
      </div>
    </ProtectedPage>
  );
}
