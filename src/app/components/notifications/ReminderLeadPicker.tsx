'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import {
  REMINDER_MINUTES_MAX,
  REMINDER_PRESETS,
  formatLeadTime,
} from '@/app/utils/notifications';

type Unit = 'minutes' | 'hours' | 'days';
const UNIT_MINUTES: Record<Unit, number> = { minutes: 1, hours: 60, days: 1440 };

const DEFAULT_OPTION = 'default';
const CUSTOM_OPTION = 'custom';

/** The largest unit that divides `minutes` evenly, for showing a custom lead. */
function splitLead(minutes: number): { amount: string; unit: Unit } {
  if (minutes % 1440 === 0) return { amount: String(minutes / 1440), unit: 'days' };
  if (minutes % 60 === 0) return { amount: String(minutes / 60), unit: 'hours' };
  return { amount: String(minutes), unit: 'minutes' };
}

interface ReminderLeadPickerProps {
  /** Minutes before the due time; null means "use my default" (only with `defaultMinutes`). */
  value: number | null;
  onChange: (minutes: number | null) => void;
  /** Offers a "Default" choice showing this lead; leave out where there is no default to fall back on. */
  defaultMinutes?: number;
  disabled?: boolean;
  /** One-click leads; the task reminder ones unless given. */
  presets?: number[];
  /** The largest lead the API accepts; one week unless given. */
  maxMinutes?: number;
  /** Labels the select (or the chips), e.g. the id of a visible <label>. */
  'aria-labelledby'?: string;
  /** A dropdown (the default), or a row of one-tap chips. */
  variant?: 'select' | 'chips';
}

/**
 * One-click lead times (15 min to 1 day by default) plus a custom amount,
 * bounded by the backend's 1 minute to `maxMinutes` (1 week by default). An invalid custom amount is never sent
 * up: `onChange` only fires with a lead the API accepts, and the amount
 * input stays invalid so the enclosing form won't submit. Shown as a
 * dropdown, or (`variant="chips"`) as a row of chips.
 */
const ReminderLeadPicker: React.FC<ReminderLeadPickerProps> = ({
  value, onChange, defaultMinutes, disabled,
  presets = REMINDER_PRESETS, maxMinutes = REMINDER_MINUTES_MAX, 'aria-labelledby': labelledBy,
  variant = 'select',
}) => {
  const allowDefault = defaultMinutes !== undefined;
  const customError = `Pick a whole amount from 1 minute up to ${formatLeadTime(maxMinutes)}.`;
  const [custom, setCustom] = useState(() => value !== null && !presets.includes(value));
  const [amount, setAmount] = useState(() => (value !== null ? splitLead(value).amount : ''));
  const [unit, setUnit] = useState<Unit>(() => (value !== null ? splitLead(value).unit : 'hours'));
  const errorId = useId();
  const chips = variant === 'chips';
  // Next to the chips the custom amount stays as small as they are.
  const compact = chips ? 'text-sm py-1.5' : '';
  const amountRef = useRef<HTMLInputElement>(null);

  const selected = custom
    ? CUSTOM_OPTION
    : value === null
      ? (allowDefault ? DEFAULT_OPTION : CUSTOM_OPTION)
      : String(value);

  const parsedAmount = Number(amount);
  const customMinutes = Number.isInteger(parsedAmount) ? parsedAmount * UNIT_MINUTES[unit] : NaN;
  const customValid = customMinutes >= 1 && customMinutes <= maxMinutes;

  useEffect(() => {
    amountRef.current?.setCustomValidity(customValid ? '' : customError);
  }, [customValid, customError, custom, disabled]);

  const pickOption = (option: string) => {
    if (option === CUSTOM_OPTION) {
      const start = splitLead(value ?? defaultMinutes ?? 120);
      setCustom(true);
      setAmount(start.amount);
      setUnit(start.unit);
      return;
    }
    setCustom(false);
    onChange(option === DEFAULT_OPTION ? null : Number(option));
  };

  const editCustom = (nextAmount: string, nextUnit: Unit) => {
    setAmount(nextAmount);
    setUnit(nextUnit);
    const n = Number(nextAmount);
    const minutes = Number.isInteger(n) ? n * UNIT_MINUTES[nextUnit] : NaN;
    if (minutes >= 1 && minutes <= maxMinutes) onChange(minutes);
  };

  return (
    <div className="space-y-2">
      {chips ? (
        <div role="radiogroup" aria-labelledby={labelledBy} className="flex flex-wrap gap-1.5">
          {[
            ...(allowDefault ? [{ option: DEFAULT_OPTION, label: `Default (${formatLeadTime(defaultMinutes)})` }] : []),
            ...presets.map(m => ({ option: String(m), label: formatLeadTime(m) })),
            { option: CUSTOM_OPTION, label: 'Custom' },
          ].map(({ option, label }) => {
            const checked = selected === option;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={checked}
                disabled={disabled}
                onClick={() => pickOption(option)}
                className="px-3 py-1 rounded-full border text-xs font-medium transition-colors disabled:opacity-60"
                style={checked
                  ? { backgroundColor: 'var(--tm-accent-subtle)', borderColor: 'var(--tm-accent)', color: 'var(--tm-accent)' }
                  : { borderColor: 'var(--tm-border)', color: 'var(--tm-text-secondary)' }}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : (
        <select
          value={selected}
          onChange={e => pickOption(e.target.value)}
          disabled={disabled}
          aria-labelledby={labelledBy}
          className="input-field disabled:opacity-60"
        >
          {allowDefault && <option value={DEFAULT_OPTION}>Default ({formatLeadTime(defaultMinutes)} before)</option>}
          {presets.map(m => (
            <option key={m} value={m}>{formatLeadTime(m)} before</option>
          ))}
          <option value={CUSTOM_OPTION}>Custom…</option>
        </select>
      )}

      {custom && !disabled && (
        <div className="flex gap-2">
          <input
            ref={amountRef}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={amount}
            onChange={e => editCustom(e.target.value, unit)}
            aria-label="Custom reminder amount"
            aria-invalid={!customValid}
            aria-describedby={customValid ? undefined : errorId}
            className={`input-field w-24 ${compact}`}
          />
          <select
            value={unit}
            onChange={e => editCustom(amount, e.target.value as Unit)}
            aria-label="Custom reminder unit"
            className={`input-field ${chips ? 'w-auto' : 'flex-1'} ${compact}`}
          >
            <option value="minutes">minutes before</option>
            <option value="hours">hours before</option>
            {maxMinutes >= UNIT_MINUTES.days && <option value="days">days before</option>}
          </select>
        </div>
      )}

      {custom && !disabled && !customValid && (
        <p id={errorId} className="text-xs" style={{ color: 'var(--tm-danger)' }}>
          {customError}
        </p>
      )}
    </div>
  );
};

export default ReminderLeadPicker;
