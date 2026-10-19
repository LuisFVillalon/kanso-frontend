import React, { useState } from 'react';
import { DURATION_PRESETS, findDurationPreset, parseCustomHours } from '@/app/utils/duration';

interface DurationPickerProps {
  value: number | null | undefined;
  onChange: (hours: number | null) => void;
}

const formatHours = (hours: number) => String(Math.round(hours * 100) / 100);

// Segmented choice of preset estimates plus a free-form "Custom" hours input.
// Clicking the selected preset again clears the estimate.
const DurationPicker: React.FC<DurationPickerProps> = ({ value, onChange }) => {
  const hasValue = value != null && value > 0;
  const initialCustom = hasValue && !findDurationPreset(value);
  const [customOpen, setCustomOpen] = useState(initialCustom);
  const [customText, setCustomText] = useState(initialCustom ? formatHours(value!) : '');
  const [error, setError] = useState<string | null>(null);

  const selectedPreset = customOpen ? null : findDurationPreset(value);

  const choosePreset = (hours: number, selected: boolean) => {
    setCustomOpen(false);
    setError(null);
    onChange(selected ? null : hours);
  };

  const toggleCustom = () => {
    if (customOpen) {
      setCustomOpen(false);
      setError(null);
      onChange(null);
      return;
    }
    setCustomOpen(true);
    const text = hasValue ? formatHours(value!) : '';
    setCustomText(text);
    setError(null);
    onChange(hasValue ? value! : null);
  };

  const changeCustom = (text: string) => {
    setCustomText(text);
    const parsed = parseCustomHours(text);
    if (parsed.ok) {
      setError(null);
      onChange(parsed.hours);
    } else {
      setError(parsed.error);
      onChange(null);
    }
  };

  const chipStyle = (selected: boolean): React.CSSProperties => ({
    backgroundColor: selected ? 'var(--tm-accent)' : 'var(--tm-surface)',
    color: selected ? 'var(--tm-accent-text)' : 'var(--tm-text-primary)',
    border: `1px solid ${selected ? 'var(--tm-accent)' : 'var(--tm-border)'}`,
  });
  const chipClass =
    'px-3 py-1.5 rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tm-accent)] focus-visible:ring-offset-1';

  return (
    <div>
      <div role="group" aria-labelledby="estimated-duration-label" className="flex flex-wrap gap-2">
        {DURATION_PRESETS.map(p => {
          const selected = selectedPreset === p;
          return (
            <button
              key={p.label}
              type="button"
              aria-pressed={selected}
              onClick={() => choosePreset(p.hours, selected)}
              className={chipClass}
              style={chipStyle(selected)}
            >
              {p.label}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={customOpen}
          aria-expanded={customOpen}
          aria-controls="estimated-duration-custom"
          onClick={toggleCustom}
          className={chipClass}
          style={chipStyle(customOpen)}
        >
          Custom
        </button>
      </div>
      {customOpen && (
        <div id="estimated-duration-custom" className="mt-2">
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              autoFocus
              aria-label="Custom duration in hours"
              aria-invalid={error != null}
              aria-describedby="estimated-duration-hint"
              value={customText}
              onChange={e => changeCustom(e.target.value)}
              placeholder="e.g. 1.5"
              className="input-field pr-14"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-muted pointer-events-none">
              hours
            </span>
          </div>
          <p
            id="estimated-duration-hint"
            className="text-xs mt-1"
            style={{ color: error ? 'var(--tm-danger)' : 'var(--tm-text-muted)' }}
          >
            {error ?? 'Hours, decimals allowed. Leave blank for no estimate.'}
          </p>
        </div>
      )}
    </div>
  );
};

export default DurationPicker;
