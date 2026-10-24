'use client';

import React, { useMemo, useState } from 'react';
import { useTagsContext } from '@/app/context/TagsContext';
import { useWeekActivity } from '@/app/hooks/useWeekActivity';
import { useEventActions } from '@/app/hooks/useEventActions';
import { browserTimeZone, useWorkWindows } from '@/app/hooks/useWorkWindows';
import EventFormModal from '@/app/components/event/EventFormModal';
import { blankEventForm, eventFormToCreate, type EventFormValues } from '@/app/utils/events';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import { minutesToTimeStr, startOfWeek } from '@/app/utils/weekLayout';

interface NewEventModalProps {
  onClose: () => void;
  /** Called once the server has the new event, so calendars can refetch. */
  onCreated: () => void;
}

/**
 * The New menu's event form: today, from the next full hour, checked for
 * overlaps against this week's events. Opens from any page.
 */
const NewEventModal: React.FC<NewEventModalProps> = ({ onClose, onCreated }) => {
  const [now] = useState(() => new Date());
  const { tags } = useTagsContext();
  const { restDays, windowOn, term } = useWorkWindows(now);
  const { activity } = useWeekActivity(useMemo(() => startOfWeek(now), [now]));
  const eventActions = useEventActions(onCreated);

  const initial = useMemo(() => {
    const start = Math.min(23 * 60, (now.getHours() + 1) * 60);
    return blankEventForm({
      date: toLocalDateStr(now),
      startTime: minutesToTimeStr(start),
      endTime: minutesToTimeStr(Math.min(24 * 60 - 1, start + 60)),
      termEnd: term?.endDate ?? null,
    });
  }, [now, term?.endDate]);

  const handleSubmit = (values: EventFormValues) =>
    eventActions.create(eventFormToCreate(values, browserTimeZone(), term?.endDate ?? null));

  return (
    <EventFormModal
      mode="new"
      initial={initial}
      tags={tags}
      context={{ restDays, windowOn, others: activity?.events ?? [], term }}
      onSubmit={handleSubmit}
      onClose={onClose}
    />
  );
};

export default NewEventModal;
