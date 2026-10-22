import React, { useId } from 'react';
import { formatHabitGoal } from '@/app/utils/habitLabels';

interface HabitTimeGoalFieldProps {
  /** Hours per day, as stored in the habit's `estimated_time`. */
  value: number | null | undefined;
  onChange: (hours: number | null) => void;
  labelClassName?: string;
  inputClassName?: string;
}

/** Number input for a habit's daily time goal, with its unit and a readable preview. */
const HabitTimeGoalField: React.FC<HabitTimeGoalFieldProps> = ({
  value,
  onChange,
  labelClassName = 'block text-sm font-medium text-text-secondary mb-1',
  inputClassName = 'input-field',
}) => {
  const id = useId();
  const hintId = `${id}-hint`;
  const goal = formatHabitGoal(value);

  return (
    <div>
      <label htmlFor={id} className={labelClassName}>Daily time goal (optional)</label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          min={0}
          step={0.5}
          value={value ?? ''}
          onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
          placeholder="e.g. 0.5"
          aria-describedby={hintId}
          className={`${inputClassName} flex-1 min-w-0`}
        />
        <span className="text-sm text-text-muted flex-shrink-0">hours per day</span>
      </div>
      <p id={hintId} className="mt-1 text-xs text-text-muted">
        {goal ? `${goal}. ` : 'How long you plan to spend on this habit each day. '}
        Goals go in half-hour steps (0.5 = 30 minutes).
      </p>
    </div>
  );
};

export default HabitTimeGoalField;
