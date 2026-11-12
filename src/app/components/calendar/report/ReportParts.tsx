import React from 'react';
import { UNTAGGED_KEY, type TagRow } from '@/app/utils/tagReport';
import { rowColor } from './ReportTagBreakdown';

/** Small pieces the Productivity views' cards share. */

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One of a card's metric switch buttons, in a `role="group"` row. */
export const MetricButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
      active ? 'bg-surface-raised text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
    }`}
  >
    {children}
  </button>
);

export const EmptyLine: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-xs sm:text-sm text-text-muted italic py-2">{children}</p>
);

export const ProgressRow: React.FC<{ label: string; detail: string; share: number; color: string }> = ({ label, detail, share, color }) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs sm:text-sm text-text-secondary">{label}</span>
      <span className="text-xs sm:text-sm font-semibold text-text-primary whitespace-nowrap">{detail}</span>
    </div>
    <span className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--tm-surface-raised)' }} aria-hidden="true">
      <span className="block h-full rounded-full" style={{ width: `${Math.min(share, 1) * 100}%`, backgroundColor: color }} />
    </span>
  </div>
);

/** "Showing ▪ CS 460": the tag a list is narrowed to. */
export const TagFilterLabel: React.FC<{ tag: TagRow }> = ({ tag }) => (
  <span className="inline-flex items-center gap-1.5 min-w-0 text-xs text-text-muted">
    Showing
    <span className="inline-flex items-center gap-1.5 min-w-0 px-2 py-0.5 rounded-full border border-border-strong bg-surface-raised text-text-primary">
      <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ backgroundColor: rowColor(tag) }} aria-hidden="true" />
      <span className={`truncate ${tag.key === UNTAGGED_KEY ? 'italic' : ''}`}>{tag.name}</span>
    </span>
  </span>
);
