'use client';

import React from 'react';
import type { ModalLayer } from '@/app/components/common/Modal';
import DayMoodCheckin from '@/app/components/mood/DayMoodCheckin';
import type { DayData } from '@/app/hooks/useYearCalendarData';
import { toLocalDateStr } from '@/app/utils/dateUtils';

interface DayMoodChipProps {
  date: Date;
  data: DayData | undefined;
  totalHabits: number;
  modalLayer?: ModalLayer;
}

/**
 * The calendar day panel's mood chip: the day's mood with Edit, or Log for a
 * day without one. Nothing for days still to come.
 */
const DayMoodChip: React.FC<DayMoodChipProps> = ({ date, data, totalHabits, modalLayer }) => {
  const dateStr = toLocalDateStr(date);
  if (dateStr > toLocalDateStr(new Date())) return null;
  return (
    <DayMoodCheckin
      date={dateStr}
      variant="chip"
      summary={{
        tasksDone: data?.tasksCompleted.length ?? 0,
        noteSeconds: null,
        habitsDone: data?.habitsCompleted.length ?? 0,
        habitsTotal: totalHabits,
      }}
      modalLayer={modalLayer}
    />
  );
};

export default DayMoodChip;
