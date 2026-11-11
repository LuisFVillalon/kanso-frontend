'use client';

/**
 * Grouped-card settings, one line per setting: a small uppercase header over
 * a card of rows, each an icon, a one-line label and (usually) a switch. A
 * row's value, e.g. "Remind me · 2 h before", sits on a value row under it
 * that opens its choices in place. Used by Settings → Notifications.
 */

import React, { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** Where a row's label starts: the row's padding, the icon tile and the gap. Value rows line up with it. */
const LABEL_INSET = 'pl-[3.125rem]';

interface CardProps {
  /** The header's id, which labels the card. */
  id: string;
  title: string;
  /** Shown after the title in normal case, e.g. "private to you". */
  suffix?: string;
  children: React.ReactNode;
}

export const SettingsCard: React.FC<CardProps> = ({ id, title, suffix, children }) => (
  <section aria-labelledby={id} className="space-y-1.5">
    <h3 id={id} className="px-1 text-[0.6875rem] font-bold uppercase tracking-[0.05em] text-text-muted">
      {title}
      {suffix && <span className="font-medium normal-case tracking-normal"> · {suffix}</span>}
    </h3>
    <div
      className="rounded-xl border bg-surface-raised divide-y divide-border-subtle overflow-hidden"
      style={{ borderColor: 'var(--tm-border)' }}
    >
      {children}
    </div>
  </section>
);

interface SwitchProps {
  on: boolean;
  onToggle: () => void;
  labelledBy: string;
  disabled?: boolean;
}

export const SettingsSwitch: React.FC<SwitchProps> = ({ on, onToggle, labelledBy, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-labelledby={labelledBy}
    onClick={onToggle}
    disabled={disabled}
    className="relative shrink-0 w-10 h-6 rounded-full transition-colors disabled:opacity-40"
    style={{ backgroundColor: on ? 'var(--tm-accent)' : 'var(--tm-border)' }}
  >
    <span
      aria-hidden="true"
      className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform"
      style={{ transform: on ? 'translateX(1rem)' : 'none', boxShadow: 'var(--tm-shadow-sm)' }}
    />
  </button>
);

interface RowProps {
  icon: LucideIcon;
  label: string;
  /** Labels the row's switch. */
  labelId: string;
  /** A short muted line under the label, e.g. why the switch is greyed out. */
  sub?: string;
  /** Muted text before the switch, e.g. "Sundays". */
  trailing?: string;
  /** Leaves the trailing text out on a phone, where the row has no room for it beside a long label. */
  trailingFromSm?: boolean;
  /** The row's switch; leave out for a row with nothing to switch. */
  toggle?: Omit<SwitchProps, 'labelledBy'>;
}

export const SettingsRow: React.FC<RowProps> = ({ icon: Icon, label, labelId, sub, trailing, trailingFromSm, toggle }) => (
  <div className="flex items-center gap-2.5 px-3 py-1.5 min-h-11 sm:min-h-10">
    <span
      aria-hidden="true"
      className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg"
      style={{ backgroundColor: 'var(--tm-accent-subtle)', color: 'var(--tm-accent)' }}
    >
      <Icon className="w-[15px] h-[15px]" />
    </span>
    <div className="flex-1 min-w-0">
      <p id={labelId} className="text-sm font-medium text-text-primary truncate">{label}</p>
      {sub && <p className="text-xs text-text-muted truncate">{sub}</p>}
    </div>
    {trailing && (
      <span className={`shrink-0 text-[0.8125rem] text-text-muted ${trailingFromSm ? 'hidden sm:inline' : ''}`}>{trailing}</span>
    )}
    {toggle && <SettingsSwitch {...toggle} labelledBy={labelId} />}
  </div>
);

interface ValueRowProps {
  /** On the left, e.g. "Remind me". */
  label: string;
  /** On the right in the accent color, e.g. "2 h before". */
  value: string;
  /** The choices, shown under the row while it is open. */
  children: React.ReactNode;
}

/** A value under a row's label that opens its choices in place when tapped. */
export const SettingsValueRow: React.FC<ValueRowProps> = ({ label, value, children }) => {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className={`${LABEL_INSET} pr-3`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 py-2 min-h-11 sm:min-h-10 text-sm text-left"
      >
        <span className="text-text-secondary">{label}</span>
        <span className="flex items-center gap-1 font-medium min-w-0" style={{ color: 'var(--tm-accent)' }}>
          <span className="truncate">{value}</span>
          <ChevronDown aria-hidden className={`w-4 h-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open && <div id={panelId} className="pb-3 space-y-2">{children}</div>}
    </div>
  );
};

/** A row's extra controls, indented to the label column, e.g. the quiet-hours times. */
export const SettingsSubRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className={`${LABEL_INSET} pr-3 py-2`}>{children}</div>
);
