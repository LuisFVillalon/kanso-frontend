'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Eraser, Trash2 } from 'lucide-react';
import ColorSwatchPicker from '@/app/components/common/ColorSwatchPicker';
import { THEME_ACCENT_COLORS, DEFAULT_ACCENT } from '@/app/lib/theme';

interface DoodleToolbarProps {
  color: string;
  onColorChange: (color: string) => void;
  isErasing: boolean;
  onToggleErase: () => void;
  onClear: () => void;
}

// Sits to the left of ModeSwitcher in the header while doodle mode is active.
// Pen colors come from the app's shared curated palette (theme.ts) — the
// same one used for the theme accent color and tag colors — so picking a
// pen color feels consistent with the rest of the app.
const DoodleToolbar: React.FC<DoodleToolbarProps> = ({ color, onColorChange, isErasing, onToggleErase, onClear }) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [pickerOpen]);

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border-subtle bg-surface-overlay px-2.5 py-2 shadow-sm">
      <div ref={pickerRef} className="relative">
        <button
          type="button"
          title="Pen color"
          onClick={() => setPickerOpen(v => !v)}
          className={`h-6 w-6 rounded-full border-2 transition-all ${
            !isErasing ? 'border-text-primary scale-110' : 'border-transparent'
          }`}
          style={{ backgroundColor: color }}
        />

        {pickerOpen && (
          <div
            className="absolute z-50 top-full mt-2 left-0 card p-3 w-64"
            style={{ boxShadow: 'var(--tm-shadow-lg)' }}
          >
            <ColorSwatchPicker
              colors={THEME_ACCENT_COLORS}
              value={color}
              onChange={hex => { onColorChange(hex); setPickerOpen(false); }}
              defaultValue={DEFAULT_ACCENT}
            />
          </div>
        )}
      </div>

      <div className="mx-1 h-5 w-px bg-border" />
      <button
        type="button"
        title="Eraser"
        onClick={onToggleErase}
        className={`p-1.5 rounded-lg transition-colors ${
          isErasing ? 'bg-accent text-[var(--tm-accent-text)]' : 'text-text-secondary hover:bg-surface-raised'
        }`}
      >
        <Eraser className="w-4 h-4" />
      </button>
      <button
        type="button"
        title="Clear all"
        onClick={onClear}
        className="p-1.5 rounded-lg text-text-secondary hover:bg-surface-raised transition-colors"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
};

export default DoodleToolbar;
