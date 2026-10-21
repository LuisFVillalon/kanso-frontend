'use client';

import React from 'react';
import { X, PartyPopper } from 'lucide-react';
import type { DayData } from '@/app/hooks/useYearCalendarData';
import type { Habit } from '@/app/types/habit';
import { getHolidays } from '@/app/lib/monthPersonality';
import DaySummary from './DaySummary';
import Modal from '@/app/components/common/Modal';

interface DayDetailModalProps {
  date: Date;
  data: DayData | undefined;
  totalHabits: number;
  allHabits: Habit[];
  dayData: Map<string, DayData>;
  onClose: () => void;
}

const DayDetailModal: React.FC<DayDetailModalProps> = ({ date, data, totalHabits, allHabits, dayData, onClose }) => {
  const holidayName = getHolidays(date.getFullYear())[date.getMonth()]?.[date.getDate()];

  return (
    <Modal onClose={onClose} layer="elevated" panelClassName="modal-panel w-full max-w-3xl max-h-[90vh] overflow-y-auto scrollbar-custom">
      <div
        className="sticky top-0 px-5 py-4 border-b border-border-subtle flex justify-between items-center z-10"
        style={{ backgroundColor: 'var(--tm-surface)' }}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-base sm:text-lg text-text-primary">
            {date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </h2>
          {holidayName && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
              style={{ backgroundColor: 'var(--tm-accent-subtle)', color: 'var(--tm-accent)' }}
            >
              <PartyPopper className="w-3.5 h-3.5" />
              {holidayName}
            </span>
          )}
        </div>
        <button onClick={onClose} className="btn btn-ghost" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-5">
        <DaySummary date={date} data={data} totalHabits={totalHabits} allHabits={allHabits} dayData={dayData} />
      </div>
    </Modal>
  );
};

export default DayDetailModal;
