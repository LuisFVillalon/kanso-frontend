'use client';

/**
 * Settings → Appearance: light/dark (kept on this device, the same choice
 * as the sidebar toggle), the accent color and the page ruling (both saved
 * to the profile). Accent and ruling preview on the whole app at once.
 */

import React, { useState } from 'react';
import { Check } from 'lucide-react';
import ThemeAccentPicker from '@/app/components/settings/ThemeAccentPicker';
import { PAGE_STYLES } from '@/app/lib/pageStyle';
import { setColorScheme, storedColorScheme, type ColorSchemeChoice } from '@/app/lib/colorScheme';

const SCHEME_OPTIONS: { value: ColorSchemeChoice; label: string }[] = [
  { value: 'system', label: 'Match device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

// Small inline preview of each ruling, scaled down to fit a swatch button.
const pagePreviewStyle = (key: string): React.CSSProperties => {
  const ink = 'color-mix(in srgb, var(--tm-text-primary) 22%, transparent)';
  switch (key) {
    case 'dot':
      return { backgroundImage: `radial-gradient(${ink} 1px, transparent 1.4px)`, backgroundSize: '8px 8px' };
    case 'college':
      return { backgroundImage: `linear-gradient(${ink} 1px, transparent 1px)`, backgroundSize: '100% 7px' };
    case 'wide':
      return { backgroundImage: `linear-gradient(${ink} 1px, transparent 1px)`, backgroundSize: '100% 11px' };
    case 'isometric':
      return {
        backgroundImage: `radial-gradient(${ink} 1px, transparent 1.4px), radial-gradient(${ink} 1px, transparent 1.4px)`,
        backgroundSize: '9px 9px',
        backgroundPosition: '0 0, 4.5px 4.5px',
      };
    case 'blank':
      return {};
    case 'graph':
    default:
      return {
        backgroundImage: `linear-gradient(${ink} 1px, transparent 1px), linear-gradient(90deg, ${ink} 1px, transparent 1px)`,
        backgroundSize: '8px 8px',
      };
  }
};

interface Props {
  themeAccent: string;
  pageStyle: string;
  onAccentChange: (hex: string) => void;
  onPageStyleChange: (key: string) => void;
  /** Called after the light/dark choice changes, which saves on this device at once. */
  onSchemeChange?: () => void;
}

const AppearancePage: React.FC<Props> = ({ themeAccent, pageStyle, onAccentChange, onPageStyleChange, onSchemeChange }) => {
  const [scheme, setScheme] = useState<ColorSchemeChoice>(storedColorScheme);

  const pickScheme = (choice: ColorSchemeChoice) => {
    setScheme(choice);
    setColorScheme(choice);
    onSchemeChange?.();
  };

  return (
    <div className="space-y-6">
      <div>
        <p id="settings-scheme-label" className="block text-xs font-medium text-text-muted mb-1">Theme</p>
        <div
          className="inline-flex items-center gap-1 p-1 rounded-lg bg-surface border border-border"
          role="group"
          aria-labelledby="settings-scheme-label"
        >
          {SCHEME_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => pickScheme(value)}
              aria-pressed={scheme === value}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                scheme === value ? 'bg-surface-raised text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs mt-1" style={{ color: 'var(--tm-text-muted)' }}>
          Kept on this device. Match device follows your system&apos;s light or dark setting.
        </p>
      </div>

      <div>
        <p className="block text-xs font-medium text-text-muted mb-1">Accent color</p>
        <div className="max-w-sm">
          <ThemeAccentPicker value={themeAccent} onChange={onAccentChange} />
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--tm-text-muted)' }}>
          Buttons, links and highlights. Paper and ink stay the same.
        </p>
      </div>

      <div>
        <p id="settings-ruling-label" className="block text-xs font-medium text-text-muted mb-2">Page ruling</p>
        <div className="grid grid-cols-3 gap-3 max-w-md" role="group" aria-labelledby="settings-ruling-label">
          {PAGE_STYLES.map(p => {
            const selected = pageStyle === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => onPageStyleChange(p.key)}
                title={p.description}
                aria-label={p.label}
                aria-pressed={selected}
                className="flex flex-col items-stretch transition-transform hover:scale-105"
              >
                <div
                  className="h-12 w-full flex items-start justify-end p-1 rounded-md"
                  style={{
                    backgroundColor: 'var(--tm-bg)',
                    border: selected ? '2px solid var(--tm-text-primary)' : '1px solid var(--tm-border)',
                    ...pagePreviewStyle(p.key),
                  }}
                >
                  {selected && <Check className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--tm-accent)' }} />}
                </div>
                <span
                  className="text-xs mt-1 font-medium"
                  style={{ color: selected ? 'var(--tm-text-primary)' : 'var(--tm-text-secondary)' }}
                >
                  {p.label}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--tm-text-muted)' }}>
          The background behind your notes and panels.
        </p>
      </div>
    </div>
  );
};

export default AppearancePage;
