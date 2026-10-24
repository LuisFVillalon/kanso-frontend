'use client';

import React from 'react';
import { X } from 'lucide-react';
import type { DayData } from '@/app/hooks/useYearCalendarData';
import type { Habit } from '@/app/types/habit';
import DaySummary from './DaySummary';
import DayHeading from './DayHeading';
import Modal from '@/app/components/common/Modal';

interface DayDetailModalProps {
  date: Date;
  data: DayData | undefined;
  totalHabits: number;
  allHabits: Habit[];
  onClose: () => void;
  /** Shows the day's check-in, with a chip to log or edit it. */
  showMood?: boolean;
}

const DayDetailModal: React.FC<DayDetailModalProps> = ({ date, data, totalHabits, allHabits, onClose, showMood = false }) => (
  <Modal onClose={onClose} layer="elevated" panelClassName="modal-panel w-full max-w-3xl max-h-[90vh] overflow-y-auto scrollbar-custom">
    <div
      className="sticky top-0 px-5 py-4 border-b border-border-subtle flex justify-between items-start gap-3 z-10"
      style={{ backgroundColor: 'var(--tm-surface)' }}
    >
      <DayHeading date={date} />
      <button onClick={onClose} className="btn btn-ghost flex-shrink-0" aria-label="Close">
        <X className="w-5 h-5" />
      </button>
    </div>

    <div className="p-5">
      <DaySummary date={date} data={data} totalHabits={totalHabits} allHabits={allHabits} showMood={showMood} moodModalLayer="top" />
    </div>
  </Modal>
);

export default DayDetailModal;
