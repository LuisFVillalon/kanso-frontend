import React from 'react';
import { LayoutGrid, Brain, LineSquiggle, type LucideIcon } from 'lucide-react';

export type AppMode = 'normal' | 'focus' | 'doodle';

interface ModeOption {
  key: AppMode;
  icon: LucideIcon;
  label: string;
  title: string;
}

const MODES: ModeOption[] = [
  { key: 'normal', icon: LayoutGrid, label: 'Overview', title: 'Show debrief, calendar & stats' },
  { key: 'focus', icon: Brain, label: 'Focus', title: 'Focus — hide debrief & calendar, just tasks & notes' },
  { key: 'doodle', icon: LineSquiggle, label: 'Doodle', title: 'Doodle on the page' },
];

interface ModeSwitcherProps {
  mode: AppMode;
  onChange: (mode: AppMode) => void;
  /** Shows each mode's name beside its icon; icon-only otherwise. */
  labels?: boolean;
  className?: string;
}

// Three-way segmented control: exactly one of normal/focus/doodle is active
// at all times, with a sliding accent pill (the user's theme color) marking
// the current selection. Its three columns share the width equally, so it
// can stretch to fill a row (full width on phones).
const ModeSwitcher: React.FC<ModeSwitcherProps> = ({ mode, onChange, labels = false, className = '' }) => {
  const activeIndex = MODES.findIndex(m => m.key === mode);

  return (
    <div
      role="group"
      aria-label="View mode"
      className={`relative inline-grid grid-cols-3 p-1 rounded-full ${className}`}
      style={{ backgroundColor: 'var(--tm-surface-raised)' }}
    >
      <div
        aria-hidden
        className="absolute top-1 bottom-1 left-1 rounded-full transition-transform ease-out"
        style={{
          width: 'calc((100% - 8px) / 3)',
          backgroundColor: 'var(--tm-accent)',
          transform: `translateX(${activeIndex * 100}%)`,
          transitionDuration: 'var(--tm-dur-base)',
        }}
      />
      {MODES.map(({ key, icon: Icon, label, title }) => {
        const active = mode === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            aria-label={labels ? undefined : label}
            title={title}
            onClick={() => onChange(key)}
            className={`relative z-10 flex items-center justify-center gap-1.5 py-2 rounded-full transition-colors duration-150 ${labels ? 'px-3.5 text-[0.8125rem] font-medium' : 'px-3'}`}
            style={{ color: active ? 'var(--tm-accent-text)' : 'var(--tm-text-muted)' }}
          >
            <Icon className="w-4 h-4 flex-shrink-0" aria-hidden />
            {labels && <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
};

export default ModeSwitcher;
