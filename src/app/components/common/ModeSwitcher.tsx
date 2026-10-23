'use client';

import React, { useLayoutEffect, useRef, useState } from 'react';
import { LayoutGrid, LineSquiggle } from 'lucide-react';
import { KansoKeyIcon } from '@/app/components/common/KansoLogo';
import { longPressTip } from '@/app/components/common/longPressTip';
import { useKeyPress } from '@/app/hooks/useKeyPress';

export type AppMode = 'normal' | 'focus' | 'doodle';

interface ModeOption {
  key: AppMode;
  icon: React.FC<{ className?: string }>;
  label: string;
}

const MODES: ModeOption[] = [
  { key: 'normal', icon: LayoutGrid, label: 'Overview' },
  { key: 'focus', icon: KansoKeyIcon, label: 'Focus' },
  { key: 'doodle', icon: LineSquiggle, label: 'Doodle' },
];

interface ModeSwitcherProps {
  mode: AppMode;
  onChange: (mode: AppMode) => void;
  className?: string;
}

// Three-way segmented control: exactly one of normal/focus/doodle is active
// at all times, with a sliding accent pill (the user's theme color) marking
// the current selection. The selected mode shows its name beside its icon;
// the others are icon-only, named by a tooltip, so the pill measures the
// selected segment to fit it. Each one presses like a key when clicked.
const ModeSwitcher: React.FC<ModeSwitcherProps> = ({ mode, onChange, className = '' }) => {
  const { press, pressing } = useKeyPress<AppMode>();
  const groupRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const measure = () => {
      const active = group.querySelector<HTMLElement>('button[aria-pressed="true"]');
      if (active) setPill({ left: active.offsetLeft, width: active.offsetWidth });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(group);
    return () => observer.disconnect();
  }, [mode]);

  return (
    <div
      ref={groupRef}
      role="group"
      aria-label="View mode"
      className={`relative inline-flex p-1 rounded-full ${className}`}
      style={{ backgroundColor: 'var(--tm-surface-raised)' }}
    >
      {pill && (
        <div
          aria-hidden
          className="absolute top-1 bottom-1 left-0 rounded-full transition-[transform,width] ease-out"
          style={{
            width: pill.width,
            backgroundColor: 'var(--tm-accent)',
            transform: `translateX(${pill.left}px)`,
            transitionDuration: 'var(--tm-dur-base)',
          }}
        />
      )}
      {MODES.map(({ key, icon: Icon, label }) => {
        const active = mode === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            aria-label={label}
            data-tip={active ? undefined : label}
            {...longPressTip}
            onClick={() => { press(key); onChange(key); }}
            className={`relative z-10 flex items-center justify-center gap-1.5 h-8 rounded-full text-[0.8125rem] font-medium whitespace-nowrap transition-colors duration-150 ${active ? 'px-3.5' : 'px-2.5'} ${pressing(key) ? 'key-press-play' : ''}`}
            style={{ color: active ? 'var(--tm-accent-text)' : 'var(--tm-text-muted)' }}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {active && <span aria-hidden>{label}</span>}
          </button>
        );
      })}
    </div>
  );
};

export default ModeSwitcher;
