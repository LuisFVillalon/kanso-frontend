'use client';

// Accent color swatch grid for Settings → Appearance — the app's
// curated palette (theme.ts) rendered through the shared ColorSwatchPicker
// UI, with the kanso blue default called out via a subtle ring.

import React from 'react';
import ColorSwatchPicker from '@/app/components/common/ColorSwatchPicker';
import { THEME_ACCENT_COLORS, DEFAULT_ACCENT } from '@/app/lib/theme';
import { ColorOption } from '@/app/lib/colorOptions';

interface ThemeAccentPickerProps {
  value: string;
  onChange: (hex: string) => void;
  colors?: ColorOption[];
}

export default function ThemeAccentPicker({ value, onChange, colors = THEME_ACCENT_COLORS }: ThemeAccentPickerProps) {
  return <ColorSwatchPicker colors={colors} value={value} onChange={onChange} columns={7} defaultValue={DEFAULT_ACCENT} />;
}
