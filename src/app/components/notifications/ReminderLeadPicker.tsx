'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import {
  FINAL_WARNING_MINUTES,
  REMINDER_MINUTES_MAX,
  REMINDER_PRESETS,
  formatLeadTime,
} from '@/app/utils/notifications';

type Unit = 'minutes' | 'hours' | 'days';
const UNIT_MINUTES: Record<Unit, number> = { minutes: 1, hours: 60, days: 1440 };

const CUSTOM_ERROR = 'Pick a whole amount from 1 minute up to 7 days.';

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
  /** Labels the select, e.g. the id of a visible <label>. */
  'aria-labelledby'?: string;
}

/**
 * One-click lead times (15 min to 1 day) plus a custom amount, bounded by
 * the backend's 1 minute to 1 week. An invalid custom amount is never sent
 * up: `onChange` only fires with a lead the API accepts, and the amount
 * input stays invalid so the enclosing form won't submit.
 */
const ReminderLeadPicker: React.FC<ReminderLeadPickerProps> = ({
  value, onChange, defaultMinutes, disabled, 'aria-labelledby': labelledBy,
}) => {
  const allowDefault = defaultMinutes !== undefined;
  const [custom, setCustom] = useState(() => value !== null && !REMINDER_PRESETS.includes(value));
  const [amount, setAmount] = useState(() => (value !== null ? splitLead(value).amount : ''));
  const [unit, setUnit] = useState<Unit>(() => (value !== null ? splitLead(value).unit : 'hours'));
  const errorId = useId();
  const amountRef = useRef<HTMLInputElement>(null);

  const selected = custom
    ? CUSTOM_OPTION
    : value === null
      ? (allowDefault ? DEFAULT_OPTION : CUSTOM_OPTION)
      : String(value);

  const parsedAmount = Number(amount);
  const customMinutes = Number.isInteger(parsedAmount) ? parsedAmount * UNIT_MINUTES[unit] : NaN;
  const customValid = customMinutes >= 1 && customMinutes <= REMINDER_MINUTES_MAX;

  useEffect(() => {
    amountRef.current?.setCustomValidity(customValid ? '' : CUSTOM_ERROR);
  }, [customValid, custom, disabled]);

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
    if (minutes >= 1 && minutes <= REMINDER_MINUTES_MAX) onChange(minutes);
  };

  const effective = custom ? (customValid ? customMinutes : null) : (value ?? defaultMinutes ?? null);

  return (
    <div className="space-y-2">
      <select
        value={selected}
        onChange={e => pickOption(e.target.value)}
        disabled={disabled}
        aria-labelledby={labelledBy}
        className="input-field disabled:opacity-60"
      >
        {allowDefault && <option value={DEFAULT_OPTION}>Default ({formatLeadTime(defaultMinutes)} before)</option>}
        {REMINDER_PRESETS.map(m => (
          <option key={m} value={m}>{formatLeadTime(m)} before</option>
        ))}
        <option value={CUSTOM_OPTION}>Custom…</option>
      </select>

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
            className="input-field w-24"
          />
          <select
            value={unit}
            onChange={e => editCustom(amount, e.target.value as Unit)}
            aria-label="Custom reminder unit"
            className="input-field flex-1"
          >
            <option value="minutes">minutes before</option>
            <option value="hours">hours before</option>
            <option value="days">days before</option>
          </select>
        </div>
      )}

      {custom && !disabled && !customValid && (
        <p id={errorId} className="text-xs" style={{ color: 'var(--tm-danger)' }}>
          {CUSTOM_ERROR}
        </p>
      )}
      {!disabled && effective !== null && effective <= FINAL_WARNING_MINUTES && (
        <p className="text-xs text-text-muted">
          Leads of {FINAL_WARNING_MINUTES} minutes or less send just the {FINAL_WARNING_MINUTES}-minute final warning.
        </p>
      )}
    </div>
  );
};

export default ReminderLeadPicker;
