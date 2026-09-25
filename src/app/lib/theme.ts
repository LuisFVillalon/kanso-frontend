// Lets the user pick the app's accent color from a curated palette, while
// keeping the Notion-style warm paper look (Notion Blue default, everything
// else in globals.css untouched). The chosen color only overrides
// --tm-accent and the values derived from it; surfaces, borders, and ink
// stay fixed.

import { ColorOption } from './colorOptions';

const THEME_ACCENT_STORAGE_KEY = 'tm_theme_accent';

// Notion Blue, defined in globals.css — offered as the "reset" option.
export const DEFAULT_ACCENT = '#006BCB';

// The app's curated color palette — used both for the theme accent color
// (Settings → Appearance) and for tag-category colors (Create/Edit Tag),
// so picking a color feels the same everywhere. Deliberately a fixed list
// rather than a free-form color picker — new shades are added here, not
// typed in by users. This same shape is what a future `GET /theme-colors`
// endpoint would return, so the picker UI never has to change to accept a
// larger or server-managed palette — see ColorSwatchPicker.
export const THEME_ACCENT_COLORS: ColorOption[] = [
  { id: 'default',  label: 'Notion Blue (Default)', value: DEFAULT_ACCENT },
  { id: 'red',      label: 'Red',      value: '#DC2626' },
  { id: 'rose',     label: 'Rose',     value: '#E11D48' },
  { id: 'orange',   label: 'Orange',   value: '#EA580C' },
  { id: 'amber',    label: 'Amber',    value: '#F59E0B' },
  { id: 'yellow',   label: 'Yellow',   value: '#CA8A04' },
  { id: 'lime',     label: 'Lime',     value: '#65A30D' },
  { id: 'green',    label: 'Green',    value: '#16A34A' },
  { id: 'emerald',  label: 'Emerald',  value: '#10B981' },
  { id: 'teal',     label: 'Teal',     value: '#0D9488' },
  { id: 'cyan',     label: 'Cyan',     value: '#06B6D4' },
  { id: 'sky',      label: 'Sky',      value: '#0EA5E9' },
  { id: 'blue',     label: 'Blue',     value: '#2563EB' },
  { id: 'indigo',   label: 'Indigo',   value: '#4F46E5' },
  { id: 'violet',   label: 'Violet',   value: '#7C3AED' },
  { id: 'purple',   label: 'Purple',   value: '#9333EA' },
  { id: 'fuchsia',  label: 'Fuchsia',  value: '#C026D4' },
  { id: 'pink',     label: 'Pink',     value: '#DB2777' },
  { id: 'slate',    label: 'Slate',    value: '#475569' },
  { id: 'charcoal', label: 'Charcoal', value: '#262626' },
  { id: 'black',    label: 'Black',    value: '#000000' },
];

// WCAG relative luminance, used to pick readable text (ink vs. white)
// on top of whatever accent color is chosen.
export function relativeLuminance(hex: string): number {
  const channels = hex.replace('#', '').match(/.{2}/g)?.map(v => parseInt(v, 16) / 255) ?? [0, 0, 0];
  const [r, g, b] = channels.map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function applyThemeColor(hex: string): void {
  const root = document.documentElement.style;
  root.setProperty('--tm-accent', hex);
  // A gentle darkening on hover — matches the default #006BCB → #005DB0 shift.
  root.setProperty('--tm-accent-hover', `color-mix(in srgb, ${hex} 88%, black)`);
  // A flat tinted wash for ghost fills, à la the Sky Tint token.
  root.setProperty('--tm-accent-subtle', `color-mix(in srgb, ${hex} 12%, white)`);
  root.setProperty('--tm-accent-text', relativeLuminance(hex) > 0.45 ? '#171717' : '#FFFFFF');
}

export function getStoredThemeColor(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(THEME_ACCENT_STORAGE_KEY);
}

export function setStoredThemeColor(hex: string): void {
  localStorage.setItem(THEME_ACCENT_STORAGE_KEY, hex);
  applyThemeColor(hex);
}

// Reverts to the default blue accent and forgets the override.
export function resetThemeColor(): void {
  localStorage.removeItem(THEME_ACCENT_STORAGE_KEY);
  applyThemeColor(DEFAULT_ACCENT);
}
