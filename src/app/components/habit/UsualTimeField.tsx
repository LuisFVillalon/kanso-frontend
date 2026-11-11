'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSlotPlanner, minutesOf, planMinutes } from '@/app/hooks/useSlotPlanner';
import type { Habit } from '@/app/types/habit';
import type { Task } from '@/app/types/task';
import { occurrenceSpanOn, takesTime } from '@/app/utils/eventOccurrences';
import { habitTime } from '@/app/utils/slotSuggest';
import { clock, dayShort, hhmm } from '@/app/utils/slotLabels';

interface UsualTimeFieldProps {
  /** "HH:MM", null for no set time, undefined while untouched (a new habit then takes the first suggestion). */
  value: string | null | undefined;
  onChange: (time: string | null) => void;
  /** The daily time goal in hours; the time held is 30 minutes without one. */
  goalHours: number | null | undefined;
  tasks: Task[];
  habits: Habit[];
}

const chipClass = 'px-3 py-1.5 rounded-full text-sm font-medium border transition-colors';
const chipStyle = (on: boolean): React.CSSProperties => (on
  ? { backgroundColor: 'var(--tm-accent)', borderColor: 'var(--tm-accent)', color: 'var(--tm-accent-text)' }
  : { backgroundColor: 'var(--tm-surface)', borderColor: 'var(--tm-border)', color: 'var(--tm-text-primary)' });

/**
 * "Usual time": up to 3 times of day that are free on the most of the next 5
 * work days (2 hours apart), "Other…" for any time, and "No set time". A
 * usual time is held for the habit each day; when something takes it, the
 * Daily brief offers a new time for that day.
 */
const UsualTimeField: React.FC<UsualTimeFieldProps> = ({ value, onChange, goalHours, tasks, habits }) => {
  const id = useId();
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const planner = useSlotPlanner({ enabled: true, tasks, habits });
  const len = planMinutes(goalHours);
  const options = useMemo(() => (planner ? habitTime(planner.state, len) : null), [planner, len]);
  const [other, setOther] = useState(false);
  const picks = useMemo(() => options?.picks ?? [], [options]);
  const valueMin = minutesOf(value ?? null);
  const pickedOption = picks.find(p => p.start === valueMin);
  const showOther = other || (valueMin !== null && !pickedOption && options !== null);

  // A new habit starts on the best time once the suggestions are in.
  const chose = useRef(value !== undefined);
  useEffect(() => {
    if (chose.current || !picks[0]) return;
    chose.current = true;
    onChange(hhmm(picks[0].start));
  }, [picks, onChange]);

  const set = (time: string | null) => {
    chose.current = true;
    onChange(time);
  };

  const hintFor = pickedOption ?? (valueMin === null && value === undefined ? picks[0] : undefined);
  let hint = 'It holds this time each day; if something takes it, you’ll get a new time that day.';
  if (hintFor && planner) {
    const firstClash = hintFor.clash[0];
    const clashEvent = firstClash && planner.events.find(o => {
      const span = takesTime(o) ? occurrenceSpanOn(o, firstClash) : null;
      return span && span.start < hintFor.end && hintFor.start < span.end;
    });
    const not = hintFor.clash.length
      ? ` (not ${hintFor.clash.map(d => dayShort(d, planner.today)).join(', ')}${clashEvent ? `: ${clashEvent.title}` : ''})`
      : '';
    hint = `${clock(hintFor.start)} is free on ${hintFor.free} of your next ${hintFor.of} work days${not}. ${hint}`;
  } else if (value === null) {
    hint = 'No time is held for it; the Daily brief suggests one each day.';
  }

  return (
    <div>
      <span id={labelId} className="block text-sm font-medium text-text-secondary mb-1">
        Usual time <span className="font-normal text-text-muted">(optional)</span>
      </span>
      <div role="group" aria-labelledby={labelId} aria-describedby={hintId} className="flex flex-wrap gap-2">
        {picks.map(p => {
          const on = !showOther && valueMin === p.start;
          return (
            <button key={p.start} type="button" aria-pressed={on} onClick={() => { setOther(false); set(hhmm(p.start)); }}
              className={chipClass} style={chipStyle(on)}>
              {clock(p.start)}
            </button>
          );
        })}
        <button type="button" aria-pressed={showOther} onClick={() => setOther(true)} className={chipClass} style={chipStyle(showOther)}>
          Other…
        </button>
        <button type="button" aria-pressed={!showOther && value === null} onClick={() => { setOther(false); set(null); }}
          className={chipClass} style={chipStyle(!showOther && value === null)}>
          No set time
        </button>
      </div>
      {showOther && (
        <input
          type="time"
          aria-label="Usual time"
          value={value ?? ''}
          onChange={e => set(e.target.value || null)}
          className="input-field mt-2 max-w-[10rem]"
        />
      )}
      <p id={hintId} className="mt-1 text-xs text-text-muted">{hint}</p>
    </div>
  );
};

export default UsualTimeField;
